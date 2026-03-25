import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate, SetDepositRateSchema } from '../middleware/validate';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';

export function createDepositsRouter(state: WorldState) {
  const router = Router();

  // GET /deposits
  router.get('/', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const deposits = state.getDepositsForPlayer(player_id);
    res.json(deposits);
  });

  // POST /deposits/set-rate
  router.post('/set-rate', authMiddleware, validate(SetDepositRateSchema), async (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const { town_id, rate } = req.body;

    const licenses = state.licenses.get(player_id) ?? [];
    if (!licenses.some(l => l.town_id === town_id)) {
      res.status(403).json({ error: 'No banking license for this town' });
      return;
    }

    const deposit = state.getDepositsForPlayer(player_id).find(d => d.town_id === town_id);
    if (!deposit) {
      res.status(404).json({ error: 'No deposit position in this town' });
      return;
    }

    try {
      deposit.interest_rate_offered = rate;
      await pool.query(
        'UPDATE deposits SET interest_rate_offered = $1 WHERE id = $2',
        [rate, deposit.id]
      );
      res.json({ success: true, town_id, rate });
    } catch (err) {
      console.error('[deposits/set-rate]', err);
      res.status(500).json({ error: 'Failed to update deposit rate' });
    }
  });

  return router;
}
