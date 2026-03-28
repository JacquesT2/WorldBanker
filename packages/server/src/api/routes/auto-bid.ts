import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';
import { DEFAULT_AUTO_BID_RULE, type AutoBidRule } from '@argentum/shared';

export function createAutoBidRouter(state: WorldState): Router {
  const router = Router();

  // GET /auto-bid/rule
  router.get('/rule', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const rule = state.autoBidRules.get(player_id);
    if (!rule) {
      res.json({ player_id, ...DEFAULT_AUTO_BID_RULE });
      return;
    }
    res.json(rule);
  });

  // PUT /auto-bid/rule
  router.put('/rule', authMiddleware, async (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const body = req.body as Partial<AutoBidRule>;

    const existing = state.autoBidRules.get(player_id) ?? { player_id, ...DEFAULT_AUTO_BID_RULE };
    const updated: AutoBidRule = {
      player_id,
      enabled:               typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
      max_risk_pct_per_year: typeof body.max_risk_pct_per_year === 'number' ? body.max_risk_pct_per_year : existing.max_risk_pct_per_year,
      min_net_yield_pct:     typeof body.min_net_yield_pct === 'number' ? body.min_net_yield_pct : existing.min_net_yield_pct,
      max_loan_amount:       typeof body.max_loan_amount === 'number' ? body.max_loan_amount : existing.max_loan_amount,
      max_total_capital:     typeof body.max_total_capital === 'number' ? body.max_total_capital : existing.max_total_capital,
      min_reserve_after:     typeof body.min_reserve_after === 'number' ? body.min_reserve_after : existing.min_reserve_after,
      allowed_types:         Array.isArray(body.allowed_types) ? body.allowed_types : existing.allowed_types,
      rate_discount:         typeof body.rate_discount === 'number' ? body.rate_discount : existing.rate_discount,
    };

    state.autoBidRules.set(player_id, updated);

    try {
      await pool.query(
        `INSERT INTO player_auto_bid_rules
           (player_id, enabled, max_risk_pct_per_year, min_net_yield_pct,
            max_loan_amount, max_total_capital, min_reserve_after, allowed_types, rate_discount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (player_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           max_risk_pct_per_year = EXCLUDED.max_risk_pct_per_year,
           min_net_yield_pct = EXCLUDED.min_net_yield_pct,
           max_loan_amount = EXCLUDED.max_loan_amount,
           max_total_capital = EXCLUDED.max_total_capital,
           min_reserve_after = EXCLUDED.min_reserve_after,
           allowed_types = EXCLUDED.allowed_types,
           rate_discount = EXCLUDED.rate_discount`,
        [
          player_id, updated.enabled, updated.max_risk_pct_per_year, updated.min_net_yield_pct,
          updated.max_loan_amount, updated.max_total_capital, updated.min_reserve_after,
          updated.allowed_types, updated.rate_discount,
        ],
      );
      res.json(updated);
    } catch (err) {
      console.error('[auto-bid] PUT error:', err);
      res.status(500).json({ error: 'Failed to save rule' });
    }
  });

  return router;
}
