# Despliegue de Integra en Azure

Guía para desplegar Integra como **Azure Static Web App** con **Azure Functions** como API, usando la extensión de Azure en VS Code.

---

## Equivalencia Render → Azure

| Render (render.yaml)   | Azure                         |
|------------------------|-------------------------------|
| `type: web`            | Static Web App + API         |
| `runtime: node`        | `apiRuntime: node:20`        |
| `rootDir: server`      | Carpeta `api/`                |
| `buildCommand: npm install` | Automático en deploy      |
| `startCommand: npm start`   | Serverless (Azure Functions) |

---

## Prerrequisitos

- Cuenta de Azure ([crear gratis](https://azure.microsoft.com/free/))
- GitHub con tu repositorio Integra
- [Visual Studio Code](https://code.visualstudio.com/)
- Extensión [Azure Static Web Apps](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurestaticwebapps) en VS Code

---

## Paso 1: Crear el recurso en Azure

### Opción A: Desde VS Code

1. Abre VS Code y la carpeta del proyecto Integra.
2. Pulsa **F1** y busca: `Azure Static Web Apps: Create Static Web App...`
3. Elige tu suscripción de Azure.
4. Escribe un nombre para la app (ej: `integra`).
5. Elige la región más cercana (ej: `East US` o `West Europe`).
6. Pulsa **Create new GitHub repository** o selecciona el existente.
7. Selecciona la rama principal (`main` o `master`).
8. En **Preset** elige: **Custom**.
9. Confirma los valores por defecto:
   - **App location:** `/` (o `.`)
   - **Api location:** `api`
   - **Output location:** (dejar vacío)

VS Code creará el recurso en Azure y el workflow de GitHub Actions. Si usa un repo existente, deberás añadir el secreto manualmente (ver Paso 2).

---

### Opción B: Desde Azure Portal

1. Entra a [portal.azure.com](https://portal.azure.com).
2. Busca **Static Web Apps** y crea una nueva.
3. Configura:
   - Suscripción
   - Grupo de recursos
   - Nombre: `integra`
   - Plan: Free
   - Origen: GitHub
   - Conecta tu cuenta y selecciona el repo de Integra
   - Rama: `main`
   - Build Preset: **Custom**
   - App location: `/`
   - Api location: `api`
   - Output location: *(vacío)*

4. Revisa y crea.

---

## Paso 2: Configurar el secreto de GitHub

Azure generará un token de API. Debes guardarlo como secreto en GitHub:

1. En [GitHub](https://github.com) → tu repo **integra** → **Settings** → **Secrets and variables** → **Actions**.
2. Pulsa **New repository secret**.
3. Nombre: `AZURE_STATIC_WEB_APPS_API_TOKEN`
4. Valor: pega el token que te mostró Azure al crear el Static Web App (o en Portal: Static Web App → **Manage deployment token**).

---

## Paso 3: Configurar variables de entorno (API)

Si usas **Supabase** como backend:

1. En Azure Portal → tu **Static Web App** → **Configuration** → **Application settings**.
2. Añade:
   - `SUPABASE_URL`: URL de tu proyecto Supabase.
   - `SUPABASE_SERVICE_KEY`: Service Role Key de Supabase.
3. Guarda.

**Tabla Supabase** (si usas Supabase): crea una tabla `integra_data` con columnas `id` (text, PK), `value` (jsonb). Inserta una fila con `id = 'main'` y `value = '{}'` para iniciar.

> **Nota:** Sin Supabase, la API usará almacenamiento en memoria (los datos no se conservan entre reinicios en frío). Para producción se recomienda Supabase u otra base de datos.

---

## Paso 4: Desplegar

### Con la extensión de Azure en VS Code

1. Abre la barra lateral **Azure** (icono de nube).
2. Expande **Static Web Apps** y localiza tu app.
3. Clic derecho en la app → **Deploy to Static Web App...**
4. Confirma el flujo de despliegue.

### Con Git

1. Haz commit y push:

```bash
git add .
git commit -m "Configuración Azure Static Web App"
git push origin main
```

2. El workflow `.github/workflows/azure-static-web-apps.yml` se ejecutará.
3. Ve a **Actions** en GitHub para ver el progreso.

---

## Paso 5: Abrir la aplicación

Cuando termine el deploy:

1. En VS Code: clic derecho en la Static Web App → **Open in Portal**.
2. En el Portal: **Overview** → **URL**.
3. O en GitHub Actions, en el resumen del último workflow.

La URL tendrá forma: `https://<nombre>.azurestaticapps.net`

---

## Estructura del proyecto para Azure

```
integra/
├── api/                    # Azure Functions (API)
│   ├── src/
│   │   ├── functions/
│   │   │   ├── data.js     # GET/PUT/PATCH /api/data
│   │   │   └── health.js   # GET /api/health
│   │   ├── storage.js
│   │   └── index.js
│   ├── host.json
│   ├── package.json
│   └── local.settings.json
├── .github/workflows/
│   └── azure-static-web-apps.yml
├── staticwebapp.config.json
├── index.html
├── js/
├── css/
└── server/                 # (solo para despliegue local/Render)
```

---

## Prueba local con SWA CLI

```bash
npm install -g @azure/static-web-apps-cli
cd c:\Users\Sistemas\integra
swa start . --api-location api
```

Luego abre `http://localhost:4280`.

---

## Solución de problemas

| Problema | Posible causa |
|----------|---------------|
| 404 en `/api/data` | Revisa que `api_location: "api"` en el workflow y que existe la carpeta `api/`. |
| “Sin conexión” en la app | Comprueba que la URL base de la API es la del Static Web App y que Supabase está configurado en Application settings. |
| Error de build en GitHub | Revisa que `api/package.json` y sus dependencias estén correctos. |
| Datos no persisten | Configura Supabase (o tu backend) en Application settings. |

---

## Referencias

- [Azure Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/)
- [API con Azure Functions en SWA](https://learn.microsoft.com/azure/static-web-apps/add-api)
- [Extensión Azure Static Web Apps en VS Code](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurestaticwebapps)
