import type { LoanAuction, BalanceSheet } from '@argentum/shared';
import type { WorldState } from '../state/world-state';
import { pool } from '../db/pool';
import { BOT_STRATEGIES, type BotStrategy } from './bot-strategies';

// ─── Rule helpers ─────────────────────────────────────────────────────────────

function lgd(a: LoanAuction): number {
  const recovery = (a.collateral_value * a.partial_recovery_rate) / a.requested_amount;
  return Math.max(0, 1 - recovery);
}

function netYieldPct(a: LoanAuction, offeredRate: number): number {
  return (offeredRate - a.base_default_probability * 360 * lgd(a)) * 100;
}

function passesRule(
  a: LoanAuction,
  s: BotStrategy,
  bs: BalanceSheet,
  deployedSoFar: number,
): boolean {
  const annualRiskPct = a.base_default_probability * 360 * 100;
  const offeredRate   = Math.max(0.02, a.max_acceptable_rate - s.rateDiscount);
  const ny            = netYieldPct(a, offeredRate);

  if (annualRiskPct > s.maxRiskPctPerYear) return false;
  if (ny < s.minNetYieldPct) return false;
  if (s.minLoanAmount > 0 && a.requested_amount < s.minLoanAmount) return false;
  if (s.maxLoanAmount > 0 && a.requested_amount > s.maxLoanAmount) return false;
  if (s.preferredTypes.length > 0 && !s.preferredTypes.includes(a.company_type)) return false;

  // Reserve ratio after this loan
  const cashAfter    = bs.cash - deployedSoFar - a.requested_amount;
  const reserveAfter = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
  if (reserveAfter < s.minReserveAfter) return false;
  if (cashAfter < 0) return false;

  return true;
}

// ─── Main executor ────────────────────────────────────────────────────────────

export function executeBots(state: WorldState): void {
  const tick = state.clock.current_tick;

  for (const player of state.players.values()) {
    if (!player.is_bot || player.is_bankrupt) continue;

    const strategy = BOT_STRATEGIES.find(s => s.id === player.bot_strategy);
    if (!strategy) continue;

    // Spread bot activations across ticks using a stable per-bot offset
    const offset = parseInt(player.id.slice(-4), 16) % strategy.actEveryNTicks;
    if ((tick + offset) % strategy.actEveryNTicks !== 0) continue;

    const bs = state.balanceSheets.get(player.id);
    if (!bs) continue;

    const licenses = state.licenses.get(player.id) ?? [];
    let bidCount = 0;

    for (const license of licenses) {
      if (bidCount >= strategy.maxLoansPerBatch) break;

      // Get open auctions in this town where bot hasn't already bid
      const auctions = Array.from(state.auctions.values()).filter(
        a =>
          a.town_id === license.town_id &&
          a.status === 'open' &&
          a.closes_at_tick > tick &&
          !a.bids.some(b => b.player_id === player.id)
      ).sort((a, b) => {
        const rateA = Math.max(0.02, a.max_acceptable_rate - strategy.rateDiscount);
        const rateB = Math.max(0.02, b.max_acceptable_rate - strategy.rateDiscount);
        return netYieldPct(b, rateB) - netYieldPct(a, rateA);
      });

      for (const auction of auctions) {
        if (bidCount >= strategy.maxLoansPerBatch) break;
        if (!passesRule(auction, strategy, bs, 0)) continue;

        // Bot bids just below max_acceptable_rate minus its discount
        // Add small random noise so bots don't all bid identically
        const baseRate = Math.max(0.02, auction.max_acceptable_rate - strategy.rateDiscount);
        const noise = (Math.random() - 0.5) * 0.005; // ±0.25% randomness
        const offeredRate = Math.min(
          auction.max_acceptable_rate,
          Math.max(0.02, baseRate + noise),
        );

        auction.bids.push({
          player_id: player.id,
          bank_name: player.bank_name,
          offered_rate: offeredRate,
          bid_tick: tick,
        });
        bidCount++;

        // Persist bid to DB
        pool.query(
          `INSERT INTO auction_bids (auction_id, player_id, offered_rate, bid_tick)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (auction_id, player_id) DO UPDATE SET offered_rate = EXCLUDED.offered_rate, bid_tick = EXCLUDED.bid_tick`,
          [auction.id, player.id, offeredRate, tick],
        ).catch(e => console.error(`[bot-executor] bid insert: ${e.message}`));
      }
    }

    if (bidCount > 0) {
      console.log(`[bot] ${player.bank_name} placed ${bidCount} auction bid(s) at tick ${tick}`);
    }
  }
}
