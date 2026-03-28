import { Pool } from 'pg';
import type { Server as SocketServer } from 'socket.io';
import { WorldState } from '../state/world-state';
import { advanceWorldClock } from './world-clock';
import { rollWorldEvents } from './event-roller';
import { updateEconomy } from './economy-updater';
import { updatePopulation } from './population-updater';
import { processLoans } from './loan-processor';
import { processDeposits } from './deposit-processor';
import { processCompanies } from './company-processor';
import { processAuctions, type AuctionProcessorResult } from './auction-processor';
import { executeAutoBids, type AutoBidResult } from './auto-bid-executor';
import { updateBalanceSheets } from './balance-sheet-updater';
import { executeBots } from './bot-executor';
import { checkBankruptcy } from './bankruptcy-checker';
import { updateLeaderboard } from './leaderboard-updater';
import { buildTickDelta } from './delta-broadcaster';
import { TICK_INTERVAL_MS, STARTING_CASH, REPUTATION_STARTING, TOWNS } from '@argentum/shared';
import type { TickDelta, WorldEvent } from '@argentum/shared';

interface TickStep {
  name: string;
  fn: () => unknown;
}

/**
 * The main game loop. Fires every TICK_INTERVAL_MS (5 seconds).
 * Each of the 11 steps is error-isolated: a failure in one step
 * logs to tick_log and continues rather than halting the engine.
 */
export class TickEngine {
  private state: WorldState;
  private pool: Pool;
  private io: SocketServer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastDbWritePromise: Promise<void> | null = null;
  private isRunning = false;
  private speedMultiplier = 1;
  private paused = false;

  constructor(state: WorldState, pool: Pool) {
    this.state = state;
    this.pool = pool;
  }

  attachSocket(io: SocketServer): void {
    this.io = io;
  }

  getStatus(): { running: boolean; paused: boolean; speedMultiplier: number; tick: number } {
    return {
      running: this.isRunning,
      paused: this.paused,
      speedMultiplier: this.speedMultiplier,
      tick: this.state.clock.current_tick,
    };
  }

  setSpeed(multiplier: number): void {
    this.speedMultiplier = multiplier;
    if (this.isRunning && !this.paused) {
      // Restart timer at new interval
      if (this.timer) clearInterval(this.timer);
      const interval = Math.round(TICK_INTERVAL_MS / multiplier);
      console.log(`[tick-engine] Speed set to ${multiplier}x (${interval}ms/tick)`);
      this.timer = setInterval(() => {
        this.runTick().catch(err => console.error('[tick-engine] Unexpected tick error:', err.message));
      }, interval);
    }
  }

  pause(): void {
    if (!this.isRunning || this.paused) return;
    this.paused = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    console.log('[tick-engine] Paused');
  }

  resume(): void {
    if (!this.isRunning || !this.paused) return;
    this.paused = false;
    const interval = Math.round(TICK_INTERVAL_MS / this.speedMultiplier);
    this.timer = setInterval(() => {
      this.runTick().catch(err => console.error('[tick-engine] Unexpected tick error:', err.message));
    }, interval);
    console.log('[tick-engine] Resumed');
  }

