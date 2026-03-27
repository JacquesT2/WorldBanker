import type { WorldState } from '../state/world-state';
import { TICKS_PER_YEAR } from '@argentum/shared';
import type { SectorType } from '@argentum/shared';

/**
 * Step 7: Process sector investments.
 * - Complete investments that have reached their completion_tick
 * - Upgrade town sector level
 * - Pay ongoing returns from completed investments
 */
export function processInfrastructure(state: WorldState): void {
  const tick = state.clock.current_tick;

  for (const investment of state.investments.values()) {
    if (investment.completed) continue;

    if (tick >= investment.completion_tick) {
      investment.completed = true;

      const town = state.towns.get(investment.town_id);
      if (town) {
        const sectorType = investment.sector_type as SectorType;
        const currentLevel = town.sectors[sectorType];
        if (currentLevel < 5) {
          town.sectors[sectorType] = (currentLevel + 1) as 0|1|2|3|4|5;
          console.log(`[sectors] ${town.name} ${sectorType} upgraded to level ${currentLevel + 1}`);
        }
      }

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
