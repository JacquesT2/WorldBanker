import type { Town, WorldEvent, RegionType } from '../types/world.js';
import type { Season } from '../types/tick.js';
import {
  INFRA_ROADS_PER_LEVEL,
  INFRA_PORT_PER_LEVEL,
  INFRA_GRANARY_PER_LEVEL,
  INFRA_MARKET_PER_LEVEL,
  INFRA_WALLS_PER_LEVEL,
} from '../constants/economics.js';

/**
 * Infrastructure bonus multiplier (1.0 = no bonus, max ~1.75 at all-5 infra)
 */
export function calcInfraMultiplier(town: Pick<Town, 'infrastructure'>): number {
  const { roads, port, granary, market, walls } = town.infrastructure;
  return (
    1.0 +
    roads   * INFRA_ROADS_PER_LEVEL +
    port    * INFRA_PORT_PER_LEVEL +
    granary * INFRA_GRANARY_PER_LEVEL +
    market  * INFRA_MARKET_PER_LEVEL +
    walls   * INFRA_WALLS_PER_LEVEL
  );
}

/**
 * Season modifier for economic output.
 * Varies by region type to reflect real economic rhythms.
 */
export function calcSeasonMultiplier(regionType: RegionType, season: Season): number {
  const seasonal: Record<RegionType, Record<Season, number>> = {
    'river-delta':          { spring: 0.95, summer: 1.10, autumn: 1.20, winter: 0.80 },
    'forest-timber':        { spring: 1.00, summer: 1.10, autumn: 1.05, winter: 0.85 },
    'steppe-pastoral':      { spring: 1.10, summer: 1.05, autumn: 1.15, winter: 0.70 },
    'highland-plateau':     { spring: 0.90, summer: 1.05, autumn: 1.10, winter: 0.75 },
    'mountain-mining':      { spring: 1.00, summer: 1.05, autumn: 1.00, winter: 0.90 },
    'volcanic':             { spring: 0.95, summer: 1.00, autumn: 0.95, winter: 0.90 },
    'coastal-trade-hub':    { spring: 1.05, summer: 1.10, autumn: 1.05, winter: 0.90 },
    'crossroads':           { spring: 1.05, summer: 1.10, autumn: 1.05, winter: 0.90 },
    'island-archipelago':   { spring: 1.00, summer: 1.15, autumn: 1.00, winter: 0.80 },
    'marshland':            { spring: 0.90, summer: 1.00, autumn: 1.05, winter: 0.85 },
  };
  return seasonal[regionType][season];
}

/**
 * Compound modifier from all active events affecting a town.
 */
export function calcEventMultiplier(activeEvents: Pick<WorldEvent, 'economic_output_modifier'>[]): number {
  return activeEvents.reduce((acc, e) => acc * e.economic_output_modifier, 1.0);
}

/**
 * Total economic output for a town this tick.
 * This is the base value from which deposit flow, loan demand, and scoring derive.
 */
export function calcEconomicOutput(
  town: Pick<Town, 'population' | 'wealth_per_capita' | 'infrastructure'>,
  regionType: RegionType,
  season: Season,
  activeEvents: Pick<WorldEvent, 'economic_output_modifier'>[],
  cycleMultiplier = 1.0,
): number {
  const base = town.population * town.wealth_per_capita;
  const infra = calcInfraMultiplier(town);
  const seasonal = calcSeasonMultiplier(regionType, season);
  const events = calcEventMultiplier(activeEvents);
  return base * infra * seasonal * events * cycleMultiplier;
}
