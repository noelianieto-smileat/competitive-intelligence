-- =====================================================================
-- Smileat Competitive Intelligence · esquema de base de datos (Supabase)
-- Ejecutar COMPLETO en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin riesgo (es idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Quién puede entrar
--    Solo cuentas de Google con correo @smileat.com. Se comprueba en el
--    servidor, en cada consulta, no solo en la web.
-- ---------------------------------------------------------------------
create or replace function public.is_smileat() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') ~* '^[^@[:space:]]+@smileat\.com$'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google';
$$;

-- Administradores: pueden crear y editar contenido y borrar cualquier comentario.
create table if not exists public.app_admins (
  email text primary key check (email = lower(email))
);
alter table public.app_admins enable row level security;   -- sin políticas: solo lo lee la función

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_smileat()
     and exists (select 1 from public.app_admins a
                 where a.email = lower(auth.jwt() ->> 'email'));
$$;

revoke execute on function public.is_smileat() from public, anon;
revoke execute on function public.is_admin()   from public, anon;
grant  execute on function public.is_smileat() to authenticated;
grant  execute on function public.is_admin()   to authenticated;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
-- Ediciones mensuales (una por mes): título y resumen de la portada.
create table if not exists public.editions (
  month        date primary key check (extract(day from month) = 1),
  title        text not null,
  summary_html text,
  created_at   timestamptz not null default now()
);

-- Contenido: noticias, campañas, eventos, anuncios y tendencias.
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  edition     date not null references public.editions(month),
  category    text not null check (category in
                ('innovacion','trade','marketing-eventos','publicidad-digital')),
  kind        text not null default 'noticia' check (kind in
                ('noticia','campana','evento','anuncio','tendencia')),
  title       text not null,
  summary     text,
  body_html   text,
  brand       text,
  market      text,
  date_label  text,
  event_date  date,
  sources     jsonb not null default '[]',
  images      jsonb not null default '[]',   -- [{path, caption}] en el bucket "contenido"
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists items_edition_cat_idx on public.items (edition, category, sort);

-- Estado compartido por todo el equipo: nuevo / revisado / utilizado / descartado.
create table if not exists public.item_status (
  item_id          uuid primary key references public.items(id) on delete cascade,
  status           text not null default 'nuevo'
                     check (status in ('nuevo','revisado','utilizado','descartado')),
  used_in          text check (char_length(used_in) <= 300),
  updated_by       uuid references auth.users(id) on delete set null,
  updated_by_email text,
  updated_at       timestamptz not null default now()
);

-- Comentarios con inspiración y fotos.
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_email text,
  author_name  text,
  kind         text not null default 'inspiracion'
                 check (kind in ('inspiracion','idea','duda','nota')),
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  photos       text[] not null default '{}' check (cardinality(photos) <= 6),
  created_at   timestamptz not null default now()
);
create index if not exists comments_item_idx on public.comments (item_id, created_at);

-- ---------------------------------------------------------------------
-- 3. Autoría a prueba de manipulación (la fija el servidor, no la web)
-- ---------------------------------------------------------------------
create or replace function public.stamp_status() returns trigger
language plpgsql as $$
begin
  new.updated_by       := auth.uid();
  new.updated_by_email := lower(auth.jwt() ->> 'email');
  new.updated_at       := now();
  return new;
end $$;
drop trigger if exists stamp_status on public.item_status;
create trigger stamp_status before insert or update on public.item_status
  for each row execute function public.stamp_status();

create or replace function public.stamp_comment() returns trigger
language plpgsql as $$
begin
  new.user_id      := auth.uid();
  new.author_email := lower(auth.jwt() ->> 'email');
  new.author_name  := coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
                               split_part(lower(auth.jwt() ->> 'email'), '@', 1));
  return new;
end $$;
drop trigger if exists stamp_comment on public.comments;
create trigger stamp_comment before insert on public.comments
  for each row execute function public.stamp_comment();

-- ---------------------------------------------------------------------
-- 4. Reglas de acceso por filas (RLS)
-- ---------------------------------------------------------------------
alter table public.editions    enable row level security;
alter table public.items       enable row level security;
alter table public.item_status enable row level security;
alter table public.comments    enable row level security;

revoke all on all tables in schema public from anon;

-- Contenido: lo lee todo el equipo; solo los administradores lo modifican.
drop policy if exists editions_read  on public.editions;
drop policy if exists editions_admin on public.editions;
create policy editions_read  on public.editions for select to authenticated using (public.is_smileat());
create policy editions_admin on public.editions for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists items_read  on public.items;
drop policy if exists items_admin on public.items;
create policy items_read  on public.items for select to authenticated using (public.is_smileat());
create policy items_admin on public.items for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Estados: cualquier miembro del equipo los lee y los cambia.
drop policy if exists status_read   on public.item_status;
drop policy if exists status_insert on public.item_status;
drop policy if exists status_update on public.item_status;
create policy status_read   on public.item_status for select to authenticated using (public.is_smileat());
create policy status_insert on public.item_status for insert to authenticated with check (public.is_smileat());
create policy status_update on public.item_status for update to authenticated
  using (public.is_smileat()) with check (public.is_smileat());

-- Comentarios: todos leen; cada persona escribe y borra los suyos; un admin borra cualquiera.
-- Las fotos de un comentario solo pueden estar en la carpeta de su autor.
drop policy if exists comments_read   on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_read   on public.comments for select to authenticated using (public.is_smileat());
create policy comments_insert on public.comments for insert to authenticated with check (
  public.is_smileat()
  and user_id = auth.uid()
  and (select bool_and(p like auth.uid()::text || '/%') from unnest(photos) p) is not false
);
create policy comments_delete on public.comments for delete to authenticated using (
  public.is_smileat() and (user_id = auth.uid() or public.is_admin())
);

-- ---------------------------------------------------------------------
-- 5. Almacenamiento de imágenes (buckets privados)
--    contenido   → capturas de anuncios y fotos de las noticias (las sube un admin)
--    comentarios → fotos que adjunta el equipo en sus comentarios
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('contenido',   'contenido',   false, 10485760, array['image/png','image/jpeg','image/webp','image/gif']),
  ('comentarios', 'comentarios', false,  5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ci_leer               on storage.objects;
drop policy if exists ci_subir_comentarios  on storage.objects;
drop policy if exists ci_borrar_comentarios on storage.objects;
drop policy if exists ci_admin_contenido    on storage.objects;

create policy ci_leer on storage.objects for select to authenticated
  using (bucket_id in ('contenido','comentarios') and public.is_smileat());

create policy ci_subir_comentarios on storage.objects for insert to authenticated
  with check (bucket_id = 'comentarios' and public.is_smileat()
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy ci_borrar_comentarios on storage.objects for delete to authenticated
  using (bucket_id = 'comentarios' and public.is_smileat()
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy ci_admin_contenido on storage.objects for all to authenticated
  using (bucket_id = 'contenido' and public.is_admin())
  with check (bucket_id = 'contenido' and public.is_admin());

-- ---------------------------------------------------------------------
-- 6. Primer administrador  ← CAMBIA el correo y ejecuta esta línea
-- ---------------------------------------------------------------------
-- insert into public.app_admins (email) values ('tu.correo@smileat.com') on conflict do nothing;
