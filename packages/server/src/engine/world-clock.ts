import type { WorldState } from '../state/world-state';
import { TICKS_PER_SEASON } from '@argentum/shared';
import type { Season } from '@argentum/shared';

const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Step 1: Advance the world clock by one tick.
 * 90 ticks = 1 season, 4 seasons = 1 year.
 */
export function advanceWorldClock(state: WorldState): void {
  const clock = state.clock;
  clock.current_tick += 1;
  clock.current_day += 1;

  if (clock.current_day > TICKS_PER_SEASON) {
    clock.current_day = 1;
    const seasonIdx = SEASON_ORDER.indexOf(clock.current_season);
    const nextIdx = (seasonIdx + 1) % 4;
    clock.current_season = SEASON_ORDER[nextIdx]!;

    if (clock.current_season === 'spring') {
      clock.current_year += 1;
      console.log(`[clock] New year ${clock.current_year} begins`);
    }

    console.log(`[clock] Season changed to ${clock.current_season} (year ${clock.current_year})`);
  }
}
