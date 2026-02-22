# Publicar Integra (gratis)

Ya tienes Supabase configurado. Solo falta **subir el backend** a un hosting gratuito. La opción más sencilla es **Render**.

---

## Opción 1: Render (recomendado — 3 pasos)

### Paso 1: Sube el proyecto a GitHub

Si aún no lo has hecho:

```bash
cd c:\Users\Sistemas\integra
git init
git add .
git commit -m "Integra - listo para publicar"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/integra.git
git push -u origin main
```

### Paso 2: Conecta con Render

1. Entra a **https://render.com** (cuenta gratis, sin tarjeta).
2. Clic en **New** → **Web Service**.
3. Conecta tu repositorio **integra** de GitHub.
4. Usa esta configuración:
   - **Name:** `integra`
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. En **Environment Variables**, añade:
   - `SUPABASE_URL` → tu Project URL de Supabase
   - `SUPABASE_SERVICE_KEY` → tu service_role key
6. Clic en **Create Web Service**.

### Paso 3: Usa la app

En unos minutos tendrás una URL como: `https://integra-e23d.onrender.com`

---

## Opción 2: Railway

1. **https://railway.app** → New Project → Deploy from GitHub.
2. Selecciona el repo `integra`.
3. En **Settings** → **Root Directory:** `server`.
4. En **Variables** añade `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`.
5. **Networking** → **Generate Domain**.

---

## Recordatorio: Supabase

En Supabase ya debes tener la tabla:

```sql
CREATE TABLE IF NOT EXISTS integra_data (
  id TEXT PRIMARY KEY DEFAULT 'main',
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Si no la tienes: **SQL Editor** → pega el código → **Run**.

---

## Nota sobre el plan gratuito de Render

Si la app no se usa durante unos 15 minutos, el servicio se “duerme”. La primera visita después puede tardar 30–60 segundos. Los datos no se pierden porque están en Supabase.
