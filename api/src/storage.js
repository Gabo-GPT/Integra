/**
 * Capa de almacenamiento para Azure Functions
 * Usa Supabase si está configurado; sino fallback temporal en memoria (no persiste en cold start)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const useSupabase = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

let _memoryFallback = {};

async function readSupabase() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/integra_data?id=eq.main&select=value`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase no configurado');
    return false;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/integra_data`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: 'main', value: data }),
    });
    return res.ok;
  } catch (e) {
    console.error('Error guardando en Supabase:', e.message);
    return false;
  }
}

async function read() {
  if (useSupabase) return readSupabase();
  return _memoryFallback;
}

async function write(data) {
  if (useSupabase) return writeSupabase(data);
  _memoryFallback = data;
  return true;
}

module.exports = { read, write, useSupabase };
