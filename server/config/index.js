/**
 * Configuración del backend
 */

try {
  require('dotenv').config();
} catch (e) {}

module.exports = {
  port: process.env.PORT || 3000,
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    table: 'integra_data',
    rowId: 'main',
  },
  useSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
};
