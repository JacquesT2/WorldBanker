import type { Loan } from '../types/banking.js';
import type { WorldEvent } from '../types/world.js';
import {
  BASE_DEFAULT_RATES,
  INTEREST_STRESS_THRESHOLD,
  INTEREST_STRESS_MULTIPLIER,
} from '../constants/economics.js';

/**
 * Aging factor: loans become progressively riskier as they approach their term end.
 * A borrower who hasn't repaid 90% through the loan is under increasing stress.
 */
export function calcAgingFactor(ticksElapsed: number, termTicks: number): number {
  if (termTicks <= 0) return 1.0;
  const progress = ticksElapsed / termTicks;
  return 1.0 + progress * 0.5;  // 1.0 at start → 1.5 at end
}

/**
 * Interest stress factor: charging above the threshold rate increases default risk.
 * This punishes predatory lending.
 */
export function calcInterestStressFactor(interestRate: number): number {
  return 1.0 + Math.max(0, interestRate - INTEREST_STRESS_THRESHOLD) * INTEREST_STRESS_MULTIPLIER;
}

/**
 * Town risk factor from region's base risk modifier.
 * Geographic risk multiplied into default probability.
 */
export function calcTownRiskFactor(regionBaseRiskModifier: number): number {
  return regionBaseRiskModifier;
}

/**
 * Event modifier: product of all active events' loan_default_modifier for the town.
 */
export function calcEventDefaultModifier(activeEvents: Pick<WorldEvent, 'loan_default_modifier'>[]): number {
  return activeEvents.reduce((acc, e) => acc * e.loan_default_modifier, 1.0);
}

/**
 * Adjusted default probability per tick for a loan.
 * All factors multiplied together.
 */
export function calcDefaultProbabilityPerTick(
  loan: Pick<Loan, 'borrower_type' | 'ticks_elapsed' | 'term_ticks' | 'interest_rate'>,
  regionBaseRiskModifier: number,
  activeEvents: Pick<WorldEvent, 'loan_default_modifier'>[],
): number {
  const baseRate = BASE_DEFAULT_RATES[loan.borrower_type] ?? 0.001;
  const aging    = calcAgingFactor(loan.ticks_elapsed, loan.term_ticks);
  const stress   = calcInterestStressFactor(loan.interest_rate);
  const townRisk = calcTownRiskFactor(regionBaseRiskModifier);
  const events   = calcEventDefaultModifier(activeEvents);
  return baseRate * aging * stress * townRisk * events;
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
 * Returns true if Math.random() < defaultProbability.
 * Kept as a pure function for testing by accepting a random number.
 */
export function rollLoanDefault(defaultProbabilityPerTick: number, random = Math.random()): boolean {
  return random < defaultProbabilityPerTick;
}
