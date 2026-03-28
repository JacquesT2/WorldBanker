import type { WorldEvent } from '../types/world.js';
import {
  INTEREST_STRESS_THRESHOLD,
  INTEREST_STRESS_MULTIPLIER,
} from '../constants/economics.js';

/**
 * Aging factor: loans become progressively riskier as they approach their term end.
 */
export function calcAgingFactor(ticksElapsed: number, termTicks: number): number {
  if (termTicks <= 0) return 1.0;
  const progress = ticksElapsed / termTicks;
  return 1.0 + progress * 0.5;  // 1.0 at start → 1.5 at end
}

/**
 * Interest stress factor: charging above the threshold rate increases default risk.
 */
export function calcInterestStressFactor(interestRate: number): number {
  return 1.0 + Math.max(0, interestRate - INTEREST_STRESS_THRESHOLD) * INTEREST_STRESS_MULTIPLIER;
}

/**
 * Event modifier: product of all active events' loan_default_modifier for the town.
 */
export function calcEventDefaultModifier(activeEvents: Pick<WorldEvent, 'loan_default_modifier'>[]): number {
  return activeEvents.reduce((acc, e) => acc * e.loan_default_modifier, 1.0);
}

/**
 * Recovery amount on default. Depends on collateral and partial_recovery_rate.
 */
export function calcRecoveryAmount(
  outstandingBalance: number,
  collateralValue: number,
  partialRecoveryRate: number,
): number {
  const collateralCover = Math.min(collateralValue, outstandingBalance);
  const uncollateralizedBalance = outstandingBalance - collateralCover;
  return collateralCover + uncollateralizedBalance * partialRecoveryRate;
}

/**
 * Simulate whether a loan defaults this tick.
 */
export function rollLoanDefault(defaultProbabilityPerTick: number, random = Math.random()): boolean {
  return random < defaultProbabilityPerTick;
}
