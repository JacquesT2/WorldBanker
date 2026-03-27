import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate, SectorInvestSchema } from '../middleware/validate';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';
import { SECTOR_LEVEL_COSTS, SECTOR_BUILD_TICKS, SECTOR_RETURN_RATES } from '@argentum/shared';
import type { SectorInvestmentType } from '@argentum/shared';

export function createInvestmentsRouter(state: WorldState) {
  const router = Router();

  // GET /investments — list player's investments
  router.get('/', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const investments = Array.from(state.investments.values()).filter(
      inv => inv.player_id === player_id
    );
    res.json(investments);
  });

  // POST /investments/sector — invest in a town sector
  router.post('/sector', authMiddleware, validate(SectorInvestSchema), async (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const { town_id, sector_type, amount } = req.body as {
      town_id: string;
      sector_type: SectorInvestmentType;
      amount: number;
    };

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

    const currentLevel = town.sectors[sector_type];
    if (currentLevel >= 5) {
      res.status(422).json({ error: `${sector_type} sector is already at maximum level (5)` });
      return;
    }

    const requiredAmount = (SECTOR_LEVEL_COSTS[sector_type] ?? [])[currentLevel] ?? 999999;
    if (amount < requiredAmount) {
      res.status(422).json({
        error: `Insufficient investment for next ${sector_type} level`,
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
    const buildTicks = SECTOR_BUILD_TICKS[sector_type] ?? 90;
    const completion_tick = tick + buildTicks;
    const investId = uuidv4();
    const annual_return_rate = SECTOR_RETURN_RATES[sector_type] ?? 0.04;
    const reputation_bonus = 2.0;

    try {
      await pool.query(
        `INSERT INTO sector_investments
           (id, player_id, town_id, sector_type, amount_invested, completion_tick,
            completed, annual_return_rate, reputation_bonus)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)`,
        [investId, player_id, town_id, sector_type, amount, completion_tick,
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
        sector_type,
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
      console.error('[investments/sector]', err);
      res.status(500).json({ error: 'Failed to create investment' });
    }
  });

  return router;
}
