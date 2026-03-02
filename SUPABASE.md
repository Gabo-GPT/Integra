# Integra + Supabase

Guía para conectar Integra con Supabase como base de datos.

## 1. Crear proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea cuenta.
2. **New Project** → Nombre: `integra`, contraseña de DB (guárdala).
3. Espera a que termine el despliegue.

## 2. Crear la tabla

1. En el dashboard: **SQL Editor** → **New query**
2. Pega el contenido de `supabase/schema.sql`
3. **Run** para ejecutar

```sql
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read write" ON app_data
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO app_data (key, value) VALUES ('integra_data', '{}')
ON CONFLICT (key) DO NOTHING;
```

## 3. Obtener credenciales

1. **Settings** → **API**
2. Copia:
   - **Project URL** (ej: `https://xxxxx.supabase.co`)
   - **anon public** key (o **service_role** si quieres bypass RLS)

## 4. Configurar variables de entorno

Crea o edita `.env` en la raíz del proyecto:

```env
PORT=3000
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 5. Ejecutar localmente

```cmd
cd C:\Users\Sistemas\integra-local
npm install
npm start
```

Abre `http://localhost:3000`. Los datos se guardarán en Supabase.

## 6. Desplegar en la nube

Supabase solo guarda datos. Para la **URL pública** del frontend:

### Opción A: Render (recomendado)

1. [render.com](https://render.com) → **New** → **Web Service**
2. Conecta tu repo de GitHub (Gabo-GPT/Integra)
3. **Environment** → Añade:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. **Create Web Service** → Obtendrás una URL (ej: `https://integra.onrender.com`)

### Opción B: Vercel

1. [vercel.com](https://vercel.com) → Import repo
2. **Environment Variables** → Añade `SUPABASE_URL` y `SUPABASE_ANON_KEY`
3. Para Node.js (server.js), considera usar **Vercel Serverless Functions** o despliega en Render.

## 7. Seguridad (producción)

- Usa **Row Level Security** y ajusta las políticas según tu caso.
- No expongas `service_role` en el frontend.
- Configura dominios permitidos en Supabase → **Authentication** → **URL Configuration**.

## Resumen

| Componente    | Dónde                    |
|---------------|--------------------------|
| Base de datos | Supabase (PostgreSQL)    |
| Frontend + API| Render / Vercel / Railway|
| URL pública   | La que te dé el hosting  |
