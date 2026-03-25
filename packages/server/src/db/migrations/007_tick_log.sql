CREATE TABLE tick_log (
  id           BIGSERIAL PRIMARY KEY,
  world_id     UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  tick_number  INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  step_timings JSONB NOT NULL DEFAULT '{}',
  error_count  SMALLINT NOT NULL DEFAULT 0,
  errors       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tick_log_world ON tick_log(world_id, tick_number DESC);
