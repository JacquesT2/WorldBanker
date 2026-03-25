CREATE TABLE trade_routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  town_a_id   TEXT NOT NULL REFERENCES towns(id),
  town_b_id   TEXT NOT NULL REFERENCES towns(id),
  strength    SMALLINT NOT NULL DEFAULT 5 CHECK (strength BETWEEN 1 AND 10),
  route_type  TEXT NOT NULL CHECK (route_type IN ('land', 'river', 'sea')),
  CONSTRAINT chk_no_self_route CHECK (town_a_id <> town_b_id),
  UNIQUE (world_id, town_a_id, town_b_id)
);

CREATE INDEX idx_trade_routes_town_a ON trade_routes(town_a_id);
CREATE INDEX idx_trade_routes_town_b ON trade_routes(town_b_id);
CREATE INDEX idx_trade_routes_world  ON trade_routes(world_id);
