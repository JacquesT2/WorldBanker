import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import type { WorldState } from '../../state/world-state';

export function createLeaderboardRouter(state: WorldState) {
  const router = Router();

  router.get('/', authMiddleware, (_req, res) => {
    const scores = Array.from(state.scores.values())
      .sort((a, b) => a.rank - b.rank);
    res.json({
      tick: state.clock.current_tick,
      season: state.clock.current_season,
      year: state.clock.current_year,
      scores,
    });
  });

  return router;
}
