/**
 * Capa de almacenamiento: Supabase o archivo local
 */

const fs = require('fs');
const path = require('path');

const config = require('../config');
const DATA_FILE = path.join(__dirname, '..', 'data', 'integra.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readSupabase() {
  const { url, serviceKey, table, rowId } = config.supabase;
  try {
    const res = await fetch(
      `${url}/rest/v1/${table}?id=eq.${rowId}&select=value`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    return rows[0]?.value || {};
  } catch (e) {
    console.error('Error leyendo Supabase:', e.message);
    return {};
  }
}

async function writeSupabase(data) {
  const { url, serviceKey, table, rowId } = config.supabase;
  if (!url || !serviceKey) {
    console.error('Supabase no configurado: faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return false;
  }
  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: rowId, value: data }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase PUT error:', res.status, errText);
    }
    return res.ok;
  } catch (e) {
    console.error('Error guardando en Supabase:', e.message);
    return false;
  }
}

function readFile() {
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

function writeFile(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error guardando archivo:', e.message);
    return false;
  }
}

module.exports = {
  async read() {
    return config.useSupabase ? readSupabase() : readFile();
  },
  async write(data) {
    return config.useSupabase ? writeSupabase(data) : writeFile(data);
  },
};
