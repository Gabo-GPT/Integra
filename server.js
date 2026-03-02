/**
 * Servidor Integra Local - Dashboard NOC Nivel 3 (sin SSH)
 * Rutas: GET /api/v1/cmts (inventario)
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(express.static(__dirname));

const inventarioPaths = [
  path.join(__dirname, 'config', 'inventario_cmts.json'),
  path.join(__dirname, 'config', 'cmts_inventory.json'),
  path.join(__dirname, 'inventario_cmts.json')
];
let _cmtsCache = null;

function loadSingleList(p) {
  try {
    if (!fs.existsSync(p)) return [];
    const data = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(data);
    const list = Array.isArray(parsed) ? parsed : (parsed.cmts || parsed.items || []);
    return list
      .filter(c => c && (c.nombre || c.ip))
      .map(c => ({
        nombre: (c.nombre || c.name || '').trim(),
        ip: (c.ip || '').trim(),
        marca: ((c.marca || c.vendor || c.brand || '')).toLowerCase(),
        segmento: c.segmento || c.segment || ''
      }));
  } catch (e) {
    return [];
  }
}

function getCmtsList() {
  const seen = new Set();
  const combined = [];
  for (const p of inventarioPaths) {
    const list = loadSingleList(p);
    for (const c of list) {
      const key = (c.nombre || '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(c);
      }
    }
  }
  _cmtsCache = combined;
  return combined;
}

app.get('/api/v1/cmts', (req, res) => {
  const list = getCmtsList();
  res.json(list);
});

app.get('/api/v1/inventario', (req, res) => {
  const list = getCmtsList();
  res.json(list);
});

/* Persistencia de datos (integra_data) para sincronización en producción */
const DATA_FILE = path.join(__dirname, 'data', 'integra_data.json');
function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function loadAppData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) { console.warn('loadAppData:', e.message); }
  return {};
}
function saveAppData(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data || {}, null, 0), 'utf8');
  } catch (e) { console.warn('saveAppData:', e.message); }
}

app.get('/api/data', (req, res) => {
  const data = loadAppData();
  res.json(data);
});

app.put('/api/data', (req, res) => {
  const data = req.body;
  if (data && typeof data === 'object') {
    saveAppData(data);
    res.status(200).json({ ok: true });
  } else {
    res.status(400).json({ error: 'Body must be a JSON object' });
  }
});

app.listen(PORT, () => {
  console.log('Integra Local · Dashboard NOC Nivel 3 en http://localhost:' + PORT);
  console.log('API: GET /api/v1/cmts | GET /api/data | PUT /api/data');
});
