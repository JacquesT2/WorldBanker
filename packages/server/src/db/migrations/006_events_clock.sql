CREATE TABLE world_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id                 UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  event_type               TEXT NOT NULL,
  town_id                  TEXT NOT NULL REFERENCES towns(id),
  severity                 NUMERIC(5,3) NOT NULL CHECK (severity BETWEEN 0 AND 1),
  duration_ticks           INTEGER NOT NULL CHECK (duration_ticks > 0),
  ticks_remaining          INTEGER NOT NULL,
  economic_output_modifier NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  population_modifier      NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  loan_default_modifier    NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  description              TEXT NOT NULL DEFAULT '',
  occurred_at_tick         INTEGER NOT NULL
);

CREATE INDEX idx_events_world  ON world_events(world_id);
CREATE INDEX idx_events_town   ON world_events(town_id);
CREATE INDEX idx_events_active ON world_events(world_id, ticks_remaining)
  WHERE ticks_remaining > 0;

CREATE TABLE world_clock (
  world_id       UUID PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  current_tick   INTEGER NOT NULL DEFAULT 0,
  current_day    SMALLINT NOT NULL DEFAULT 1 CHECK (current_day BETWEEN 1 AND 90),
  current_season TEXT NOT NULL DEFAULT 'spring'
                   CHECK (current_season IN ('spring','summer','autumn','winter')),
  current_year   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE economic_cycle (
  world_id         UUID PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  phase            TEXT NOT NULL DEFAULT 'normal'
                     CHECK (phase IN ('boom','normal','contraction')),
  phase_tick_start INTEGER NOT NULL DEFAULT 0,
  phase_duration   INTEGER NOT NULL DEFAULT 90,
  multiplier       NUMERIC(5,3) NOT NULL DEFAULT 1.0
);
