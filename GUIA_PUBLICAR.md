# Guía para publicar Integra con base de datos

Esta guía te lleva paso a paso para que la aplicación Integra guarde todo en el servidor (en archivos/BD) y puedas publicarla.

---

## ¿Qué vamos a crear?

1. **Backend** (servidor Node.js) que guarda los datos en `server/data/integra.json`
2. El mismo servidor **sirve el frontend** (index.html, CSS, JS) — todo en uno
3. **Publicación** en Render.com u otro hosting

---

## Paso 1: Instalar Node.js

Si no tienes Node.js:

1. Ve a https://nodejs.org
2. Descarga la versión LTS
3. Instálalo (siguiente, siguiente…)
4. Abre una terminal y escribe: `node -v` — debe mostrar algo como `v20.x.x`

---

## Paso 2: Crear la base de datos (backend)

### 2.1 Instalar dependencias del servidor

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
cd server
npm install
```

### 2.2 Probar el servidor

```bash
npm start
```

Deberías ver:
```
  Integra - Backend API
  ====================
  Servidor corriendo en: http://localhost:3000
```

Los datos se guardan en `server/data/integra.json`. Esa carpeta se crea sola la primera vez que guardes algo.

---

## Paso 3: Conectar el frontend al backend

### 3.1 Editar la configuración

Abre `index.html` y busca esta línea:

```html
<!-- <script>window.INTEGRA_API_URL = 'http://localhost:3000';</script> -->
```

Quita los `<!--` y `-->` para activarla:

```html
<script>window.INTEGRA_API_URL = 'http://localhost:3000';</script>
```

### 3.2 Probar en local

1. Deja el servidor corriendo (`npm start` en `server/`)
2. Abre `index.html` en el navegador (o usa “Live Server” en VS Code)
3. Regístrate, crea datos… y verifica que en `server/data/` aparezca el archivo `integra.json`

---

## Paso 4: Publicar (desplegar)

El servidor **incluye ya el frontend** (HTML, CSS, JS). Solo necesitas publicar **un servicio**.

### Opción A: Render.com (gratis, recomendado)

1. Crea cuenta en https://render.com
2. Sube tu proyecto a **GitHub** (crea un repositorio y sube la carpeta `integra`)
3. En Render: **New → Web Service**
4. Conecta tu repositorio de GitHub
5. Configura:
   - **Name**: `integra` (o el que prefieras)
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Clic en **Create Web Service**
7. Espera el deploy. Tu app quedará en una URL como: `https://integra-xxxx.onrender.com`

**Nota**: En el plan gratuito, Render "duerme" el servicio tras 15 min sin uso. Los datos se guardan en disco; al despertar pueden tardar unos segundos en cargar.

### Opción B: Con render.yaml (Blueprint)

Si ya subiste el proyecto a GitHub, en Render puedes usar **New → Blueprint** y seleccionar el repo. El archivo `render.yaml` en la raíz del proyecto ya está configurado.

### Opción C: Servidor propio (VPS, tu empresa)

1. Sube toda la carpeta del proyecto al servidor
2. Instala Node.js
3. Ejecuta:
   ```bash
   cd server
   npm install
   npm start
   ```
4. Configura Nginx/IIS para hacer proxy hacia el puerto 3000 (o el que uses)

### Opción D: Railway

1. Conecta tu repo en https://railway.app
2. New Project → Deploy from GitHub
3. Root: `server`, Start: `npm start`

---

## Paso 5: Resumen de archivos

```
integra/
├── index.html          ← Web principal
├── css/
├── js/
├── server/             ← Backend
│   ├── index.js        ← Código del servidor
│   ├── package.json
│   └── data/           ← Aquí se crea integra.json (los datos)
│       └── integra.json
└── GUIA_PUBLICAR.md    ← Esta guía
```

---

## Respaldo de datos

Para hacer copia de seguridad:

- Copia el archivo `server/data/integra.json` a otro sitio
- Para restaurar, sustituye ese archivo y reinicia el servidor

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| "Cannot GET /api/data" | El backend no está corriendo. Ejecuta `npm start` en `server/` |
| CORS / bloqueos en el navegador | El backend usa CORS; asegúrate de que la URL en `INTEGRA_API_URL` sea la correcta |
| No se guardan datos | Revisa que `INTEGRA_API_URL` esté definida y sin comentarios en `index.html` |
| Puerto en uso | Cambia el puerto: `set PORT=4000` (Windows) o `PORT=4000 npm start` (Linux/Mac) |

---

## Usar solo en local (sin base de datos)

Si no activas `INTEGRA_API_URL`, la app sigue usando **localStorage** como antes: todo se guarda en el navegador, sin servidor.
