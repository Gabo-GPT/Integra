-- Ejecuta este SQL en Supabase para crear la tabla de datos de Integra
-- Supabase Dashboard → SQL Editor → New query → Pegar y ejecutar

CREATE TABLE IF NOT EXISTS integra_data (
  id TEXT PRIMARY KEY DEFAULT 'main',
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
