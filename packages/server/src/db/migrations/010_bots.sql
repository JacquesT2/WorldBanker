-- 010: add bot fields to players
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_bot       BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_strategy VARCHAR(50);
