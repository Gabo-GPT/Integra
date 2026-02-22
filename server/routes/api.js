/**
 * Rutas API
 */

const express = require('express');
const storage = require('../lib/storage');

const router = express.Router();

router.get('/data', async (req, res) => {
  try {
    const data = await storage.read();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Error al leer datos' });
  }
});

router.put('/data', async (req, res) => {
  const body = req.body;
  if (typeof body !== 'object') {
    return res.status(400).json({ error: 'Se espera un objeto JSON' });
  }
  try {
    const ok = await storage.write(body);
    if (ok) {
      res.json({ ok: true, message: 'Datos guardados' });
    } else {
      const config = require('../config');
      const hint = config.useSupabase ? ' Revisa SUPABASE_URL y SUPABASE_SERVICE_KEY en Render.' : '';
      res.status(500).json({ error: 'No se pudieron guardar los datos.' + hint });
    }
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar: ' + (e.message || 'desconocido') });
  }
});

router.patch('/data', async (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Se requiere la clave "key"' });
  }
  try {
    const data = await storage.read();
    data[key] = value;
    const ok = await storage.write(data);
    if (ok) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: 'Error al guardar' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar' });
  }
});

router.get('/health', (req, res) => {
  const config = require('../config');
  res.json({
    ok: true,
    message: 'Integra API funcionando',
    storage: config.useSupabase ? 'Supabase' : 'Archivo local',
  });
});

module.exports = router;
