import type { WorldState } from '../state/world-state';
import type { TickDelta, PlayerDeltaUpdate, TownEconomyUpdate, LoanProposalUpdate, PlayerScore, WorldEvent } from '@argentum/shared';

interface DeltaBroadcasterDeps {
  newEvents: WorldEvent[];
  resolvedEventIds: string[];
  defaultedLoans: Array<{ loan_id: string; player_id: string; recovery_amount: number }>;
  repaidLoans: Array<{ loan_id: string; player_id: string }>;
  bankruptcyPlayerIds: string[];
  newProposals: import('@argentum/shared').LoanProposal[];
  expiredProposalIds: string[];
  leaderboard: PlayerScore[];
}

/**
 * Step 11: Build TickDelta from current state vs previous state.
 * Only includes towns/players that had meaningful changes.
 */
export function buildTickDelta(
  state: WorldState,
  deps: DeltaBroadcasterDeps,
): TickDelta {
  const tick = state.clock.current_tick;

  // Town updates — only include towns with meaningful changes
  const townUpdates: TownEconomyUpdate[] = [];
  for (const [townId, town] of state.towns) {
    const prevOutput = state.prevTownOutputs.get(townId) ?? town.economic_output;
    const outputDelta = town.economic_output - prevOutput;

    // Include if output or population changed by more than 0.1%
    const outputChangePct = prevOutput > 0
      ? Math.abs(outputDelta / prevOutput)
      : Math.abs(outputDelta);

    const townEventIds = deps.newEvents
      .filter(e => e.town_id === townId)
      .map(e => e.id);

    if (outputChangePct > 0.001 || townEventIds.length > 0) {
      townUpdates.push({
        town_id: townId,
        population: town.population,
        economic_output: town.economic_output,
        population_delta: 0, // simplified — could track properly
        economic_output_delta: outputDelta,
        new_event_ids: townEventIds,
      });
    }
  }

  // Player updates
  const playerUpdates: Record<string, PlayerDeltaUpdate> = {};
  for (const player of state.players.values()) {
    const bs = state.balanceSheets.get(player.id);
    if (!bs) continue;

    const playerDefaulted = deps.defaultedLoans
      .filter(d => d.player_id === player.id)
      .map(d => d.loan_id);
    const playerRepaid = deps.repaidLoans
      .filter(r => r.player_id === player.id)
      .map(r => r.loan_id);

    const depositBalances: Record<string, number> = {};
    for (const d of state.getDepositsForPlayer(player.id)) {
      depositBalances[d.town_id] = d.balance;
    }

    playerUpdates[player.id] = {
      balance_sheet: { ...bs },
      new_loan_default_ids: playerDefaulted,
      new_loan_repayment_ids: playerRepaid,
      reputation_delta: playerDefaulted.length > 0 ? -2 * playerDefaulted.length : 0,
      deposit_balances: depositBalances,
    };
  }

  const loanProposalUpdates: LoanProposalUpdate = {
    new_proposals: deps.newProposals,
    expired_proposal_ids: deps.expiredProposalIds,
  };

  return {
    tick,
    clock: { ...state.clock },
    town_updates: townUpdates,
    new_events: deps.newEvents,
    resolved_event_ids: deps.resolvedEventIds,
    player_updates: playerUpdates,
    loan_proposal_updates: loanProposalUpdates,
    leaderboard: deps.leaderboard,
  };
}
