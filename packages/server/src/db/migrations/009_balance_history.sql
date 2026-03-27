CREATE TABLE player_balance_history (
  id                     BIGSERIAL PRIMARY KEY,
  player_id              UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  world_id               UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  tick                   INTEGER NOT NULL,
  cash                   NUMERIC(15,2) NOT NULL,
  total_loan_book        NUMERIC(15,2) NOT NULL,
  total_deposits_owed    NUMERIC(15,2) NOT NULL,
  total_interest_accrued NUMERIC(15,2) NOT NULL,
  equity                 NUMERIC(15,2) NOT NULL,
  reserve_ratio          NUMERIC(8,6) NOT NULL
);

CREATE UNIQUE INDEX idx_balance_history_player_tick ON player_balance_history(player_id, tick);
CREATE INDEX idx_balance_history_lookup ON player_balance_history(player_id, tick DESC);
