import type { WorldState } from '../state/world-state';
import { TICKS_PER_YEAR } from '@argentum/shared';

/**
 * Step 7: Process infrastructure investments.
 * - Complete investments that have reached their completion_tick
 * - Upgrade town infrastructure level
 * - Pay ongoing returns from completed investments
 */
export function processInfrastructure(state: WorldState): void {
  const tick = state.clock.current_tick;

  for (const investment of state.investments.values()) {
    if (investment.completed) continue;

    // Check if investment is complete
    if (tick >= investment.completion_tick) {
      investment.completed = true;

      const town = state.towns.get(investment.town_id);
      if (town) {
        // Upgrade the town infrastructure level (capped at 5)
        const currentLevel = town.infrastructure[investment.infra_type];
        if (currentLevel < 5) {
          town.infrastructure[investment.infra_type] = (currentLevel + 1) as 0|1|2|3|4|5;
          console.log(`[infra] ${town.name} ${investment.infra_type} upgraded to level ${currentLevel + 1}`);
        }
      }

      // Apply reputation bonus
      const player = state.players.get(investment.player_id);
      if (player) {
        player.reputation = Math.min(100, player.reputation + investment.reputation_bonus);
      }
    }
  }

  // Pay returns from all completed investments each tick
  for (const investment of state.investments.values()) {
    if (!investment.completed) continue;

    const bs = state.balanceSheets.get(investment.player_id);
    if (!bs) continue;

    const returnPerTick = investment.amount_invested * (investment.annual_return_rate / TICKS_PER_YEAR);
    bs.cash += returnPerTick;
  }
}
