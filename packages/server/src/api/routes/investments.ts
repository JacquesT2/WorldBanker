import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate, InfrastructureInvestSchema } from '../middleware/validate';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';
import { INFRA_LEVEL_COSTS, INFRA_BUILD_TICKS } from '@argentum/shared';

export function createInvestmentsRouter(state: WorldState) {
  const router = Router();

  // GET /investments
  router.get('/', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const investments = Array.from(state.investments.values()).filter(
      inv => inv.player_id === player_id
    );
    res.json(investments);
  });

  // POST /investments/infrastructure
  router.post('/infrastructure', authMiddleware, validate(InfrastructureInvestSchema), async (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const { town_id, infra_type, amount } = req.body;

    const licenses = state.licenses.get(player_id) ?? [];
    if (!licenses.some(l => l.town_id === town_id)) {
      res.status(403).json({ error: 'No banking license for this town' });
      return;
    }

    const town = state.towns.get(town_id);
    if (!town) {
      res.status(404).json({ error: 'Town not found' });
      return;
    }

    const currentLevel = town.infrastructure[infra_type as keyof typeof town.infrastructure];
    if (currentLevel >= 5) {
      res.status(422).json({ error: `${infra_type} is already at maximum level (5)` });
      return;
    }

    const requiredAmount = (INFRA_LEVEL_COSTS[infra_type] ?? [])[currentLevel] ?? 999999;
    if (amount < requiredAmount) {
      res.status(422).json({
        error: `Insufficient investment for next ${infra_type} level`,
        required: requiredAmount,
        provided: amount,
      });
      return;
    }

    const bs = state.balanceSheets.get(player_id);
    if (!bs || bs.cash < amount) {
      res.status(422).json({ error: 'Insufficient cash' });
      return;
    }

    const tick = state.clock.current_tick;
    const buildTicks = INFRA_BUILD_TICKS[infra_type] ?? 90;
    const completion_tick = tick + buildTicks;
    const investId = uuidv4();

    // Return on investment scales with infra type importance
    const returnRates: Record<string, number> = {
      roads: 0.04, port: 0.06, granary: 0.03, market: 0.05, walls: 0.02
    };
    const annual_return_rate = returnRates[infra_type] ?? 0.04;
    const reputation_bonus = 2.0;

    try {
      await pool.query(
        `INSERT INTO infrastructure_investments
           (id, player_id, town_id, infra_type, amount_invested, completion_tick,
            completed, annual_return_rate, reputation_bonus)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)`,
        [investId, player_id, town_id, infra_type, amount, completion_tick,
         annual_return_rate, reputation_bonus]
      );

      bs.cash -= amount;
      await pool.query(
        'UPDATE balance_sheets SET cash = $1 WHERE player_id = $2',
        [bs.cash, player_id]
      );

      const investment = {
        id: investId,
        player_id,
        town_id,
        infra_type: infra_type as 'roads' | 'port' | 'granary' | 'walls' | 'market',
        amount_invested: amount,
        completion_tick,
        completed: false,
        annual_return_rate,
        reputation_bonus,
      };
      state.investments.set(investId, investment);

      res.status(201).json({
        investment_id: investId,
        completion_tick,
        completes_in_ticks: buildTicks,
      });
    } catch (err) {
      console.error('[investments/infrastructure]', err);
      res.status(500).json({ error: 'Failed to create investment' });
    }
  });

  return router;
}
