import type { WorldState } from '../state/world-state';
import { calcPopulationDelta } from '@argentum/shared';

/**
 * Step 4: Update population for all towns.
 * Natural growth + migration based on economic output delta.
 */
export function updatePopulation(state: WorldState): void {
  for (const town of state.towns.values()) {
    if (town.population <= 0) continue;

    const prevOutput = state.prevTownOutputs.get(town.id) ?? town.economic_output;
    const outputDelta = town.economic_output - prevOutput;
    const activeEvents = state.getActiveEventsForTown(town.id);

    const delta = calcPopulationDelta(
      town.population,
      state.clock.current_season,
      activeEvents,
      outputDelta,
    );

    town.population = Math.max(100, town.population + delta);

    // Wealth per capita adjusts slowly toward economic health
    const targetWPC = town.economic_output / (town.population * 1.2);
    if (targetWPC > 0) {
      town.wealth_per_capita += (targetWPC - town.wealth_per_capita) * 0.01;
      town.wealth_per_capita = Math.max(5, town.wealth_per_capita);
    }
  }
}
