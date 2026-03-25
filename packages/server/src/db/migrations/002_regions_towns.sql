CREATE TABLE regions (
  id                  TEXT PRIMARY KEY,
  world_id            UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL,
  culture             TEXT NOT NULL,
  capital_town_id     TEXT,
  base_risk_modifier  NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  base_trade_modifier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  description         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_regions_world ON regions(world_id);

CREATE TABLE towns (
  id                  TEXT PRIMARY KEY,
  world_id            UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  region_id           TEXT NOT NULL REFERENCES regions(id),
  name                TEXT NOT NULL,
  population          INTEGER NOT NULL CHECK (population >= 0),
  wealth_per_capita   NUMERIC(10,2) NOT NULL CHECK (wealth_per_capita >= 0),
  economic_output     NUMERIC(16,2) NOT NULL DEFAULT 0,
  resources           TEXT[] NOT NULL DEFAULT '{}',
  infra_roads         SMALLINT NOT NULL DEFAULT 1 CHECK (infra_roads BETWEEN 0 AND 5),
  infra_port          SMALLINT NOT NULL DEFAULT 0 CHECK (infra_port BETWEEN 0 AND 5),
  infra_granary       SMALLINT NOT NULL DEFAULT 1 CHECK (infra_granary BETWEEN 0 AND 5),
  infra_walls         SMALLINT NOT NULL DEFAULT 1 CHECK (infra_walls BETWEEN 0 AND 5),
  infra_market        SMALLINT NOT NULL DEFAULT 1 CHECK (infra_market BETWEEN 0 AND 5),
  risk_factors        TEXT[] NOT NULL DEFAULT '{}',
  is_regional_capital BOOLEAN NOT NULL DEFAULT false,
  x_coord             NUMERIC(5,2) NOT NULL,
  y_coord             NUMERIC(5,2) NOT NULL
);

CREATE INDEX idx_towns_world  ON towns(world_id);
CREATE INDEX idx_towns_region ON towns(region_id);

-- Add deferred FK now that towns exists
ALTER TABLE regions
  ADD CONSTRAINT fk_regions_capital
  FOREIGN KEY (capital_town_id) REFERENCES towns(id)
  DEFERRABLE INITIALLY DEFERRED;
