const { app } = require('@azure/functions');
const storage = require('../storage');

app.http('data', {
  methods: ['GET', 'PUT', 'PATCH'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const method = request.method;

    try {
      if (method === 'GET') {
        const data = await storage.read();
        return { status: 200, body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } };
      }

      if (method === 'PUT') {
        const body = await request.json();
        if (typeof body !== 'object') {
          return { status: 400, body: JSON.stringify({ error: 'Se espera un objeto JSON' }), headers: { 'Content-Type': 'application/json' } };
        }
        const ok = await storage.write(body);
        if (ok) {
          return { status: 200, body: JSON.stringify({ ok: true, message: 'Datos guardados' }), headers: { 'Content-Type': 'application/json' } };
        }
        const hint = storage.useSupabase ? ' Revisa SUPABASE_URL y SUPABASE_SERVICE_KEY.' : ' Configura Supabase para persistencia.';
        return { status: 500, body: JSON.stringify({ error: 'No se pudieron guardar los datos.' + hint }), headers: { 'Content-Type': 'application/json' } };
      }

      if (method === 'PATCH') {
        const body = await request.json();
        const { key, value } = body;
        if (!key) {
          return { status: 400, body: JSON.stringify({ error: 'Se requiere la clave "key"' }), headers: { 'Content-Type': 'application/json' } };
        }
        const data = await storage.read();
        data[key] = value;
        const ok = await storage.write(data);
        if (ok) {
          return { status: 200, body: JSON.stringify({ ok: true }), headers: { 'Content-Type': 'application/json' } };
        }
        return { status: 500, body: JSON.stringify({ error: 'Error al guardar' }), headers: { 'Content-Type': 'application/json' } };
      }

      return { status: 405, body: JSON.stringify({ error: 'Método no permitido' }), headers: { 'Content-Type': 'application/json' } };
    } catch (e) {
      context.error('Error API data:', e);
      return { status: 500, body: JSON.stringify({ error: 'Error: ' + (e.message || 'desconocido') }), headers: { 'Content-Type': 'application/json' } };
    }
  },
});
