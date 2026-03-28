import type { WorldState } from '../state/world-state';
import {
  calcRecoveryAmount,
  rollLoanDefault,
  TICKS_PER_YEAR,
} from '@argentum/shared';
import { calcCompanyDefaultProbability } from './company-processor';

export interface LoanProcessorResult {
  defaulted: Array<{ loan_id: string; player_id: string; recovery_amount: number }>;
  repaid: Array<{ loan_id: string; player_id: string }>;
}

/**
 * Step 5: Process all active loans.
 * - Accrue interest (added to outstanding_balance)
 * - Roll for default using company traits + relation score
 * - Check if term has expired (full repayment)
 * - Update company total_debt on repayment/default
 */
export function processLoans(state: WorldState): LoanProcessorResult {
  const result: LoanProcessorResult = { defaulted: [], repaid: [] };
  const tick = state.clock.current_tick;

  for (const loan of state.loans.values()) {
    if (loan.status !== 'active') continue;

    const region = state.getRegionForTown(loan.town_id);
    if (!region) continue;

    const company = state.companies.get(loan.company_id);
    const activeEvents = state.getActiveEventsForTown(loan.town_id);

    // Event modifier on default probability
    const eventModifier = activeEvents.reduce(
      (acc, e) => acc * e.loan_default_modifier, 1.0
    );

    // Accrue interest
    const interestPerTick = loan.outstanding_balance * (loan.interest_rate / TICKS_PER_YEAR);
    loan.outstanding_balance += interestPerTick;

    // Update default probability using company traits + relation
    loan.ticks_elapsed += 1;

    if (company) {
      const relation = state.getRelation(loan.company_id, loan.player_id);
      loan.default_probability_per_tick = calcCompanyDefaultProbability(
        company,
        loan.player_id,
        region.base_risk_modifier,
        eventModifier,
        relation.score,
      );
    } else {
      // Company no longer exists in state — treat as very high risk
      loan.default_probability_per_tick = 0.05;
    }

    // Roll for default
    if (rollLoanDefault(loan.default_probability_per_tick)) {
      const recovery = calcRecoveryAmount(
        loan.outstanding_balance,
        loan.collateral_value,
        loan.partial_recovery_rate,
      );
      loan.status = 'defaulted';
      loan.defaulted_at_tick = tick;

      const bs = state.balanceSheets.get(loan.player_id);
      if (bs) bs.cash += recovery;

      const player = state.players.get(loan.player_id);
      if (player) player.reputation = Math.max(0, player.reputation - 2);

      // Update company total_debt
      if (company) {
        company.total_debt = Math.max(0, company.total_debt - loan.outstanding_balance);
      }

      // Damage relation: company defaulted on this player
      if (company) {
        const rel = state.getRelation(loan.company_id, loan.player_id);
        state.setRelation({
          ...rel,
          score: Math.max(-100, rel.score - 15),
          last_interaction_tick: tick,
        });
      }

      result.defaulted.push({ loan_id: loan.id, player_id: loan.player_id, recovery_amount: recovery });
      console.log(`[loans] Default: ${loan.borrower_name} (${loan.town_id}), recovery: ${recovery.toFixed(0)}g`);
      continue;
    }

    // Check if term expired (full repayment)
    if (loan.ticks_elapsed >= loan.term_ticks) {
      const repayment = loan.outstanding_balance;
      const bs = state.balanceSheets.get(loan.player_id);
      if (bs) bs.cash += repayment;

      loan.status = 'repaid';
      loan.repaid_at_tick = tick;

      // Update company total_debt
      if (company) {
        company.total_debt = Math.max(0, company.total_debt - loan.outstanding_balance);
      }

      // Improve relation: company successfully repaid
      if (company) {
        const rel = state.getRelation(loan.company_id, loan.player_id);
        state.setRelation({
          ...rel,
          score: Math.min(100, rel.score + 5),
          last_interaction_tick: tick,
        });
      }

      result.repaid.push({ loan_id: loan.id, player_id: loan.player_id });
    }
  }

  return result;
}
