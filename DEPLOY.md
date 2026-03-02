# Guía de despliegue: Integra NOC

## 1. Actualizar cambios en GitHub

### Si ya tienes el repo en GitHub y trabajas desde esta carpeta

```powershell
# Abrir PowerShell en C:\Users\Sistemas\integra-local

# Ver si hay un repo git (si no hay .git, inicializar)
git status

# Si aparece "not a git repository", inicializar y conectar:
git init
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git

# Agregar todos los archivos
git add .

# Crear commit con los cambios
git commit -m "Actualización: Motor decisión, registro diagnóstico, migración portadora, Intermitencia"

# Enviar a GitHub (reemplaza main por tu rama si usas otra)
git push -u origin main
```

### Si ya tenías git configurado

```powershell
git add .
git status
git commit -m "Actualización: Motor decisión, registro diagnóstico, Intermitencia"
git push origin main
```

### Si GitHub te pide autenticación

- **Token**: Ve a GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic). Crea un token con scope `repo`. Úsalo como contraseña.
- **SSH**: Configura una clave SSH en GitHub y usa la URL `git@github.com:usuario/repo.git`.

---

## 2. Subir la app con URL (hosting)

### Opción A: Render (gratis, recomendado para empezar)

1. Entra a [render.com](https://render.com) y crea cuenta.
2. **New** → **Web Service**.
3. Conecta tu repositorio de GitHub.
4. Configuración:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: deja vacío (o la carpeta del proyecto si lo tienes en subcarpeta)
5. **Create Web Service**.
6. Te dará una URL tipo `https://tu-app.onrender.com`.

**Nota**: En plan gratis la app se "duerme" tras ~15 min sin uso. La primera visita puede tardar unos segundos.

---

### Opción B: Railway (aprox. 5 USD/mes, sin “sueño”)

1. Entra a [railway.app](https://railway.app) y crea cuenta.
2. **New Project** → **Deploy from GitHub repo**.
3. Selecciona tu repositorio.
4. Railway detecta Node.js automáticamente.
5. En **Settings** → **Networking** → **Generate Domain**.
6. URL tipo `https://tu-app.railway.app`.

---

### Opción C: Vercel (gratis, ideal para frontend)

1. Entra a [vercel.com](https://vercel.com) y crea cuenta.
2. **Add New** → **Project** → Importa tu repo de GitHub.
3. En **Framework Preset**: Other.
4. **Root Directory**: carpeta del proyecto si aplica.
5. **Build Command**: `npm install && npm run build` (o deja el default si no tienes build).
6. **Output Directory**: `.` o `public` según tu estructura.
7. Para Node.js (API) necesitas funciones serverless; Vercel es más para frontend estático.

---

## 3. Base de datos y persistencia

### Situación actual

- Los datos se guardan en **localStorage** del navegador y se sincronizan con el servidor.
- El servidor implementa `GET /api/data` y `PUT /api/data` para persistir en `data/integra_data.json`.
- En Render/Railway la carpeta `data/` persiste entre reinicios. En un **redeploy** (nuevo commit), el disco puede reiniciarse y se pierden los datos del archivo. Para datos permanentes usa base de datos.

### Opción 1: Base de datos gratuita (Supabase)

1. Crea cuenta en [supabase.com](https://supabase.com).
2. Crea un proyecto.
3. Obtén la **URL** y la **anon key** en Settings → API.
4. Crea una tabla para datos (por ejemplo `integra_data` con columnas `key`, `value`).
5. El cambio requiere adaptar `server.js` para usar la API de Supabase en lugar de archivo local. Si quieres, se puede diseñar esa parte.

### Opción 2: Base de datos de pago (Railway, Render, Neon)

- **Railway**: PostgreSQL desde ~5 USD/mes.
- **Render**: PostgreSQL desde ~7 USD/mes.
- **Neon** ([neon.tech](https://neon.tech)): PostgreSQL con tier gratuito y planes de pago.

---

## 4. Dominio propio (opcional)

1. Compra un dominio (por ejemplo en Namecheap, GoDaddy, Google Domains).
2. En tu plataforma (Render/Railway/Vercel):
   - **Settings** → **Custom Domain**.
   - Añade tu dominio y configura los registros DNS (CNAME o A) según las instrucciones.

---

## 5. Variables de entorno (producción)

Crea un archivo `.env` o configura las variables en el panel de tu plataforma:

```env
PORT=3000
# Si usas base de datos:
# DATABASE_URL=postgresql://...
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_KEY=xxx
```

En Render: **Environment** → Add environment variables.  
En Railway: **Variables** → Add variable.

---

## 6. Resumen rápido

| Paso | Acción |
|------|--------|
| 1 | `git add .` → `git commit -m "mensaje"` → `git push` |
| 2 | Conectar repo en Render o Railway |
| 3 | Asignar dominio automático (`.onrender.com` o `.railway.app`) |
| 4 | (Opcional) Añadir base de datos (Supabase, PostgreSQL, etc.) |
| 5 | (Opcional) Configurar dominio propio |

---

¿Quieres que te guíe para añadir Supabase o PostgreSQL en el código?
