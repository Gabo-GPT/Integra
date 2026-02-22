# Integra - Dashboard de Formación

Aplicativo interno de gestión de formación con KPIs en tiempo real. Diseño futurista y **optimizado para bajo consumo** de recursos.

## Características

- **Dashboard principal**
  - Nota de certificación (donut CSS puro)
  - Estatus del preturno
  - Acceso rápido a Calidad

- **Sección Calidad**
  - Reincidencias en la operación
  - Agentes que más cierran
  - Agentes que menos cierran

## Cómo ejecutar

1. Abrir `index.html` directamente en el navegador, o
2. Servir la carpeta con un servidor estático:
   ```bash
   cd integra
   npx serve .
   ```

## Optimizaciones de rendimiento

- **Sin Chart.js**: Gráficos donut y barras con CSS `conic-gradient` y flex/width
- **Sin frameworks**: JavaScript vanilla, carga mínima
- **Cache de DOM**: Referencias cacheadas en variables para evitar `querySelector` repetidos
- **Event delegation**: Un solo listener para toda la navegación
- **Debounce** en búsqueda (300ms)
- **Actualización mínima**: Solo el bloque visible se renderiza; secciones ocultas no consumen

## Datos

Por defecto usa datos de ejemplo. Para conectar con un backend, modificar `loadMockData()` en `js/integra.js` para consumir tu API.
