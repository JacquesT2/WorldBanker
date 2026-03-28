-- Migration 014: Introduce the company system.
-- Companies replace sector investments as the primary economic actors in towns.
-- They are non-player entities with traits that drive all behavioral parameters.

-- 1. Companies table
CREATE TABLE companies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id                UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  town_id                 TEXT NOT NULL REFERENCES towns(id),
  company_type            TEXT NOT NULL,
  traits                  TEXT[] NOT NULL DEFAULT '{}',

  -- Financial state
  cash                    NUMERIC(16,2) NOT NULL DEFAULT 500,
  annual_revenue          NUMERIC(16,2) NOT NULL DEFAULT 0,
  annual_expenses         NUMERIC(16,2) NOT NULL DEFAULT 0,
  equity                  NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_debt              NUMERIC(16,2) NOT NULL DEFAULT 0,

  -- Derived loan behavior (cached from traits)
  loan_demand_per_tick    NUMERIC(8,6)  NOT NULL DEFAULT 0.05,
  max_acceptable_rate     NUMERIC(6,4)  NOT NULL DEFAULT 0.12,
  base_default_probability NUMERIC(10,8) NOT NULL DEFAULT 0.001,

  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','struggling','bankrupt')),
  founded_at_tick         INTEGER NOT NULL DEFAULT 0,
  asset_count             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_companies_world    ON companies(world_id);
CREATE INDEX idx_companies_town     ON companies(town_id);
CREATE INDEX idx_companies_status   ON companies(status);

-- 2. Company assets — physical world objects owned by (or orphaned from) companies
CREATE TABLE company_assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL when orphaned (company went bankrupt)
  company_id       UUID REFERENCES companies(id) ON DELETE SET NULL,
  world_id         UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  town_id          TEXT NOT NULL REFERENCES towns(id),
  asset_type       TEXT NOT NULL,
  name             TEXT NOT NULL,
  value            NUMERIC(14,2) NOT NULL,
  condition        SMALLINT NOT NULL DEFAULT 100 CHECK (condition BETWEEN 0 AND 100),
  annual_revenue   NUMERIC(14,2) NOT NULL,
  created_at_tick  INTEGER NOT NULL DEFAULT 0,
  orphaned_at_tick INTEGER
);

CREATE INDEX idx_company_assets_company  ON company_assets(company_id);
CREATE INDEX idx_company_assets_town     ON company_assets(town_id);
CREATE INDEX idx_company_assets_orphaned ON company_assets(company_id) WHERE company_id IS NULL;

-- 3. Company–player relations
CREATE TABLE company_relations (
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  player_id               UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score                   NUMERIC(6,2) NOT NULL DEFAULT 0
                            CHECK (score BETWEEN -100 AND 100),
  last_interaction_tick   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, player_id)
);

-- 4. Update loans table: replace borrower_type (old enum) with company_id + company_type
ALTER TABLE loans
  ADD COLUMN company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN company_type TEXT;

-- Backfill company_type from borrower_type where it exists
UPDATE loans SET company_type = borrower_type WHERE borrower_type IS NOT NULL;

-- Drop old borrower_type column
ALTER TABLE loans DROP COLUMN IF EXISTS borrower_type;

-- 5. Update loan_proposals table
ALTER TABLE loan_proposals
  ADD COLUMN company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN company_type TEXT;

UPDATE loan_proposals SET company_type = borrower_type WHERE borrower_type IS NOT NULL;
ALTER TABLE loan_proposals DROP COLUMN IF EXISTS borrower_type;

-- 6. Update loan_auctions table
ALTER TABLE loan_auctions
  ADD COLUMN company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN company_type TEXT;

UPDATE loan_auctions SET company_type = borrower_type WHERE borrower_type IS NOT NULL;
ALTER TABLE loan_auctions DROP COLUMN IF EXISTS borrower_type;

-- 7. Remove sector columns from towns (companies drive economic output now)
ALTER TABLE towns
  DROP COLUMN IF EXISTS sector_military,
  DROP COLUMN IF EXISTS sector_heavy_industry,
  DROP COLUMN IF EXISTS sector_construction,
  DROP COLUMN IF EXISTS sector_commerce,
  DROP COLUMN IF EXISTS sector_maritime,
  DROP COLUMN IF EXISTS sector_agriculture;

-- 8. Drop sector_investments (replaced by company system)
DROP TABLE IF EXISTS sector_investments;

-- 9. Remove total_investments from balance_sheets (no longer applicable)
ALTER TABLE balance_sheets
  DROP COLUMN IF EXISTS total_investments;
