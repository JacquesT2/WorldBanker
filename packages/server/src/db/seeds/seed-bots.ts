import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import { REPUTATION_STARTING, calcLicenseCost } from '@argentum/shared';
import type { WorldState } from '../../state/world-state';
import type { Player, BalanceSheet, BankingLicense, Deposit } from '@argentum/shared';
import { BOT_STRATEGIES } from '../../engine/bot-strategies';

/**
 * Create bot players for all defined strategies if they don't exist yet.
 * Called at server startup after the world state is loaded.
 */
export async function seedBots(pool: Pool, state: WorldState): Promise<void> {
  const tick = state.clock.current_tick;

  for (const strategy of BOT_STRATEGIES) {
    // Check if bot already exists in DB
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM players WHERE world_id = $1 AND username = $2',
      [state.worldId, strategy.username],
    );
    if (rows.length > 0) {
      // Already exists — just make sure it's loaded in state (in case of schema update)
      continue;
    }

    const startingTown = state.towns.get(strategy.startingTownId);
    if (!startingTown) {
      console.warn(`[seed-bots] Starting town "${strategy.startingTownId}" not found for bot "${strategy.id}". Skipping.`);
      continue;
    }

    const playerId    = uuidv4();
    const licenseId   = uuidv4();
    const depositId   = uuidv4();
    const existingLicenseCount = (state.townLicenses.get(strategy.startingTownId) ?? []).length;
    const licenseCost = calcLicenseCost(startingTown.population, startingTown.wealth_per_capita, existingLicenseCount);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Player row (no password_hash needed — bots never log in)
      await client.query(
        `INSERT INTO players
           (id, world_id, username, password_hash, bank_name, reputation,
            starting_town_id, is_bot, bot_strategy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)`,
        [
          playerId, state.worldId, strategy.username,
          '$2b$12$placeholder_bots_never_login_XXXXX',
          strategy.bankName, REPUTATION_STARTING,
          strategy.startingTownId, strategy.id,
        ],
      );

      // Balance sheet
      await client.query(
        `INSERT INTO balance_sheets (player_id, cash, equity)
         VALUES ($1, $2, $2)`,
        [playerId, strategy.startingCash],
      );

      // Starting license
      await client.query(
        `INSERT INTO banking_licenses
           (id, player_id, town_id, acquired_at_tick, cost_paid, is_starting_license)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [licenseId, playerId, strategy.startingTownId, tick, licenseCost],
      );

      // Starting deposit slot
      await client.query(
        `INSERT INTO deposits
           (id, player_id, town_id, balance, interest_rate_offered, last_inflow_tick, last_interest_accrual_tick)
         VALUES ($1, $2, $3, 0, $4, $5, $5)`,
        [depositId, playerId, strategy.startingTownId, strategy.depositRateOffered, tick],
      );

      // Score row
      await client.query(
        'INSERT INTO player_scores (player_id) VALUES ($1)',
        [playerId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[seed-bots] Failed to create bot "${strategy.id}":`, (err as Error).message);
      client.release();
      continue;
    }
    client.release();

    // Load into hot state
    const player: Player = {
      id: playerId,
      world_id: state.worldId,
      username: strategy.username,
      bank_name: strategy.bankName,
      reputation: REPUTATION_STARTING,
      starting_town_id: strategy.startingTownId,
      is_bankrupt: false,
      is_bot: true,
      bot_strategy: strategy.id,
      created_at: new Date().toISOString(),
    };
    state.players.set(playerId, player);

    const bs: BalanceSheet = {
      player_id: playerId,
      cash: strategy.startingCash,
      total_loan_book: 0,
      total_deposits_owed: 0,
      total_interest_accrued: 0,
      equity: strategy.startingCash,
      reserve_ratio: 1.0,
      last_updated_tick: tick,
    };
    state.balanceSheets.set(playerId, bs);

    const license: BankingLicense = {
      id: licenseId,
      player_id: playerId,
      town_id: strategy.startingTownId,
      acquired_at_tick: tick,
      cost_paid: licenseCost,
      is_starting_license: true,
    };
    state.addLicense(license);

    const deposit: Deposit = {
      id: depositId,
      player_id: playerId,
      town_id: strategy.startingTownId,
      balance: 0,
      interest_rate_offered: strategy.depositRateOffered,
      last_inflow_tick: tick,
      last_interest_accrual_tick: tick,
    };
    state.setDeposit(deposit);

    state.scores.set(playerId, {
      player_id: playerId,
      username: strategy.username,
      bank_name: strategy.bankName,
      total_score: 0,
      net_worth_score: 0,
      portfolio_quality_score: 0,
      reserve_health_score: 0,
      rank: 0,
      last_updated_tick: tick,
    });

    console.log(`[seed-bots] Created bot: "${strategy.bankName}" (${strategy.id}) at ${startingTown.name}`);
  }
}
