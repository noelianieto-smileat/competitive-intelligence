# Smileat Competitive Intelligence (herramienta interna)

Web con acceso solo para cuentas **@smileat.com**: novedades de la competencia por categoría y mes, estados (nuevo / revisado / utilizado / descartado) y comentarios con fotos.

**Cómo funciona.** La web (HTML/JS) vive en GitHub Pages. El contenido, los estados, los comentarios y las imágenes viven en **Supabase** y solo se pueden leer con sesión de Google @smileat.com. Por eso el repositorio de GitHub puede ser público: no contiene contenido, solo la "carcasa".

> La carpeta `private/` (datos iniciales y capturas) **no se sube a GitHub** (está en `.gitignore`).

## Puesta en marcha (una sola vez, ~30 min)

### 1. Supabase
1. Crea un proyecto en https://supabase.com (cuenta de empresa, no personal).
2. **SQL Editor** → pega todo `supabase/schema.sql` → Run.
3. En el mismo editor, ejecuta (con tu correo): `insert into public.app_admins (email) values ('tu.correo@smileat.com');`
4. Pega y ejecuta `private/seed.sql` (carga la edición de octubre 2026 y las 20 novedades).
5. **Storage → contenido**: sube la carpeta `private/inspo` entera (debe quedar `inspo/archivo.png`).

### 2. Google (inicio de sesión)
1. Google Cloud Console → proyecto nuevo → *APIs y servicios → Pantalla de consentimiento de OAuth* → tipo de usuario **Interno** (requiere Google Workspace; así solo entra gente de la organización).
2. *Credenciales → ID de cliente OAuth → Aplicación web*. URI de redirección autorizado: `https://<ref-proyecto>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google**: activa y pega Client ID y Secret.
4. Desactiva el proveedor **Email** (para que nadie entre con correo y contraseña).
5. **Authentication → URL Configuration**: Site URL y Redirect URLs = la URL de tu GitHub Pages (p. ej. `https://tuusuario.github.io/competitive-intelligence/`).

### 3. Configurar la web
En `config.js` pega **Project URL** y la clave pública (*anon* o *publishable*; Supabase → Project Settings → API). Nunca la `secret` / `service_role`.

### 4. Publicar en GitHub
Sube todo **excepto `private/`** → Settings → Pages → rama `main`, carpeta `/ (root)`.

## Uso
- **Portada = galería.** Tarjetas con foto, título y marca; filtros por categoría, mes, estado y buscador. Al hacer clic se abre el detalle completo, el estado y los comentarios.
- **Añadir novedades desde la web** (todo el equipo @smileat.com): botón *+ Añadir novedad* → fotos (máx. 8; la primera es la portada), categoría, título, marca, mercado, fecha, enlace, resumen y detalle. Cada persona edita y elimina las suyas.
- Administradores (tabla `app_admins`): además editan/eliminan cualquier novedad (también el contenido inicial) y borran cualquier comentario.
- **Mes nuevo:** no hace falta crear nada; la edición del mes se crea sola al añadir una novedad con fecha de ese mes.
- **Actualizar una instalación que ya funciona:** ejecuta de nuevo `supabase/schema.sql` completo en el SQL Editor (es idempotente) y sube los archivos nuevos a GitHub.

## Seguridad
- El dominio se comprueba en el servidor (políticas RLS), no solo en la web.
- Autor y fecha los fija el servidor; no se pueden falsificar.
- Buckets privados con URLs firmadas temporales.
- Lo que escribe el equipo se muestra siempre como texto (nunca como HTML). El HTML solo existe en el contenido inicial cargado por administradores.
- En `config.js` va SOLO la clave pública (*anon* / *publishable*). La *secret* / *service_role* no debe salir nunca de Supabase: GitHub bloquea el guardado si la detecta.

## Limitaciones conocidas
- Los proyectos gratuitos de Supabase **se pausan tras ~7 días sin actividad** (se reactivan desde el panel) y no tienen copias de seguridad automáticas.
- Fase 2 (pendiente): newsletter mensual con borrador generado a partir de las novedades del mes y aprobación antes de enviar.
