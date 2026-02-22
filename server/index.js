/**
 * Integra - Backend API
 * Sirve el frontend y la API de datos (Supabase o archivo local)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const apiRoutes = require('./routes/api');

const app = express();
const ROOT_DIR = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api', apiRoutes);
app.use(express.static(ROOT_DIR, { index: false }));

app.get('*', (req, res) => {
  const p = path.join(ROOT_DIR, 'index.html');
  if (require('fs').existsSync(p)) {
    res.sendFile(p);
  } else {
    res.status(404).send('Integra - index.html no encontrado');
  }
});

app.listen(config.port, () => {
  console.log('');
  console.log('  Integra - Backend API');
  console.log('  ====================');
  console.log('  Servidor: puerto ' + config.port);
  console.log('  Almacenamiento: ' + (config.useSupabase ? 'Supabase' : 'Archivo local'));
  console.log('');
});
