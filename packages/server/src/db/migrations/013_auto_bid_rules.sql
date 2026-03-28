CREATE TABLE player_auto_bid_rules (
  player_id            UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  enabled              BOOLEAN      NOT NULL DEFAULT false,
  max_risk_pct_per_year NUMERIC(6,2) NOT NULL DEFAULT 20,
  min_net_yield_pct    NUMERIC(6,2) NOT NULL DEFAULT 5,
  max_loan_amount      INTEGER      NOT NULL DEFAULT 0,
  max_total_capital    INTEGER      NOT NULL DEFAULT 0,
  min_reserve_after    NUMERIC(6,4) NOT NULL DEFAULT 0.15,
  allowed_types        TEXT[]       NOT NULL DEFAULT '{}',
  rate_discount        NUMERIC(6,4) NOT NULL DEFAULT 0
);
