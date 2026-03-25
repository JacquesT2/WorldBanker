import type { WorldEvent } from '../types/world.js';
import { NATURAL_GROWTH_RATE_PER_TICK, MAX_MIGRATION_RATE_PER_TICK } from '../constants/economics.js';
import type { Season } from '../types/tick.js';

/**
 * Season modifier for population growth.
 * Winter reduces birth rate; summer/autumn mild positive effect.
 */
const SEASON_GROWTH_MODIFIER: Record<Season, number> = {
  spring: 1.0,
  summer: 1.1,
  autumn: 1.05,
  winter: 0.7,
};

/**
 * Natural population growth per tick (births - deaths from natural causes).
 */
export function calcNaturalGrowth(
  population: number,
  season: Season,
  activeEvents: Pick<WorldEvent, 'population_modifier'>[],
): number {
  const baseGrowth = population * NATURAL_GROWTH_RATE_PER_TICK;
  const seasonMod = SEASON_GROWTH_MODIFIER[season];
  const eventMod = activeEvents.reduce((acc, e) => acc * e.population_modifier, 1.0);
  return baseGrowth * seasonMod * eventMod;
}

/**
 * Migration delta: people move toward towns with improving economies and away from declining ones.
 * Returns net migrants (positive = inflow, negative = outflow).
 */
export function calcMigrationFlow(
  population: number,
  economicOutputDelta: number,
  migrationThreshold = 5000,
): number {
  if (Math.abs(economicOutputDelta) < migrationThreshold) return 0;
  const normalizedDelta = economicOutputDelta / migrationThreshold;
  const migrationRate = Math.max(
    -MAX_MIGRATION_RATE_PER_TICK,
    Math.min(MAX_MIGRATION_RATE_PER_TICK, normalizedDelta * 0.001),
  );
  return Math.round(population * migrationRate);
}

/**
 * Combined population delta for a tick.
 */
export function calcPopulationDelta(
  population: number,
  season: Season,
  activeEvents: Pick<WorldEvent, 'population_modifier'>[],
  economicOutputDelta: number,
): number {
  const natural = calcNaturalGrowth(population, season, activeEvents);
  const migration = calcMigrationFlow(population, economicOutputDelta);
  return Math.round(natural) + migration;
}
