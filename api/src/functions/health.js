const { app } = require('@azure/functions');
const storage = require('../storage');

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => {
    return {
      status: 200,
      body: JSON.stringify({
        ok: true,
        message: 'Integra API funcionando',
        storage: storage.useSupabase ? 'Supabase' : 'Archivo local / memoria',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  },
});
