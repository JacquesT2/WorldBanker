import type { WorldState } from '../state/world-state';
import {
  calcEconomicOutput,
  BOOM_CYCLE_MIN_TICKS,
  BOOM_CYCLE_MAX_TICKS,
  BOOM_OUTPUT_MULTIPLIER,
  CONTRACTION_OUTPUT_MULTIPLIER,
} from '@argentum/shared';

/**
 * Step 3: Update economic output for all towns.
 * Output is now the sum of company revenues in each town, modulated by
 * seasonal, event, and macro-cycle factors.
 * Also manages the macro economic cycle (boom/normal/contraction).
 */
export function updateEconomy(state: WorldState): void {
  const tick = state.clock.current_tick;
  const cycle = state.cycle;

  // Advance economic cycle if phase has expired
  if (tick - cycle.phase_tick_start >= cycle.phase_duration) {
    const phases: Array<'boom' | 'normal' | 'contraction'> = ['boom', 'normal', 'contraction', 'normal'];
    const currentIdx = phases.indexOf(cycle.phase);
    const nextPhase = phases[(currentIdx + 1) % phases.length]!;

    cycle.phase = nextPhase;
    cycle.phase_tick_start = tick;
    cycle.phase_duration = BOOM_CYCLE_MIN_TICKS + Math.floor(
      Math.random() * (BOOM_CYCLE_MAX_TICKS - BOOM_CYCLE_MIN_TICKS)
    );
    cycle.multiplier = nextPhase === 'boom'
      ? BOOM_OUTPUT_MULTIPLIER
      : nextPhase === 'contraction'
        ? CONTRACTION_OUTPUT_MULTIPLIER
        : 1.0;

    console.log(`[economy] Cycle phase: ${nextPhase} (multiplier: ${cycle.multiplier}, duration: ${cycle.phase_duration} ticks)`);
  }

  // Recalculate each town's economic output from company revenues
  for (const town of state.towns.values()) {
    const region = state.getRegionForTown(town.id);
    if (!region) continue;

    const activeEvents = state.getActiveEventsForTown(town.id);
    const companyRevenues = state.getTownCompanyRevenue(town.id);

    const newOutput = calcEconomicOutput(
      companyRevenues,
      region.type,
      state.clock.current_season,
      activeEvents,
      cycle.multiplier,
    );

    state.prevTownOutputs.set(town.id, town.economic_output);
    town.economic_output = newOutput;
  }
}
