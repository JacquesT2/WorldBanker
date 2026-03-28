import type { WorldState } from '../state/world-state';
import {
  calcDepositDistribution,
  calcDepositInterestPerTick,
  calcWithdrawalPressure,
  MIN_RESERVE_RATIO,
  MAX_AUCTIONS_PER_TOWN,
  AUCTION_DURATION_TICKS,
} from '@argentum/shared';

/**
 * Step 6: Process deposits for all towns.
 * - Distribute new deposits to competing banks
 * - Accrue interest owed to depositors
 * - Apply withdrawal pressure when reserves are low
 * - Promote new loan proposals into auctions (when multiple banks compete)
 */
export function processDeposits(state: WorldState): void {
  const tick = state.clock.current_tick;

  for (const [townId, playerIds] of state.townLicenses) {
    if (playerIds.length === 0) continue;

    const town = state.towns.get(townId);
    if (!town) continue;

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

      const existingDeposit = state.getDepositsForPlayer(player_id)
        .find(d => d.town_id === townId);

      if (existingDeposit) {
        existingDeposit.balance += new_deposits;
        existingDeposit.last_inflow_tick = tick;

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

      const interestOwed = calcDepositInterestPerTick(
        deposit.balance,
        deposit.interest_rate_offered,
      );
      bs.total_interest_accrued += interestOwed;
      deposit.last_interest_accrual_tick = tick;

      if (bs.cash >= interestOwed) {
        bs.cash -= interestOwed;
        bs.total_interest_accrued -= interestOwed;
      }

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

  // Promote company loan proposals into auctions when multiple banks are present
  promoteProposalsToAuctions(state);
}

/**
 * Convert eligible loan proposals into auctions.
 * If a town has multiple licensed banks, proposals become competitive auctions.
 * If only one bank, the proposal stays as a direct proposal.
 */
function promoteProposalsToAuctions(state: WorldState): void {
  const tick = state.clock.current_tick;

  for (const proposal of state.loanProposals.values()) {
    if (proposal.accepted_by_player_id) continue;

    const licensedPlayers = state.getLicensedPlayers(proposal.town_id);
    const activePlayers = licensedPlayers.filter(pid => {
      const p = state.players.get(pid);
      return p && !p.is_bankrupt;
    });

    // Only promote to auction if multiple banks compete
    if (activePlayers.length < 2) continue;

    // Don't exceed per-town auction cap
    const openCount = Array.from(state.auctions.values()).filter(
      a => a.town_id === proposal.town_id && a.status === 'open'
    ).length;
    if (openCount >= MAX_AUCTIONS_PER_TOWN) continue;

    // Convert proposal → auction and remove from proposals
    state.loanProposals.delete(proposal.id);
    state.auctions.set(proposal.id, {
      id: proposal.id,
      world_id: proposal.world_id,
      town_id: proposal.town_id,
      company_id: proposal.company_id,
      borrower_name: proposal.borrower_name,
      company_type: proposal.company_type,
      requested_amount: proposal.requested_amount,
      max_acceptable_rate: proposal.max_acceptable_rate,
      term_ticks: proposal.term_ticks,
      base_default_probability: proposal.base_default_probability,
      collateral_value: proposal.collateral_value,
      partial_recovery_rate: proposal.partial_recovery_rate,
      created_at_tick: tick,
      closes_at_tick: tick + AUCTION_DURATION_TICKS,
      bids: [],
      status: 'open',
    });
  }
}
