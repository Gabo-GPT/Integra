# Integra Backend

API que sirve el frontend y guarda los datos en Supabase (producción) o archivo local (desarrollo).

## Estructura

```
server/
├── config/       → Configuración (env, Supabase)
├── lib/          → Lógica de almacenamiento
├── routes/       → Endpoints API
├── index.js      → Entrada principal
├── package.json
└── .env.example  → Plantilla de variables
```

## Local

```bash
npm install
# Opcional: crear .env con SUPABASE_URL y SUPABASE_SERVICE_KEY
npm start
```

Sin variables Supabase → datos en `data/integra.json`

## Publicar

**Render** (recomendado, gratis): conecta GitHub, root `server`, añade variables `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`.

Ver `GUIA_PUBLICAR.md` en la raíz del proyecto.
