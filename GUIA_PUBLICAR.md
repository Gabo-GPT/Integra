# Guía para publicar Integra (gratis, con persistencia)

Publica tu aplicación para que todos los agentes la usen sin perder datos. Usaremos **Render** (hosting) + **Supabase** (base de datos gratuita).

---

## Resumen

| Componente | Servicio   | Costo  |
|------------|------------|--------|
| Backend + Frontend | Render.com | Gratis |
| Base de datos      | Supabase   | Gratis |

**Importante:** En el plan gratuito de Render, el disco es efímero (se borra al reiniciar). Por eso usamos Supabase para guardar los datos de forma permanente.

---

## Paso 1: Crear base de datos en Supabase

1. Ve a https://supabase.com y crea una cuenta (gratis).
2. Clic en **New Project**:
   - **Name:** `integra`
   - **Database Password:** guarda esta contraseña (la necesitas para conexiones directas).
   - **Region:** elige la más cercana (ej. South America).
3. Espera a que se cree el proyecto (~2 min).

### Crear la tabla

1. En el proyecto, ve a **SQL Editor**.
2. Clic en **New query**.
3. Copia y pega el contenido de `server/supabase-setup.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS integra_data (
     id TEXT PRIMARY KEY DEFAULT 'main',
     value JSONB NOT NULL DEFAULT '{}'::jsonb,
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
4. Clic en **Run**.

### Obtener credenciales

1. Ve a **Project Settings** (icono engranaje) → **API**.
2. Anota:
   - **Project URL** (ej. `https://xxxxx.supabase.co`)
   - **service_role key** (en "Project API keys", la clave `service_role`, no la `anon`)

---

## Paso 2: Subir el proyecto a GitHub

1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio nuevo (ej. `integra`).
3. En la carpeta del proyecto, abre terminal y ejecuta:

```bash
cd c:\Users\Sistemas\integra
git init
git add .
git commit -m "Integra - publicación inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/integra.git
git push -u origin main
```

(Reemplaza `TU_USUARIO` por tu usuario de GitHub.)

---

## Paso 3: Desplegar en Render

1. Ve a https://render.com y crea una cuenta.
2. **New** → **Web Service**.
3. Conecta tu repositorio de GitHub (autoriza si te lo pide).
4. Configuración:
   - **Name:** `integra` (o el que prefieras)
   - **Region:** elige la más cercana.
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. En **Environment Variables** (Variables de entorno), agrega:
   - `SUPABASE_URL` → la Project URL de Supabase
   - `SUPABASE_SERVICE_KEY` → la clave service_role de Supabase
6. Clic en **Create Web Service**.
7. Espera el despliegue (~2–3 min).

Tu app quedará en una URL como: `https://integra-xxxx.onrender.com`

---

## Paso 4: Probar

1. Abre la URL de tu servicio (ej. `https://integra-xxxx.onrender.com`).
2. Regístrate, crea usuarios, agrega casos.
3. Cierra el navegador, abre de nuevo y entra con otro agente: los datos deben seguir ahí.

---

## Comportamiento del frontend

El frontend detecta automáticamente si está en HTTPS y usa esa misma URL como API. **No necesitas configurar nada** en `index.html` para producción.

---

## Plan gratuito de Render: “sueño” del servicio

En el plan gratuito, si nadie entra a la app durante **15 minutos**, Render “duerme” el servicio. La primera visita después de eso puede tardar **30–60 segundos** en cargar. Es normal. Los datos no se pierden porque están en Supabase.

---

## Usar solo en local (sin publicar)

1. En `server/`, ejecuta `npm install` y `npm start`.
2. Abre `http://localhost:3000`.
3. Sin variables de Supabase, los datos se guardan en `server/data/integra.json`.

---

## Respaldo de datos

- **Con Supabase:** En el dashboard de Supabase, puedes exportar la base de datos o hacer backups.
- **Con archivo local:** Copia `server/data/integra.json` a otro lugar.

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| "Cannot GET /api/data" | El backend no está corriendo o la URL es incorrecta. |
| Los datos no se guardan | Revisa que `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` estén bien en Render. |
| La app tarda mucho en cargar | Normal si el servicio estaba dormido. Espera 30–60 s. |
| Error al crear tabla en Supabase | Asegúrate de ejecutar el SQL en el proyecto correcto. |
