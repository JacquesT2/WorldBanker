import type { WorldEvent, RegionType } from '../types/world.js';
import type { Season } from '../types/tick.js';

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
 *
 * @param companyRevenues - Sum of annual_revenue across all companies in the town.
 *                          This is the base — companies ARE the economy.
 */
export function calcEconomicOutput(
  companyRevenues: number,
  regionType: RegionType,
  season: Season,
  activeEvents: Pick<WorldEvent, 'economic_output_modifier'>[],
  cycleMultiplier = 1.0,
): number {
  const seasonal = calcSeasonMultiplier(regionType, season);
  const events   = calcEventMultiplier(activeEvents);
  return companyRevenues * seasonal * events * cycleMultiplier;
}
