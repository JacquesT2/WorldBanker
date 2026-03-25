CREATE TABLE banking_licenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  town_id             TEXT NOT NULL REFERENCES towns(id),
  acquired_at_tick    INTEGER NOT NULL DEFAULT 0,
  cost_paid           NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_starting_license BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (player_id, town_id)
);

CREATE INDEX idx_licenses_player ON banking_licenses(player_id);
CREATE INDEX idx_licenses_town   ON banking_licenses(town_id);

CREATE TABLE loans (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  town_id                       TEXT NOT NULL REFERENCES towns(id),
  borrower_name                 TEXT NOT NULL,
  borrower_type                 TEXT NOT NULL,
  principal                     NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  outstanding_balance           NUMERIC(14,2) NOT NULL CHECK (outstanding_balance >= 0),
  interest_rate                 NUMERIC(8,4)  NOT NULL CHECK (interest_rate >= 0),
  term_ticks                    INTEGER NOT NULL CHECK (term_ticks > 0),
  ticks_elapsed                 INTEGER NOT NULL DEFAULT 0,
  status                        TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','repaid','defaulted','written_off')),
  default_probability_per_tick  NUMERIC(10,7) NOT NULL DEFAULT 0.001,
  collateral_value              NUMERIC(14,2) NOT NULL DEFAULT 0,
  partial_recovery_rate         NUMERIC(5,3)  NOT NULL DEFAULT 0.5
                                  CHECK (partial_recovery_rate BETWEEN 0 AND 1),
  created_at_tick               INTEGER NOT NULL,
  defaulted_at_tick             INTEGER,
  repaid_at_tick                INTEGER
);

CREATE INDEX idx_loans_player_active ON loans(player_id) WHERE status = 'active';
CREATE INDEX idx_loans_town          ON loans(town_id);
CREATE INDEX idx_loans_status        ON loans(status);

CREATE TABLE deposits (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  town_id                    TEXT NOT NULL REFERENCES towns(id),
  balance                    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  interest_rate_offered      NUMERIC(8,4)  NOT NULL DEFAULT 0
                               CHECK (interest_rate_offered BETWEEN 0 AND 1),
  last_inflow_tick           INTEGER NOT NULL DEFAULT 0,
  last_interest_accrual_tick INTEGER NOT NULL DEFAULT 0,
  UNIQUE (player_id, town_id)
);

CREATE INDEX idx_deposits_player ON deposits(player_id);
CREATE INDEX idx_deposits_town   ON deposits(town_id);

CREATE TABLE infrastructure_investments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  town_id            TEXT NOT NULL REFERENCES towns(id),
  infra_type         TEXT NOT NULL
                       CHECK (infra_type IN ('roads','port','granary','walls','market')),
  amount_invested    NUMERIC(14,2) NOT NULL CHECK (amount_invested > 0),
  completion_tick    INTEGER NOT NULL,
  completed          BOOLEAN NOT NULL DEFAULT false,
  annual_return_rate NUMERIC(8,4) NOT NULL DEFAULT 0.05,
  reputation_bonus   NUMERIC(6,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_investments_player     ON infrastructure_investments(player_id);
CREATE INDEX idx_investments_completion ON infrastructure_investments(completion_tick)
  WHERE completed = false;
