/**
 * Integra - Backend API
 * Guarda datos en Supabase (producción) o archivo JSON (local)
 * Sirve también el frontend (index.html, css, js)
 * Puerto: 3000 por defecto (o PORT)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);
const TABLE_NAME = 'integra_data';
const ROW_ID = 'main';

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'integra.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir frontend estático
app.use(express.static(ROOT_DIR, { index: false }));

// ========== Almacenamiento ==========

async function readDataSupabase() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${ROW_ID}&select=value`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    return (rows[0] && rows[0].value) || {};
  } catch (e) {
    console.error('Error leyendo Supabase:', e.message);
    return {};
  }
}

async function writeDataSupabase(data) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: ROW_ID, value: data }),
      }
    );
    return res.ok;
  } catch (e) {
    console.error('Error guardando en Supabase:', e.message);
    return false;
  }
}

function readDataFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error leyendo archivo:', e.message);
  }
  return {};
}

function writeDataFile(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error guardando archivo:', e.message);
    return false;
  }
}

async function readData() {
  if (USE_SUPABASE) return readDataSupabase();
  return readDataFile();
}

async function writeData(data) {
  if (USE_SUPABASE) return writeDataSupabase(data);
  return writeDataFile(data);
}

// ========== API ==========

app.get('/api/data', async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.put('/api/data', async (req, res) => {
  const body = req.body;
  if (typeof body !== 'object') {
    return res.status(400).json({ error: 'Se espera un objeto JSON' });
  }
  const ok = await writeData(body);
  if (ok) {
    res.json({ ok: true, message: 'Datos guardados' });
  } else {
    res.status(500).json({ error: 'No se pudieron guardar los datos' });
  }
});

app.patch('/api/data', async (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Se requiere la clave "key"' });
  }
  const data = await readData();
  data[key] = value;
  const ok = await writeData(data);
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Error al guardar' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Integra API funcionando',
    storage: USE_SUPABASE ? 'Supabase' : 'Archivo local',
  });
});

app.get('*', (req, res) => {
  const p = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(p)) {
    res.sendFile(p);
  } else {
    res.status(404).send('Integra - index.html no encontrado');
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('  Integra - Backend API');
  console.log('  ====================');
  console.log('  Servidor: http://localhost:' + PORT);
  console.log('  Almacenamiento: ' + (USE_SUPABASE ? 'Supabase' : 'Archivo (server/data/integra.json)'));
  console.log('');
});
