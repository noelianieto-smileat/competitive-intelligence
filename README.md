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
En `config.js` pega **Project URL** y **anon key** (Supabase → Project Settings → API). Nunca la `service_role`.

### 4. Publicar en GitHub
Sube todo **excepto `private/`** → Settings → Pages → rama `main`, carpeta `/ (root)`.

## Uso
- Todo el equipo: leer, cambiar estado, comentar con fotos (máx. 6 por comentario), borrar lo suyo.
- Administradores (tabla `app_admins`): además crean/editan contenido y borran cualquier comentario.
- **Nuevo mes:** inserta una fila en `editions` (día 1 del mes) y las novedades en `items` (SQL o *Table Editor*); las imágenes, en el bucket `contenido`.

## Seguridad
- El dominio se comprueba en el servidor (políticas RLS), no solo en la web.
- Autor y fecha los fija el servidor; no se pueden falsificar.
- Buckets privados con URLs firmadas temporales.
- El contenido que escribe un administrador se muestra como HTML: solo debe tener acceso de administrador quien sea de confianza.

## Limitaciones conocidas
- Los proyectos gratuitos de Supabase **se pausan tras ~7 días sin actividad** (se reactivan desde el panel) y no tienen copias de seguridad automáticas.
- Fase 2 (pendiente): newsletter mensual con borrador generado a partir de las novedades del mes y aprobación antes de enviar.
