import type { Town, WorldEvent, RegionType } from '../types/world.js';
import type { Season } from '../types/tick.js';
import {
  SECTOR_MILITARY_PER_LEVEL,
  SECTOR_HEAVY_INDUSTRY_PER_LEVEL,
  SECTOR_CONSTRUCTION_PER_LEVEL,
  SECTOR_COMMERCE_PER_LEVEL,
  SECTOR_MARITIME_PER_LEVEL,
  SECTOR_AGRICULTURE_PER_LEVEL,
} from '../constants/economics.js';

/**
 * Sector development bonus multiplier (1.0 = no bonus).
 * Max at all-5 sectors ≈ 2.35x
 */
export function calcSectorMultiplier(town: Pick<Town, 'sectors'>): number {
  const { military, heavy_industry, construction, commerce, maritime, agriculture } = town.sectors;
  return (
    1.0 +
    military       * SECTOR_MILITARY_PER_LEVEL +
    heavy_industry * SECTOR_HEAVY_INDUSTRY_PER_LEVEL +
    construction   * SECTOR_CONSTRUCTION_PER_LEVEL +
    commerce       * SECTOR_COMMERCE_PER_LEVEL +
    maritime       * SECTOR_MARITIME_PER_LEVEL +
    agriculture    * SECTOR_AGRICULTURE_PER_LEVEL
  );
}

/** @deprecated use calcSectorMultiplier */
export const calcInfraMultiplier = calcSectorMultiplier;

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
 */
export function calcEconomicOutput(
  town: Pick<Town, 'population' | 'wealth_per_capita' | 'sectors'>,
  regionType: RegionType,
  season: Season,
  activeEvents: Pick<WorldEvent, 'economic_output_modifier'>[],
  cycleMultiplier = 1.0,
): number {
  const base     = town.population * town.wealth_per_capita;
  const sectors  = calcSectorMultiplier(town);
  const seasonal = calcSeasonMultiplier(regionType, season);
  const events   = calcEventMultiplier(activeEvents);
  return base * sectors * seasonal * events * cycleMultiplier;
}
