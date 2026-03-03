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

-- Tabla para memoria persistente de diagnósticos (base de conocimientos compartida)
CREATE TABLE IF NOT EXISTS diagnostico_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac TEXT NOT NULL,
  niveles JSONB NOT NULL DEFAULT '{}',
  errores_fec NUMERIC,
  asesor_id TEXT DEFAULT 'anon',
  interface_id TEXT,
  node_id TEXT,
  rx_alto BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostico_reports_mac_created ON diagnostico_reports (mac, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostico_reports_interface_rx ON diagnostico_reports (interface_id, rx_alto, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostico_reports_node_rx ON diagnostico_reports (node_id, rx_alto, created_at DESC);

ALTER TABLE diagnostico_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read write diagnostico" ON diagnostico_reports FOR ALL USING (true) WITH CHECK (true);
