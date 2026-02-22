-- Ejecuta en Supabase: SQL Editor → New query → Pegar y Run

CREATE TABLE IF NOT EXISTS integra_data (
  id TEXT PRIMARY KEY DEFAULT 'main',
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
