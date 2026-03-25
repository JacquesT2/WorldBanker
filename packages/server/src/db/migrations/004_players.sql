CREATE TABLE players (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id         UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  username         TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  bank_name        TEXT NOT NULL,
  reputation       NUMERIC(6,2) NOT NULL DEFAULT 50.0
                     CHECK (reputation BETWEEN 0 AND 100),
  starting_town_id TEXT REFERENCES towns(id),
  is_bankrupt      BOOLEAN NOT NULL DEFAULT false,
  bankruptcy_tick  INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id, username)
);

CREATE INDEX idx_players_world ON players(world_id);

CREATE TABLE balance_sheets (
  player_id               UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  cash                    NUMERIC(16,2) NOT NULL DEFAULT 1500.0,
  total_loan_book         NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_investments       NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_deposits_owed     NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_interest_accrued  NUMERIC(16,2) NOT NULL DEFAULT 0,
  equity                  NUMERIC(16,2) NOT NULL DEFAULT 1500.0,
  reserve_ratio           NUMERIC(8,4)  NOT NULL DEFAULT 1.0,
  last_updated_tick       INTEGER NOT NULL DEFAULT 0
);
