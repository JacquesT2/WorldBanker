import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate, PurchaseLicenseSchema } from '../middleware/validate';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';
import { calcLicenseCost } from '@argentum/shared';

export function createLicensesRouter(state: WorldState) {
  const router = Router();

  // GET /licenses — player's current licenses
  router.get('/', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    res.json(state.licenses.get(player_id) ?? []);
  });

  // GET /licenses/market — all towns with license cost estimates
  router.get('/market', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const myLicenses = new Set(
      (state.licenses.get(player_id) ?? []).map(l => l.town_id)
    );

    const market = Array.from(state.towns.values()).map(town => {
      const existingCount = state.getLicensedPlayers(town.id).length;
      const cost = calcLicenseCost(town.population, town.wealth_per_capita, existingCount);
      const region = state.getRegionForTown(town.id);
      return {
        town_id: town.id,
        town_name: town.name,
        region_name: region?.name,
        region_type: region?.type,
        population: town.population,
        wealth_per_capita: town.wealth_per_capita,
        economic_output: town.economic_output,
        existing_license_count: existingCount,
        license_cost: Math.round(cost),
        you_are_licensed: myLicenses.has(town.id),
      };
    });

    res.json(market);
  });

  // POST /licenses/purchase
  router.post('/purchase', authMiddleware, validate(PurchaseLicenseSchema), async (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const { town_id } = req.body;

    const town = state.towns.get(town_id);
    if (!town) {
      res.status(404).json({ error: 'Town not found' });
      return;
    }

    const myLicenses = state.licenses.get(player_id) ?? [];
    if (myLicenses.some(l => l.town_id === town_id)) {
      res.status(409).json({ error: 'You already have a license in this town' });
      return;
    }

    const bs = state.balanceSheets.get(player_id);
    if (!bs) {
      res.status(500).json({ error: 'Balance sheet not found' });
      return;
    }

    const existingCount = state.getLicensedPlayers(town_id).length;
    const cost = Math.round(calcLicenseCost(town.population, town.wealth_per_capita, existingCount));

    if (bs.cash < cost) {
      res.status(422).json({
        error: 'Insufficient cash',
        available: bs.cash,
        required: cost,
      });
      return;
    }

    const tick = state.clock.current_tick;
    const licenseId = uuidv4();
    const depositId = uuidv4();

    try {
      await pool.query(
        `INSERT INTO banking_licenses
           (id, player_id, town_id, acquired_at_tick, cost_paid, is_starting_license)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [licenseId, player_id, town_id, tick, cost]
      );

      // Create a deposit record for this new town
      await pool.query(
        `INSERT INTO deposits
           (id, player_id, town_id, balance, interest_rate_offered, last_inflow_tick)
         VALUES ($1, $2, $3, 0, 0.0, $4)`,
        [depositId, player_id, town_id, tick]
      );

      // Deduct cash
      bs.cash -= cost;
      await pool.query(
        'UPDATE balance_sheets SET cash = $1 WHERE player_id = $2',
        [bs.cash, player_id]
      );

      // Update hot state
      const license = {
        id: licenseId,
        player_id,
        town_id,
        acquired_at_tick: tick,
        cost_paid: cost,
        is_starting_license: false,
      };
      state.addLicense(license);
      state.setDeposit({
        id: depositId,
        player_id,
        town_id,
        balance: 0,
        interest_rate_offered: 0.0,
        last_inflow_tick: tick,
        last_interest_accrual_tick: tick,
      });

      res.status(201).json({ license_id: licenseId, cost, town_id });
    } catch (err) {
      console.error('[licenses/purchase]', err);
      res.status(500).json({ error: 'Failed to purchase license' });
    }
  });

  return router;
}
