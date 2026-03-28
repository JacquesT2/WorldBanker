-- Migration 012: Loan auctions
-- Replaces first-come-first-served proposals with a competitive bidding system.
-- Each loan opportunity opens a short auction window; lowest rate wins.

CREATE TABLE loan_auctions (
  id                      TEXT        PRIMARY KEY,
  world_id                UUID        NOT NULL REFERENCES worlds(id),
  town_id                 TEXT        NOT NULL REFERENCES towns(id),
  borrower_name           TEXT        NOT NULL,
  borrower_type           TEXT        NOT NULL,
  requested_amount        NUMERIC     NOT NULL,
  max_acceptable_rate     NUMERIC     NOT NULL,
  term_ticks              INTEGER     NOT NULL,
  base_default_probability NUMERIC    NOT NULL,
  collateral_value        NUMERIC     NOT NULL,
  partial_recovery_rate   NUMERIC     NOT NULL,
  created_at_tick         INTEGER     NOT NULL,
  closes_at_tick          INTEGER     NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'awarded', 'no_bids')),
  winning_player_id       UUID        REFERENCES players(id),
  winning_rate            NUMERIC,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auction_bids (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auction_id  TEXT        NOT NULL REFERENCES loan_auctions(id) ON DELETE CASCADE,
  player_id   UUID        NOT NULL REFERENCES players(id),
  offered_rate NUMERIC    NOT NULL,
  bid_tick    INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auction_id, player_id)   -- one bid per player per auction (upsert-friendly)
);

CREATE INDEX idx_loan_auctions_world_status ON loan_auctions(world_id, status);
CREATE INDEX idx_loan_auctions_town         ON loan_auctions(town_id);
CREATE INDEX idx_auction_bids_auction       ON auction_bids(auction_id);
