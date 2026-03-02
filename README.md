# Integra Local

**Versión aislada** de Integra. Todo se guarda en el historial del navegador (localStorage).  
Sin servidor, Render ni base de datos.

## Cómo usar

1. Abre `index.html` directamente en tu navegador (doble clic o arrastrar al navegador).
2. O desde una carpeta servida por HTTP (ej. `python -m http.server` en la carpeta integra-local).

## Diagnóstico automático por SSH

Para eliminar el copiar/pegar desde PuTTY al diagnosticar módems DOCSIS:

1. Copia `.env.example` a `.env` y configura `SSH_USERNAME` y `SSH_PASSWORD`.
2. Ejecuta `npm start` para levantar el servidor.
3. Abre `http://localhost:3000` en el navegador.
4. Ve a **Intermitencia** (rol NOC/QoE), ingresa la MAC y selecciona el CMTS.
5. Haz clic en **Analizar** para ejecutar comandos vía SSH y ver el resultado automáticamente.

El servidor se conecta a los CMTS listados en `config/cmts_inventory.json` y ejecuta comandos según la marca (Cisco, Arris, Casa, Arista).

## Características

- No intenta conectar a ningún servidor (salvo modo diagnóstico SSH)
- No aparece "Sin conexión" ni mensajes de error de base de datos
- Los datos se guardan en `localStorage` del navegador
- Funciona completamente offline (sin servidor)
- Los datos son independientes de la versión principal (usa `integra_data_local`)
- Diagnóstico CMTS automático vía SSH (Cisco, Arris, Casa, Arista)

## Limitaciones

- Los datos están solo en este navegador y equipo
- No hay sincronización entre dispositivos
- Si borras datos del navegador, se pierden los datos locales

## Copia portable

Puedes copiar la carpeta `integra-local` a una USB o compartirla.  
Solo necesitas `index.html`, `js/` y `css/` para que funcione. Para diagnóstico SSH también `server.js`, `config/`, `package.json` y `.env`.
