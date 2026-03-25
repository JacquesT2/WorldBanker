import { BASE_LICENSE_FEE, LICENSE_COMPETITION_PREMIUM } from '../constants/game.js';

/**
 * Cost to purchase a banking license in a given town.
 * Reflects town size, wealth, and existing competition.
 */
export function calcLicenseCost(
  population: number,
  wealthPerCapita: number,
  existingLicenseCount: number,
): number {
  return (
    BASE_LICENSE_FEE +
    population * 0.05 +
    wealthPerCapita * 2.0 +
    existingLicenseCount * LICENSE_COMPETITION_PREMIUM
  );
}
