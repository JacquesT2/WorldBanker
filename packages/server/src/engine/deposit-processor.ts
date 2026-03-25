import type { WorldState } from '../state/world-state';
import {
  calcDepositDistribution,
  calcDepositInterestPerTick,
  calcWithdrawalPressure,
  MIN_RESERVE_RATIO,
} from '@argentum/shared';

/**
 * Step 6: Process deposits for all towns.
 * - Distribute new deposits to competing banks
 * - Accrue interest owed to depositors
 * - Apply withdrawal pressure when reserves are low
 * - Generate new loan proposals for licensed towns
 */
export function processDeposits(state: WorldState): void {
  const tick = state.clock.current_tick;

  // Process each town that has at least one licensed bank
  for (const [townId, playerIds] of state.townLicenses) {
    if (playerIds.length === 0) continue;

    const town = state.towns.get(townId);
    if (!town) continue;

    // Build bank presence list for competition formula
    const banks = playerIds
      .filter(pid => {
        const player = state.players.get(pid);
        return player && !player.is_bankrupt;
      })
      .map(pid => {
        const deposit = state.getDepositsForPlayer(pid)
          .find(d => d.town_id === townId);
        const player = state.players.get(pid)!;
        return {
          player_id: pid,
          offered_rate: deposit?.interest_rate_offered ?? 0,
          reputation: player.reputation,
        };
      });

    if (banks.length === 0) continue;

    // Distribute new deposits competitively
    const distribution = calcDepositDistribution(town.economic_output, banks);

    for (const { player_id, new_deposits } of distribution) {
      if (new_deposits <= 0) continue;

      // Find or note that deposit record should exist
      const existingDeposit = state.getDepositsForPlayer(player_id)
        .find(d => d.town_id === townId);

      if (existingDeposit) {
        existingDeposit.balance += new_deposits;
        existingDeposit.last_inflow_tick = tick;

        // Cash increases when citizens deposit — the bank receives this money
        // (deposit is a liability, but the cash received is an asset; equity unchanged)
        const bs = state.balanceSheets.get(player_id);
        if (bs) bs.cash += new_deposits;
      }
    }

    // Accrue interest and apply withdrawals for each bank in town
    for (const pid of playerIds) {
      const bs = state.balanceSheets.get(pid);
      const player = state.players.get(pid);
      if (!bs || !player) continue;

      const deposit = state.getDepositsForPlayer(pid).find(d => d.town_id === townId);
      if (!deposit || deposit.balance <= 0) continue;

      // Accrue interest owed
      const interestOwed = calcDepositInterestPerTick(
        deposit.balance,
        deposit.interest_rate_offered,
      );
      bs.total_interest_accrued += interestOwed;
      deposit.last_interest_accrual_tick = tick;

      // Pay interest out of cash (if possible)
      if (bs.cash >= interestOwed) {
        bs.cash -= interestOwed;
        bs.total_interest_accrued -= interestOwed;
      }

      // Withdrawal pressure when reserves are low
      const reserveRatio = bs.total_deposits_owed > 0
        ? bs.cash / bs.total_deposits_owed
        : 1.0;

      const withdrawalFraction = calcWithdrawalPressure(
        reserveRatio,
        MIN_RESERVE_RATIO,
        player.reputation,
      );

      if (withdrawalFraction > 0) {
        const withdrawn = deposit.balance * withdrawalFraction;
        deposit.balance = Math.max(0, deposit.balance - withdrawn);
        bs.cash = Math.max(0, bs.cash - withdrawn);
        if (withdrawn > 10) {
          console.log(`[deposits] Bank run in ${town.name}: player ${pid} lost ${withdrawn.toFixed(0)}g deposits`);
        }
      }
    }
  }

  // Generate new loan proposals for licensed towns (probabilistically)
  generateProposals(state);
}

function generateProposals(state: WorldState): void {
  const tick = state.clock.current_tick;
  const { MAX_PROPOSALS_PER_TOWN_PER_TICK } = require('@argentum/shared');
  const { generateProposalForTown } = require('./loan-processor');

  for (const [townId, playerIds] of state.townLicenses) {
    if (playerIds.length === 0) continue;

    const town = state.towns.get(townId);
    if (!town) continue;

    // Count active proposals for this town
    const activeCount = Array.from(state.loanProposals.values()).filter(
      p => p.town_id === townId && !p.accepted_by_player_id && p.expires_at_tick > tick
    ).length;

    if (activeCount >= MAX_PROPOSALS_PER_TOWN_PER_TICK * 4) continue; // Max 8 queued per town

    // Probability of generating a proposal scales with town output
    const proposalChance = Math.min(0.15, town.economic_output / 1_000_000);
    if (Math.random() < proposalChance) {
      const proposal = generateProposalForTown(
        state.worldId, townId, town.economic_output, tick
      );
      if (proposal) {
        state.loanProposals.set(proposal.id, proposal);
      }
    }
  }

  // Expire old proposals
  for (const [id, proposal] of state.loanProposals) {
    if (!proposal.accepted_by_player_id && proposal.expires_at_tick <= tick) {
      state.loanProposals.delete(id);
    }
  }
}
