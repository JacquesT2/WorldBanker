import type { WorldState } from '../state/world-state';
import {
  calcDefaultProbabilityPerTick,
  calcRecoveryAmount,
  rollLoanDefault,
  TICKS_PER_YEAR,
} from '@argentum/shared';

export interface LoanProcessorResult {
  defaulted: Array<{ loan_id: string; player_id: string; recovery_amount: number }>;
  repaid: Array<{ loan_id: string; player_id: string }>;
}

/**
 * Step 5: Process all active loans.
 * - Accrue interest (added to outstanding_balance)
 * - Roll for default
 * - Check if term has expired
 */
export function processLoans(state: WorldState): LoanProcessorResult {
  const result: LoanProcessorResult = { defaulted: [], repaid: [] };
  const tick = state.clock.current_tick;

  for (const loan of state.loans.values()) {
    if (loan.status !== 'active') continue;

    const town = state.towns.get(loan.town_id);
    if (!town) continue;

    const region = state.getRegionForTown(loan.town_id);
    if (!region) continue;

    const activeEvents = state.getActiveEventsForTown(loan.town_id);

    // Accrue interest
    const interestPerTick = loan.outstanding_balance * (loan.interest_rate / TICKS_PER_YEAR);
    loan.outstanding_balance += interestPerTick;

    // Update default probability
    loan.ticks_elapsed += 1;
    loan.default_probability_per_tick = calcDefaultProbabilityPerTick(
      loan,
      region.base_risk_modifier,
      activeEvents,
    );

    // Roll for default
    if (rollLoanDefault(loan.default_probability_per_tick)) {
      const recovery = calcRecoveryAmount(
        loan.outstanding_balance,
        loan.collateral_value,
        loan.partial_recovery_rate,
      );
      loan.status = 'defaulted';
      loan.defaulted_at_tick = tick;

      // Credit recovery to player cash
      const bs = state.balanceSheets.get(loan.player_id);
      if (bs) {
        bs.cash += recovery;
      }

      // Reduce player reputation
      const player = state.players.get(loan.player_id);
      if (player) {
        player.reputation = Math.max(0, player.reputation - 2);
      }

      result.defaulted.push({ loan_id: loan.id, player_id: loan.player_id, recovery_amount: recovery });
      console.log(`[loans] Default: ${loan.borrower_name} (${loan.town_id}), recovery: ${recovery.toFixed(0)}g`);
      continue;
    }

    // Check if term expired (full repayment)
    if (loan.ticks_elapsed >= loan.term_ticks) {
      const repayment = loan.outstanding_balance;
      const bs = state.balanceSheets.get(loan.player_id);
      if (bs) {
        bs.cash += repayment;
      }
      loan.status = 'repaid';
      loan.repaid_at_tick = tick;
      result.repaid.push({ loan_id: loan.id, player_id: loan.player_id });
    }
  }

  return result;
}

/**
 * Generate a new loan proposal for a licensed town.
 * Called by proposal-generator which runs each tick for each licensed town.
 */
export function generateProposalForTown(
  worldId: string,
  townId: string,
  townOutput: number,
  currentTick: number,
): import('@argentum/shared').LoanProposal | null {
  const { v4: uuidv4 } = require('uuid');
  const {
    BASE_DEFAULT_RATES, LOAN_PROPOSAL_EXPIRY_TICKS,
    MAX_PROPOSALS_PER_TOWN_PER_TICK
  } = require('@argentum/shared');

  const borrowerTypes = ['merchant', 'guild', 'farmer', 'craftsman', 'noble', 'miner', 'shipwright'] as const;
  const type = borrowerTypes[Math.floor(Math.random() * borrowerTypes.length)]!;

  const namesByType: Record<string, string[]> = {
    merchant: ['Aldric Trademan', 'Sera Coins', 'Jorin of the Roads', 'Marta Faraway'],
    guild:    ['The Weavers Guild', 'The Ironworkers Brotherhood', 'The Sailors Union', 'The Millers Guild'],
    farmer:   ['Old Bram', 'The Kestrel Farm', 'Willem the Tiller', 'Hedge Farm'],
    craftsman: ['Henrick the Tanner', 'The Potters Quarter', 'Guildrun Workshop', 'Mira Glassworks'],
    noble:    ['Lord Deveth', 'Lady Corsain', 'Baron Ulric', 'Lord Tremain'],
    miner:    ['The Deep Shaft Company', 'Borwick Mines', 'Redvein Operations'],
    shipwright: ['Carver Shipyards', 'The Dockside Guild', 'Orran Boatworks'],
  };

  const names = namesByType[type] ?? ['Unknown Borrower'];
  const borrower_name = names[Math.floor(Math.random() * names.length)]!;

  // Amount proportional to town output
  const scale = 0.05 + Math.random() * 0.15;
  const requested_amount = Math.round(townOutput * scale / 100) * 100; // round to nearest 100
  if (requested_amount < 100) return null;

  const base_default_probability = BASE_DEFAULT_RATES[type] ?? 0.001;
  const max_acceptable_rate = 0.08 + Math.random() * 0.15; // 8–23%
  const term_ticks = 90 + Math.floor(Math.random() * 270); // 90–360 ticks (1–4 seasons)
  const collateral_value = requested_amount * (0.2 + Math.random() * 0.5);
  const partial_recovery_rate = 0.3 + Math.random() * 0.4;

  return {
    id: uuidv4(),
    world_id: worldId,
    town_id: townId,
    borrower_type: type,
    borrower_name,
    requested_amount,
    max_acceptable_rate,
    term_ticks,
    base_default_probability,
    collateral_value,
    partial_recovery_rate,
    expires_at_tick: currentTick + LOAN_PROPOSAL_EXPIRY_TICKS,
    created_at_tick: currentTick,
  };
}
