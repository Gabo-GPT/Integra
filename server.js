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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(express.static(__dirname));

const inventarioPaths = [
  path.join(__dirname, 'config', 'cmts_inventory.json'),
  path.join(__dirname, 'config', 'inventario_cmts.json'),
  path.join(__dirname, 'inventario_cmts.json')
];
let _cmtsCache = null;

function parseMarca(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const first = String(raw).split(/[|,]/)[0] || '';
  return first.trim().toLowerCase();
}
function loadSingleList(p) {
  try {
    if (!fs.existsSync(p)) return [];
    const data = fs.readFileSync(p, 'utf8');
    let list = [];
    try {
      const parsed = JSON.parse(data);
      list = Array.isArray(parsed) ? parsed : (parsed.cmts || parsed.items || []);
    } catch (jsonErr) {
      const lines = data.split(/\r?\n/).filter(l => l.trim());
      for (const line of lines) {
        const m = line.match(/^([^\t]+)\t+([^\t]+)\t*(.*)$/);
        if (m) {
          const marca = parseMarca(m[3]);
          if (m[1].trim() && m[2].trim()) list.push({ nombre: m[1].trim(), ip: m[2].trim(), marca });
        }
      }
    }
    return list
      .filter(c => c && (c.nombre || c.ip))
      .map(c => ({
        nombre: (c.nombre || c.name || '').trim(),
        ip: (c.ip || '').trim(),
        marca: (parseMarca(c.marca || c.vendor || c.brand) || (c.marca || c.vendor || c.brand || '').toString().trim()).toLowerCase(),
        segmento: (c.segmento || c.segment || '').trim()
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

/* Persistencia: Supabase si está configurado, si no archivo local */
const DATA_FILE = path.join(__dirname, 'data', 'integra_data.json');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = require('@supabase/supabase-js').createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase conectado');
  } catch (e) { console.warn('Supabase:', e.message); }
}

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function loadAppDataFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) { console.warn('loadAppData:', e.message); }
  return {};
}
function saveAppDataFile(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data || {}, null, 0), 'utf8');
  } catch (e) { console.warn('saveAppData:', e.message); }
}

