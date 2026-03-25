CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE worlds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active  BOOLEAN NOT NULL DEFAULT true
);
