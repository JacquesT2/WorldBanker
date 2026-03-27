-- Migration 011: Replace infrastructure columns with sector columns on towns,
-- and create sector_investments table to replace infrastructure_investments.

-- 1. Add sector columns to towns
ALTER TABLE towns
  ADD COLUMN sector_military       SMALLINT NOT NULL DEFAULT 0 CHECK (sector_military BETWEEN 0 AND 5),
  ADD COLUMN sector_heavy_industry SMALLINT NOT NULL DEFAULT 0 CHECK (sector_heavy_industry BETWEEN 0 AND 5),
  ADD COLUMN sector_construction   SMALLINT NOT NULL DEFAULT 0 CHECK (sector_construction BETWEEN 0 AND 5),
  ADD COLUMN sector_commerce       SMALLINT NOT NULL DEFAULT 0 CHECK (sector_commerce BETWEEN 0 AND 5),
  ADD COLUMN sector_maritime       SMALLINT NOT NULL DEFAULT 0 CHECK (sector_maritime BETWEEN 0 AND 5),
  ADD COLUMN sector_agriculture    SMALLINT NOT NULL DEFAULT 0 CHECK (sector_agriculture BETWEEN 0 AND 5);

-- 2. Migrate existing infra data into sectors (best-effort mapping)
UPDATE towns SET
  sector_military       = infra_walls,
  sector_heavy_industry = CASE
    WHEN infra_port = 0 THEN GREATEST(infra_roads, infra_granary, infra_market) - 1
    ELSE 0
  END,
  sector_construction   = infra_roads,
  sector_commerce       = infra_market,
  sector_maritime       = infra_port,
  sector_agriculture    = infra_granary;

-- Clamp to 0–5
UPDATE towns SET
  sector_heavy_industry = GREATEST(0, LEAST(5, sector_heavy_industry));

-- 3. Drop old infra columns
ALTER TABLE towns
  DROP COLUMN IF EXISTS infra_roads,
  DROP COLUMN IF EXISTS infra_port,
  DROP COLUMN IF EXISTS infra_granary,
  DROP COLUMN IF EXISTS infra_walls,
  DROP COLUMN IF EXISTS infra_market;

-- 4. Create new sector_investments table
CREATE TABLE sector_investments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  town_id            TEXT NOT NULL REFERENCES towns(id),
  sector_type        TEXT NOT NULL
                       CHECK (sector_type IN ('military','heavy_industry','construction','commerce','maritime','agriculture')),
  amount_invested    NUMERIC(14,2) NOT NULL CHECK (amount_invested > 0),
  completion_tick    INTEGER NOT NULL,
  completed          BOOLEAN NOT NULL DEFAULT false,
  annual_return_rate NUMERIC(8,4) NOT NULL DEFAULT 0.05,
  reputation_bonus   NUMERIC(6,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_sector_investments_player     ON sector_investments(player_id);
CREATE INDEX idx_sector_investments_completion ON sector_investments(completion_tick)
  WHERE completed = false;

-- 5. Migrate existing infrastructure_investments data into sector_investments
INSERT INTO sector_investments
  (id, player_id, town_id, sector_type, amount_invested, completion_tick,
   completed, annual_return_rate, reputation_bonus)
SELECT
  id, player_id, town_id,
  CASE infra_type
    WHEN 'roads'   THEN 'construction'
    WHEN 'port'    THEN 'maritime'
    WHEN 'granary' THEN 'agriculture'
    WHEN 'walls'   THEN 'military'
    WHEN 'market'  THEN 'commerce'
    ELSE 'commerce'
  END,
  amount_invested, completion_tick, completed, annual_return_rate, reputation_bonus
FROM infrastructure_investments;

-- 6. Drop old infrastructure_investments table
DROP TABLE IF EXISTS infrastructure_investments;