  async resetGame(): Promise<void> {
    const wasPaused = this.paused;
    this.pause();

    try {
      // ── Clear all transient player/game state ────────────────────────────
      await this.pool.query('DELETE FROM auction_bids');
      await this.pool.query('DELETE FROM loan_auctions');
      await this.pool.query('DELETE FROM loan_proposals');
      await this.pool.query('DELETE FROM loans');
      await this.pool.query('DELETE FROM deposits');
      await this.pool.query('DELETE FROM banking_licenses');
      await this.pool.query('DELETE FROM world_events WHERE world_id = $1', [this.state.worldId]);
      await this.pool.query('DELETE FROM event_cooldowns WHERE world_id = $1', [this.state.worldId]);
      await this.pool.query('DELETE FROM player_scores');
      await this.pool.query('DELETE FROM player_balance_history');
      await this.pool.query('DELETE FROM tick_log WHERE world_id = $1', [this.state.worldId]);

      // ── Reset player state ───────────────────────────────────────────────
      await this.pool.query(
        `UPDATE players SET reputation = $1, is_bankrupt = false, bankruptcy_tick = null`,
        [REPUTATION_STARTING],
      );
      await this.pool.query(
        `UPDATE balance_sheets SET cash = $1, total_loan_book = 0,
         total_deposits_owed = 0, total_interest_accrued = 0, equity = $1, reserve_ratio = 1.0, last_updated_tick = 0`,
        [STARTING_CASH],
      );

      // ── Reset companies to active status and restore financial state ──────
      await this.pool.query(
        `UPDATE companies SET status = 'active', total_debt = 0, cash = 500
         WHERE world_id = $1`,
        [this.state.worldId],
      );
      // Restore orphaned assets to their original companies
      await this.pool.query(
        `UPDATE company_assets ca
         SET company_id = (
           SELECT c.id FROM companies c
           WHERE c.world_id = $1
             AND c.town_id = ca.town_id
           ORDER BY c.founded_at_tick
           LIMIT 1
         ), condition = 100, orphaned_at_tick = NULL
         WHERE ca.company_id IS NULL AND ca.world_id = $1`,
        [this.state.worldId],
      );
      // Clear company relations
      await this.pool.query(
        `DELETE FROM company_relations cr
         USING players p
         WHERE cr.player_id = p.id AND p.world_id = $1`,
        [this.state.worldId],
      );

      // ── Reset town population, economic output, and sectors to seed values ─
      for (const town of TOWNS) {
        await this.pool.query(
          `UPDATE towns SET population = $1, wealth_per_capita = $2, economic_output = 0,
           sector_military = 0, sector_heavy_industry = 0, sector_construction = 0,
           sector_commerce = 0, sector_maritime = 0, sector_agriculture = 0
           WHERE id = $3`,
          [town.population, town.wealth_per_capita, town.id],
        );
      }

      // ── Reset world clock and cycle ──────────────────────────────────────
      await this.pool.query(
        `UPDATE world_clock SET current_tick = 0, current_day = 1, current_season = 'spring', current_year = 1
         WHERE world_id = $1`,
        [this.state.worldId],
      );
      await this.pool.query(
        `UPDATE economic_cycle SET phase = 'normal', phase_tick_start = 0, phase_duration = 90, multiplier = 1.0
         WHERE world_id = $1`,
        [this.state.worldId],
      );

      // ── Reload hot state from DB ─────────────────────────────────────────
      const { loadWorldState } = await import('../state/state-loader');
      const fresh = await loadWorldState(this.pool);
      this.state.replaceWith(fresh);

      // Notify all clients to reload their snapshot
      if (this.io) {
        this.io.to(this.state.worldId).emit('game:reset', {});
      }

      console.log('[tick-engine] Full game reset complete');
    } catch (err) {
      console.error('[tick-engine] Reset error:', (err as Error).message);
      throw err;
    }

    if (!wasPaused) this.resume();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.paused = false;
    console.log(`[tick-engine] Starting — world "${this.state.worldName}", tick ${this.state.clock.current_tick}`);
    const interval = Math.round(TICK_INTERVAL_MS / this.speedMultiplier);
    this.timer = setInterval(() => {
      this.runTick().catch(err => {
        console.error('[tick-engine] Unexpected tick error:', err.message);
      });
    }, interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[tick-engine] Stopped');
  }

  private async runTick(): Promise<void> {
    const tickStart = Date.now();
    const tickNumber = this.state.clock.current_tick + 1; // will be set after step 1
    const stepTimings: Record<string, number> = {};
    const errors: Array<{ step: string; message: string }> = [];

    // Capture resolved events before this tick decrements them
    const eventsBeforeThisTick = new Map(this.state.events);

    // Mutable accumulator for cross-step data
    let newEvents: WorldEvent[] = [];
    let resolvedEventIds: string[] = [];
    let defaultedLoans: Array<{ loan_id: string; player_id: string; recovery_amount: number }> = [];
    let repaidLoans: Array<{ loan_id: string; player_id: string }> = [];
    let bankruptcyPlayerIds: string[] = [];
    const proposalsBefore = new Set(this.state.loanProposals.keys());
    const auctionsBefore = new Set(this.state.auctions.keys());
    let auctionResult: AuctionProcessorResult = { newAuctions: [], closedAuctionIds: [], closedAuctions: [], bidUpdates: [], newLoansByPlayer: new Map() };
    let autoBidResult: AutoBidResult = { bidUpdates: [] };

    // Run each step, isolated
    const steps: TickStep[] = [
      { name: 'world-clock',             fn: () => advanceWorldClock(this.state) },
      { name: 'event-roller',            fn: () => { newEvents = rollWorldEvents(this.state); } },
      { name: 'economy-updater',         fn: () => updateEconomy(this.state) },
      { name: 'population-updater',      fn: () => updatePopulation(this.state) },
      { name: 'loan-processor',          fn: () => {
        const r = processLoans(this.state);
        defaultedLoans = r.defaulted;
        repaidLoans    = r.repaid;
      }},
      { name: 'deposit-processor',       fn: () => processDeposits(this.state) },
      { name: 'company-processor',        fn: () => processCompanies(this.state) },
      { name: 'auto-bid-executor',        fn: () => { autoBidResult = executeAutoBids(this.state); } },
      { name: 'auction-processor',       fn: () => {
        auctionResult = processAuctions(this.state, auctionsBefore);
      }},
      { name: 'balance-sheet-updater',   fn: () => updateBalanceSheets(this.state) },
      { name: 'bot-executor',            fn: () => executeBots(this.state) },
      { name: 'bankruptcy-checker',      fn: () => {
        const b = checkBankruptcy(this.state);
        bankruptcyPlayerIds = b.map(x => x.player_id);
      }},
      { name: 'leaderboard-updater',     fn: () => updateLeaderboard(this.state) },
    ];

    for (const step of steps) {
      const t0 = Date.now();
      try {
        step.fn();
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        errors.push({ step: step.name, message: msg });
        console.error(`[tick-engine] Step "${step.name}" failed: ${msg}`);
      }
      stepTimings[step.name] = Date.now() - t0;
    }

    // Compute resolved events (were active before, now ticks_remaining = 0)
    for (const [id, event] of eventsBeforeThisTick) {
      if (event.ticks_remaining > 0 && (this.state.events.get(id)?.ticks_remaining ?? 0) === 0) {
        resolvedEventIds.push(id);
      }
    }

    // New proposals generated this tick
    const newProposals = Array.from(this.state.loanProposals.values()).filter(
      p => !proposalsBefore.has(p.id)
    );
    const expiredProposalIds = Array.from(proposalsBefore).filter(
      id => !this.state.loanProposals.has(id)
    );

    // Build leaderboard
    const leaderboard = Array.from(this.state.scores.values())
      .sort((a, b) => a.rank - b.rank);

    // Merge auto-bid updates into auction result before building delta
    for (const update of autoBidResult.bidUpdates) {
      const existing = auctionResult.bidUpdates.findIndex(u => u.auction_id === update.auction_id);
      if (existing >= 0) {
        auctionResult.bidUpdates[existing] = update;
      } else {
        auctionResult.bidUpdates.push(update);
      }
    }

    // Build delta (step 11)
    let delta: TickDelta | null = null;
    try {
      delta = buildTickDelta(this.state, {
        newEvents,
        resolvedEventIds,
        defaultedLoans,
        repaidLoans,
        bankruptcyPlayerIds,
        newProposals,
        expiredProposalIds,
        auctionResult,
        leaderboard,
      });
    } catch (err) {
      errors.push({ step: 'delta-broadcaster', message: (err as Error).message });
    }

    const totalMs = Date.now() - tickStart;

    // Broadcast to all connected clients
    if (delta && this.io) {
      this.io.to(this.state.worldId).emit('tick:delta', delta);

      // Notify bankruptcies individually
      for (const playerId of bankruptcyPlayerIds) {
        const player = this.state.players.get(playerId);
        if (player) {
          this.io.to(this.state.worldId).emit('player:bankrupt', {
            player_id: playerId,
            bank_name: player.bank_name,
          });
        }
      }

      // Notify auction closures
      for (const closed of auctionResult.closedAuctions) {
        this.io.to(this.state.worldId).emit('auction:closed', {
          auction_id: closed.auction_id,
          status: closed.status,
          winning_bid: closed.winning_bid,
          loan_id: closed.loan_id,
        });
      }
    }

    if (totalMs > TICK_INTERVAL_MS * 0.5) {
      console.warn(`[tick-engine] Tick ${tickNumber} slow: ${totalMs}ms`);
    }

    // Fire-and-forget DB persistence (do not await before next tick)
    const dbWrite = this.persistTick(tickNumber, totalMs, stepTimings, errors);
    this.lastDbWritePromise = dbWrite;
  }

  private async persistTick(
    tickNumber: number,
    durationMs: number,
    stepTimings: Record<string, number>,
    errors: Array<{ step: string; message: string }>,
  ): Promise<void> {
    const state = this.state;
    const pool = this.pool;

    try {
      await pool.query(
        `INSERT INTO tick_log (world_id, tick_number, duration_ms, step_timings, error_count, errors)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          state.worldId,
          tickNumber,
          durationMs,
          JSON.stringify(stepTimings),
          errors.length,
          errors.length > 0 ? JSON.stringify(errors) : null,
        ]
      );

      // Persist clock
      await pool.query(
        `INSERT INTO world_clock (world_id, current_tick, current_day, current_season, current_year)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (world_id) DO UPDATE SET
           current_tick = EXCLUDED.current_tick,
           current_day = EXCLUDED.current_day,
           current_season = EXCLUDED.current_season,
           current_year = EXCLUDED.current_year`,
        [state.worldId, state.clock.current_tick, state.clock.current_day,
         state.clock.current_season, state.clock.current_year]
      );

      // Persist cycle
      await pool.query(
        `INSERT INTO economic_cycle (world_id, phase, phase_tick_start, phase_duration, multiplier)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (world_id) DO UPDATE SET
           phase = EXCLUDED.phase,
           phase_tick_start = EXCLUDED.phase_tick_start,
           phase_duration = EXCLUDED.phase_duration,
           multiplier = EXCLUDED.multiplier`,
        [state.worldId, state.cycle.phase, state.cycle.phase_tick_start,
         state.cycle.phase_duration, state.cycle.multiplier]
      );

      // Persist balance sheets (batch upsert)
      const bsValues: unknown[] = [];
      const bsParams: string[] = [];
      let i = 1;
      for (const bs of state.balanceSheets.values()) {
        bsValues.push(
          bs.player_id, bs.cash, bs.total_loan_book,
          bs.total_deposits_owed, bs.total_interest_accrued, bs.equity,
          bs.reserve_ratio, bs.last_updated_tick
        );
        bsParams.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},$${i+5},$${i+6},$${i+7})`);
        i += 8;
      }
      if (bsValues.length > 0) {
        await pool.query(
          `INSERT INTO balance_sheets
             (player_id, cash, total_loan_book, total_deposits_owed,
              total_interest_accrued, equity, reserve_ratio, last_updated_tick)
           VALUES ${bsParams.join(',')}
           ON CONFLICT (player_id) DO UPDATE SET
             cash = EXCLUDED.cash,
             total_loan_book = EXCLUDED.total_loan_book,
             total_deposits_owed = EXCLUDED.total_deposits_owed,
             total_interest_accrued = EXCLUDED.total_interest_accrued,
             equity = EXCLUDED.equity,
             reserve_ratio = EXCLUDED.reserve_ratio,
             last_updated_tick = EXCLUDED.last_updated_tick`,
          bsValues
        );
      }

      // Persist changed loans (only non-active status changes)
      for (const loan of state.loans.values()) {
        if (loan.status !== 'active') {
          await pool.query(
            `UPDATE loans SET
               outstanding_balance = $1, ticks_elapsed = $2, status = $3,
               default_probability_per_tick = $4, defaulted_at_tick = $5, repaid_at_tick = $6
             WHERE id = $7`,
            [loan.outstanding_balance, loan.ticks_elapsed, loan.status,
             loan.default_probability_per_tick, loan.defaulted_at_tick ?? null,
             loan.repaid_at_tick ?? null, loan.id]
          );
        } else {
          // Just update balance and elapsed for active loans (less frequently is fine,
          // but we do it every tick for crash safety)
          await pool.query(
            `UPDATE loans SET outstanding_balance = $1, ticks_elapsed = $2,
               default_probability_per_tick = $3 WHERE id = $4`,
            [loan.outstanding_balance, loan.ticks_elapsed,
             loan.default_probability_per_tick, loan.id]
          );
        }
      }

      // Persist changed deposits
      for (const deposit of state.deposits.values()) {
        await pool.query(
          `UPDATE deposits SET balance = $1, last_inflow_tick = $2,
             last_interest_accrual_tick = $3 WHERE id = $4`,
          [deposit.balance, deposit.last_inflow_tick,
           deposit.last_interest_accrual_tick, deposit.id]
        );
      }

      // Persist town population + economic output (every 10 ticks)
      if (state.clock.current_tick % 10 === 0) {
        for (const town of state.towns.values()) {
          await pool.query(
            `UPDATE towns SET population = $1, economic_output = $2 WHERE id = $3`,
            [town.population, town.economic_output, town.id]
          );
        }

        // Persist company financial state
        for (const company of state.companies.values()) {
          await pool.query(
            `UPDATE companies SET
               cash = $1, annual_revenue = $2, annual_expenses = $3,
               equity = $4, total_debt = $5, status = $6, asset_count = $7
             WHERE id = $8`,
            [
              company.cash, company.annual_revenue, company.annual_expenses,
              company.equity, company.total_debt, company.status, company.asset_count,
              company.id,
            ]
          );
        }

        // Persist orphaned asset conditions
        for (const asset of state.companyAssets.values()) {
          if (asset.company_id === null) {
            await pool.query(
              `UPDATE company_assets SET condition = $1, annual_revenue = $2, company_id = NULL,
                 orphaned_at_tick = $3 WHERE id = $4`,
              [asset.condition, asset.annual_revenue, asset.orphaned_at_tick ?? null, asset.id]
            );
          }
        }

        // Persist company relations
        for (const rel of state.companyRelations.values()) {
          await pool.query(
            `INSERT INTO company_relations (company_id, player_id, score, last_interaction_tick)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (company_id, player_id) DO UPDATE SET
               score = EXCLUDED.score,
               last_interaction_tick = EXCLUDED.last_interaction_tick`,
            [rel.company_id, rel.player_id, rel.score, rel.last_interaction_tick]
          );
        }
      }

      // Persist player scores
      for (const score of state.scores.values()) {
        await pool.query(
          `INSERT INTO player_scores
             (player_id, total_score, net_worth_score, portfolio_quality_score,
              reserve_health_score, rank, last_updated_tick)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (player_id) DO UPDATE SET
             total_score = EXCLUDED.total_score,
             net_worth_score = EXCLUDED.net_worth_score,
             portfolio_quality_score = EXCLUDED.portfolio_quality_score,
             reserve_health_score = EXCLUDED.reserve_health_score,
             rank = EXCLUDED.rank,
             last_updated_tick = EXCLUDED.last_updated_tick`,
          [score.player_id, score.total_score, score.net_worth_score,
           score.portfolio_quality_score, score.reserve_health_score,
           score.rank, score.last_updated_tick]
        );
      }

      // Persist player bankruptcy state
      for (const player of state.players.values()) {
        if (player.is_bankrupt) {
          await pool.query(
            'UPDATE players SET is_bankrupt = true, bankruptcy_tick = $1, reputation = 0 WHERE id = $2',
            [player.bankruptcy_tick, player.id]
          );
        }
      }

    } catch (err) {
      console.error('[tick-engine] DB persist error:', (err as Error).message);
    }
  }

  /** Called on SIGTERM for graceful shutdown */
  async shutdown(): Promise<void> {
    this.stop();
    if (this.lastDbWritePromise) {
      await this.lastDbWritePromise.catch(() => {});
    }
    console.log('[tick-engine] Graceful shutdown complete');
  }
}
