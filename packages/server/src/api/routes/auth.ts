import { Router } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/pool';
import { signToken } from '../middleware/auth';
import { validate, RegisterSchema, LoginSchema } from '../middleware/validate';
import type { WorldState } from '../../state/world-state';
import {
  STARTING_CASH, REPUTATION_STARTING,
  calcLicenseCost,
} from '@argentum/shared';

export function createAuthRouter(state: WorldState) {
  const router = Router();

  // POST /auth/register
  router.post('/register', validate(RegisterSchema), async (req, res) => {
    const { username, password, bank_name, starting_town_id } = req.body;

    // Validate starting town exists and is a regional capital
    const town = state.towns.get(starting_town_id);
    if (!town || !town.is_regional_capital) {
      res.status(400).json({ error: 'Starting town must be a regional capital' });
      return;
    }

    try {
      // Check username uniqueness
      const { rows } = await pool.query(
        'SELECT id FROM players WHERE world_id = $1 AND username = $2',
        [state.worldId, username]
      );
      if (rows.length > 0) {
        res.status(409).json({ error: 'Username already taken' });
        return;
      }

      const password_hash = await bcrypt.hash(password, 12);
      const player_id = uuidv4();
      const tick = state.clock.current_tick;

      // Create player
      await pool.query(
        `INSERT INTO players
           (id, world_id, username, password_hash, bank_name, reputation, starting_town_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [player_id, state.worldId, username, password_hash, bank_name, REPUTATION_STARTING, starting_town_id]
      );

      // Create balance sheet with starting cash
      await pool.query(
        `INSERT INTO balance_sheets (player_id, cash, equity) VALUES ($1, $2, $2)`,
        [player_id, STARTING_CASH]
      );

      // Grant free starting license
      const licenseId = uuidv4();
      await pool.query(
        `INSERT INTO banking_licenses
           (id, player_id, town_id, acquired_at_tick, cost_paid, is_starting_license)
         VALUES ($1, $2, $3, $4, 0, true)`,
        [licenseId, player_id, starting_town_id, tick]
      );

      // Create deposit record for starting town (starts at 0 balance)
      const depositId = uuidv4();
      await pool.query(
        `INSERT INTO deposits
           (id, player_id, town_id, balance, interest_rate_offered, last_inflow_tick)
         VALUES ($1, $2, $3, 0, 0.0, $4)`,
        [depositId, player_id, starting_town_id, tick]
      );

      // Create score record
      await pool.query(
        'INSERT INTO player_scores (player_id) VALUES ($1)',
        [player_id]
      );

      // Add to in-memory hot state
      state.players.set(player_id, {
        id: player_id,
        world_id: state.worldId,
        username,
        bank_name,
        reputation: REPUTATION_STARTING,
        starting_town_id,
        is_bankrupt: false,
        created_at: new Date().toISOString(),
      });

      state.balanceSheets.set(player_id, {
        player_id,
        cash: STARTING_CASH,
        total_loan_book: 0,
        total_investments: 0,
        total_deposits_owed: 0,
        total_interest_accrued: 0,
        equity: STARTING_CASH,
        reserve_ratio: 1.0,
        last_updated_tick: tick,
      });

      state.addLicense({
        id: licenseId,
        player_id,
        town_id: starting_town_id,
        acquired_at_tick: tick,
        cost_paid: 0,
        is_starting_license: true,
      });

      state.setDeposit({
        id: depositId,
        player_id,
        town_id: starting_town_id,
        balance: 0,
        interest_rate_offered: 0.0,
        last_inflow_tick: tick,
        last_interest_accrual_tick: tick,
      });

      state.scores.set(player_id, {
        player_id,
        username,
        bank_name,
        total_score: 0,
        net_worth_score: 0,
        portfolio_quality_score: 0,
        reserve_health_score: 0,
        rank: 0,
        last_updated_tick: tick,
      });

      const token = signToken({ player_id, world_id: state.worldId });
      res.status(201).json({ token, player_id, bank_name, starting_town_id });
    } catch (err) {
      console.error('[auth/register]', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // POST /auth/login
  router.post('/login', validate(LoginSchema), async (req, res) => {
    const { username, password } = req.body;

    try {
      const { rows } = await pool.query<{
        id: string; password_hash: string; is_bankrupt: boolean;
      }>(
        'SELECT id, password_hash, is_bankrupt FROM players WHERE world_id = $1 AND username = $2',
        [state.worldId, username]
      );

      if (rows.length === 0) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const player = rows[0]!;
      const valid = await bcrypt.compare(password, player.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = signToken({ player_id: player.id, world_id: state.worldId });
      res.json({ token, player_id: player.id, is_bankrupt: player.is_bankrupt });
    } catch (err) {
      console.error('[auth/login]', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  return router;
}