async function loadAppData() {
  if (supabase) {
    try {
      const { data: row, error } = await supabase.from('app_data').select('value').eq('key', 'integra_data').single();
      if (!error && row && row.value) return row.value;
    } catch (e) { console.warn('Supabase load:', e.message); }
    return {};
  }
  return loadAppDataFile();
}
async function saveAppData(data) {
  if (supabase) {
    try {
      const { error } = await supabase.from('app_data').upsert({ key: 'integra_data', value: data || {}, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (!error) return;
    } catch (e) { console.warn('Supabase save:', e.message); }
  }
  saveAppDataFile(data);
}

app.get('/api/data', async (req, res) => {
  const data = await loadAppData();
  res.json(data);
});

app.put('/api/data', async (req, res) => {
  const data = req.body;
  if (data && typeof data === 'object') {
    await saveAppData(data);
    res.status(200).json({ ok: true });
  } else {
    res.status(400).json({ error: 'Body must be a JSON object' });
  }
});

/* Memoria persistente: diagnósticos para base de conocimientos compartida */
app.post('/api/diagnostico', async (req, res) => {
  const body = req.body || {};
  console.log('Texto recibido en el backend:', JSON.stringify(body, null, 0));
  const mac = (body.mac || '').toString().trim();
  if (!mac) {
    return res.status(400).json({ error: 'mac es requerido' });
  }
  const niveles = body.niveles && typeof body.niveles === 'object' ? body.niveles : {};
  const errores_fec = body.errores_fec != null ? Number(body.errores_fec) : null;
  const asesor_id = (body.asesor_id || 'anon').toString().trim();
  const interface_id = (body.interface_id || '').toString().trim() || null;
  const node_id = (body.node_id || '').toString().trim() || null;
  const rx = niveles.rx;
  const utilization = niveles.utilization;
  const rxEsInterfazUpstream = utilization != null && rx != null && rx >= 8 && rx <= 25;
  const rx_alto = !!(rx != null && rx > 10 && !rxEsInterfazUpstream);

  if (supabase) {
    try {
      const created_at = new Date().toISOString();
      const { error } = await supabase.from('diagnostico_reports').insert({
        mac, niveles, errores_fec, asesor_id, interface_id, node_id, rx_alto, created_at
      });
      if (error) {
        console.warn('Supabase diagnostico insert:', error.message);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ ok: true });
    } catch (e) {
      console.warn('Supabase diagnostico:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }
  res.status(201).json({ ok: true });
});

/* Reincidencia: ¿esta MAC fue ingresada en las últimas 72 horas? */
app.get('/api/diagnostico/reincidencia', async (req, res) => {
  const mac = (req.query.mac || '').toString().trim();
  if (!mac) {
    return res.status(400).json({ error: 'mac es requerido' });
  }
  if (supabase) {
    try {
      const since = new Date();
      since.setHours(since.getHours() - 72);
      const sinceIso = since.toISOString();
      const { data: rows, error } = await supabase
        .from('diagnostico_reports')
        .select('id')
        .eq('mac', mac)
        .gte('created_at', sinceIso);
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const count = Array.isArray(rows) ? rows.length : 0;
      const reincidente = count > 0;
      return res.json({ reincidente, count, mensaje: reincidente ? 'Posible Escalado Directo: Cliente con fallas recurrentes' : null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({ reincidente: false, count: 0, mensaje: null });
});

/* Historial de diagnósticos por MAC (gráfico Tendencia Capti) */
app.get('/api/history/:mac', async (req, res) => {
  const mac = (req.params.mac || '').toString().trim();
  if (!mac) {
    return res.status(400).json({ error: 'mac es requerido' });
  }
  if (!supabase) {
    return res.json({ data: [] });
  }
  try {
    let data = [];
    const { data: rowsView, error: errView } = await supabase
      .from('historial_diagnosticos')
      .select('uncorrectables, snr_up, created_at')
      .eq('mac', mac)
      .order('created_at', { ascending: true })
      .limit(50);
    if (!errView && rowsView && rowsView.length >= 0) {
      data = rowsView.map(r => ({
        uncorrectables: r.uncorrectables != null ? Number(r.uncorrectables) : null,
        snr_up: r.snr_up != null ? Number(r.snr_up) : null,
        created_at: r.created_at
      })).filter(r => r.uncorrectables != null || r.snr_up != null);
    } else {
      const { data: rows, error } = await supabase
        .from('diagnostico_reports')
        .select('niveles, created_at')
        .eq('mac', mac)
        .order('created_at', { ascending: true })
        .limit(50);
      if (!error && rows) {
        data = rows.map(r => ({
          uncorrectables: (r.niveles && r.niveles.uncorrectables != null) ? Number(r.niveles.uncorrectables) : null,
          snr_up: (r.niveles && r.niveles.snrUp != null) ? Number(r.niveles.snrUp) : null,
          created_at: r.created_at
        })).filter(r => r.uncorrectables != null || r.snr_up != null);
      }
    }
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* Historial por nodo: nodos con 3+ reportes de RX alto en la última hora (para topología parpadeante) */
app.get('/api/diagnostico/historial-nodos', async (req, res) => {
  if (!supabase) {
    return res.json({ nodosSaturados: [] });
  }
  try {
    const since = new Date();
    since.setHours(since.getHours() - 1);
    const sinceIso = since.toISOString();
    const { data: rows, error } = await supabase
      .from('diagnostico_reports')
      .select('interface_id, node_id')
      .eq('rx_alto', true)
      .gte('created_at', sinceIso);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    const counts = {};
    (rows || []).forEach(r => {
      const k = (r.node_id || r.interface_id || 'unknown').toString().trim();
      if (k && k !== 'unknown') counts[k] = (counts[k] || 0) + 1;
    });
    const nodosSaturados = Object.keys(counts).filter(k => counts[k] >= 3);
    return res.json({ nodosSaturados });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log('Integra Local · Dashboard NOC Nivel 3 en http://localhost:' + PORT);
  console.log('API: GET /api/v1/cmts | GET /api/data | PUT /api/data | POST /api/diagnostico | GET /api/diagnostico/reincidencia | GET /api/diagnostico/historial-nodos | GET /api/history/:mac');
});
