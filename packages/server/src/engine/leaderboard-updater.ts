import type { WorldState } from '../state/world-state';
import type { PlayerScore } from '@argentum/shared';
import { calcCompositeScore } from '@argentum/shared';

/**
 * Step 10: Recalculate and sort the leaderboard.
 */
export function updateLeaderboard(state: WorldState): PlayerScore[] {
  const tick = state.clock.current_tick;

  const activePlayers = state.getActivePlayers();
  if (activePlayers.length === 0) return [];

  // Gather all equities for normalization
  const allEquities = activePlayers.map(p => {
    const bs = state.balanceSheets.get(p.id);
    return bs?.equity ?? 0;
  });

  const scores: PlayerScore[] = [];

  for (const player of activePlayers) {
    const bs = state.balanceSheets.get(player.id);
    if (!bs) continue;

    const activeLoans = state.getActiveLoansForPlayer(player.id);
    // Include defaulted loans in portfolio quality calculation
    const allPlayerLoanIds = state.playerLoans.get(player.id) ?? [];
    const allLoans = allPlayerLoanIds
      .map(id => state.loans.get(id))
      .filter((l): l is NonNullable<typeof l> => l !== undefined);

    const { total_score, net_worth_score, portfolio_quality_score, reserve_health_score } =
      calcCompositeScore(bs.equity, allEquities, activeLoans, allLoans, bs);

    const score: PlayerScore = {
      player_id: player.id,
      username: player.username,
      bank_name: player.bank_name,
      total_score,
      net_worth_score,
      portfolio_quality_score,
      reserve_health_score,
      rank: 0, // assigned below
      last_updated_tick: tick,
    };

    scores.push(score);
    state.scores.set(player.id, score);
  }

  // Sort by total_score descending, assign ranks
  scores.sort((a, b) => b.total_score - a.total_score);
  scores.forEach((s, i) => {
    s.rank = i + 1;
    const stateScore = state.scores.get(s.player_id);
    if (stateScore) stateScore.rank = i + 1;
  });

  return scores;
}
