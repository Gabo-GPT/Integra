/**
 * Integra - Backend API
 * Guarda todos los datos de la aplicación en archivos JSON
 * Sirve también el frontend (index.html, css, js)
 * Puerto: 3000 por defecto (o PORT)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta raíz del proyecto (un nivel arriba de server/)
const ROOT_DIR = path.join(__dirname, '..');
// Carpeta donde se guardan los datos
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'integra.json');

// Crear carpeta data si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos (frontend)
app.use(express.static(ROOT_DIR, { index: false }));

// Leer datos del archivo
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error leyendo datos:', e.message);
  }
  return {};
}

// Guardar datos en el archivo
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error guardando datos:', e.message);
    return false;
  }
}

// ========== API ==========

// Obtener todos los datos
app.get('/api/data', (req, res) => {
  const data = readData();
  res.json(data);
});

// Guardar todos los datos (reemplaza todo)
app.put('/api/data', (req, res) => {
  const body = req.body;
  if (typeof body !== 'object') {
    return res.status(400).json({ error: 'Se espera un objeto JSON' });
  }
  if (writeData(body)) {
    res.json({ ok: true, message: 'Datos guardados' });
  } else {
    res.status(500).json({ error: 'No se pudieron guardar los datos' });
  }
});

// Actualizar solo una clave (merge)
app.patch('/api/data', (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Se requiere la clave "key"' });
  }
  const data = readData();
  data[key] = value;
  if (writeData(data)) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// Salud del servidor
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Integra API funcionando' });
});

// Servir index.html para cualquier ruta no-API (SPA)
app.get('*', (req, res) => {
  const p = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(p)) {
    res.sendFile(p);
  } else {
    res.status(404).send('Integra - index.html no encontrado');
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('');
  console.log('  Integra - Backend API');
  console.log('  ====================');
  console.log('  Servidor corriendo en: http://localhost:' + PORT);
  console.log('  API datos: GET/PUT /api/data');
  console.log('');
});
