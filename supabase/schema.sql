-- Integra: tabla para almacenar datos de la aplicación
-- Ejecutar en Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permiso para el servicio (anon o service_role según tu configuración)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read write" ON app_data
  FOR ALL USING (true) WITH CHECK (true);

-- Insertar clave inicial para integra_data
INSERT INTO app_data (key, value) VALUES ('integra_data', '{}')
ON CONFLICT (key) DO NOTHING;
