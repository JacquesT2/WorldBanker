CREATE TABLE loan_proposals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id                UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  town_id                 TEXT NOT NULL REFERENCES towns(id),
  borrower_type           TEXT NOT NULL,
  borrower_name           TEXT NOT NULL,
  requested_amount        NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  max_acceptable_rate     NUMERIC(8,4)  NOT NULL,
  term_ticks              INTEGER NOT NULL CHECK (term_ticks > 0),
  base_default_probability NUMERIC(10,7) NOT NULL,
  collateral_value        NUMERIC(14,2) NOT NULL DEFAULT 0,
  partial_recovery_rate   NUMERIC(5,3)  NOT NULL DEFAULT 0.5,
  expires_at_tick         INTEGER NOT NULL,
  created_at_tick         INTEGER NOT NULL,
  accepted_by_player_id   UUID REFERENCES players(id),
  accepted_at_tick        INTEGER
);

CREATE INDEX idx_proposals_active ON loan_proposals(world_id, town_id)
  WHERE accepted_by_player_id IS NULL;
CREATE INDEX idx_proposals_expires ON loan_proposals(expires_at_tick)
  WHERE accepted_by_player_id IS NULL;

CREATE TABLE player_scores (
  player_id               UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  total_score             NUMERIC(10,4) NOT NULL DEFAULT 0,
  net_worth_score         NUMERIC(10,4) NOT NULL DEFAULT 0,
  portfolio_quality_score NUMERIC(10,4) NOT NULL DEFAULT 0,
  reserve_health_score    NUMERIC(10,4) NOT NULL DEFAULT 0,
  rank                    INTEGER NOT NULL DEFAULT 0,
  last_updated_tick       INTEGER NOT NULL DEFAULT 0
);

-- Event cooldown tracking: prevents same event type hitting same region too often
CREATE TABLE event_cooldowns (
  world_id     UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  region_id    TEXT NOT NULL REFERENCES regions(id),
  event_type   TEXT NOT NULL,
  last_tick    INTEGER NOT NULL,
  PRIMARY KEY (world_id, region_id, event_type)
);
