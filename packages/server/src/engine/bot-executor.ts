import { v4 as uuidv4 } from 'uuid';
import { calcDefaultProbabilityPerTick } from '@argentum/shared';
import type { Loan, LoanProposal, BalanceSheet } from '@argentum/shared';
import type { WorldState } from '../state/world-state';
import { pool } from '../db/pool';
import { BOT_STRATEGIES, type BotStrategy } from './bot-strategies';

// ─── Rule helpers ─────────────────────────────────────────────────────────────

function lgd(p: LoanProposal): number {
  const recovery = (p.collateral_value * p.partial_recovery_rate) / p.requested_amount;
  return Math.max(0, 1 - recovery);
}

function netYieldPct(p: LoanProposal, offeredRate: number): number {
  return (offeredRate - p.base_default_probability * 360 * lgd(p)) * 100;
}

function passesRule(
  p: LoanProposal,
  s: BotStrategy,
  bs: BalanceSheet,
  deployedSoFar: number,
): boolean {
  const annualRiskPct = p.base_default_probability * 360 * 100;
  const offeredRate   = Math.max(0.02, p.max_acceptable_rate - s.rateDiscount);
  const ny            = netYieldPct(p, offeredRate);

  if (annualRiskPct > s.maxRiskPctPerYear) return false;
  if (ny < s.minNetYieldPct) return false;
  if (s.minLoanAmount > 0 && p.requested_amount < s.minLoanAmount) return false;
  if (s.maxLoanAmount > 0 && p.requested_amount > s.maxLoanAmount) return false;
  if (s.preferredTypes.length > 0 && !s.preferredTypes.includes(p.borrower_type)) return false;

  // Reserve ratio after this loan
  const cashAfter    = bs.cash - deployedSoFar - p.requested_amount;
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
    let acceptedCount = 0;
    let deployedSoFar = 0;

    for (const license of licenses) {
      if (acceptedCount >= strategy.maxLoansPerBatch) break;

      // Get available proposals and sort by net yield descending
      const proposals = state.getProposalsForTown(license.town_id, tick)
        .sort((a, b) => {
          const rateA = Math.max(0.02, a.max_acceptable_rate - strategy.rateDiscount);
          const rateB = Math.max(0.02, b.max_acceptable_rate - strategy.rateDiscount);
          return netYieldPct(b, rateB) - netYieldPct(a, rateA);
        });

      for (const p of proposals) {
        if (acceptedCount >= strategy.maxLoansPerBatch) break;
        if (!passesRule(p, strategy, bs, deployedSoFar)) continue;

        const offeredRate = Math.max(0.02, p.max_acceptable_rate - strategy.rateDiscount);
        const region      = state.getRegionForTown(p.town_id);
        const events      = state.getActiveEventsForTown(p.town_id);
        const loanId      = uuidv4();

        const loanData: Loan = {
          id: loanId,
          player_id: player.id,
          town_id: p.town_id,
          borrower_name: p.borrower_name,
          borrower_type: p.borrower_type,
          principal: p.requested_amount,
          outstanding_balance: p.requested_amount,
          interest_rate: offeredRate,
          term_ticks: p.term_ticks,
          ticks_elapsed: 0,
          status: 'active',
          default_probability_per_tick: calcDefaultProbabilityPerTick(
            { borrower_type: p.borrower_type, ticks_elapsed: 0, term_ticks: p.term_ticks, interest_rate: offeredRate },
            region?.base_risk_modifier ?? 1.0,
            events,
          ),
          collateral_value: p.collateral_value,
          partial_recovery_rate: p.partial_recovery_rate,
          created_at_tick: tick,
        };

        // Mutate hot state (same as REST route)
        bs.cash -= p.requested_amount;
        deployedSoFar += p.requested_amount;
        state.loanProposals.delete(p.id);
        state.addLoan(loanData);
        acceptedCount++;

        // Fire-and-forget DB writes
        pool.query(
          `INSERT INTO loans
             (id, player_id, town_id, borrower_name, borrower_type, principal,
              outstanding_balance, interest_rate, term_ticks, ticks_elapsed, status,
              default_probability_per_tick, collateral_value, partial_recovery_rate, created_at_tick)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            loanId, player.id, p.town_id, p.borrower_name, p.borrower_type,
            p.requested_amount, p.requested_amount, offeredRate, p.term_ticks,
            0, 'active', loanData.default_probability_per_tick,
            p.collateral_value, p.partial_recovery_rate, tick,
          ],
        ).catch(e => console.error(`[bot-executor] loan insert: ${e.message}`));

        pool.query(
          'UPDATE loan_proposals SET accepted_by_player_id = $1, accepted_at_tick = $2 WHERE id = $3',
          [player.id, tick, p.id],
        ).catch(e => console.error(`[bot-executor] proposal update: ${e.message}`));
      }
    }

    if (acceptedCount > 0) {
      console.log(`[bot] ${player.bank_name} accepted ${acceptedCount} loan(s) at tick ${tick}`);
    }
  }
}
