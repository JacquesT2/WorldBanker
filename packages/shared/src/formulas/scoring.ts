import type { BalanceSheet } from '../types/banking.js';
import type { Loan } from '../types/banking.js';
import {
  SCORE_WEIGHT_NET_WORTH,
  SCORE_WEIGHT_PORTFOLIO_QUALITY,
  SCORE_WEIGHT_RESERVE_HEALTH,
  MIN_RESERVE_RATIO,
} from '../constants/game.js';

const MAX_EXPECTED_LOAN_RETURN = 0.25; // 25% annual = excellent yield

/**
 * Normalize equity across all players to a 0–100 score.
 */
export function calcNetWorthScore(equity: number, allEquities: number[]): number {
  const min = Math.min(...allEquities, 0);
  const max = Math.max(...allEquities, 1);
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((equity - min) / (max - min)) * 100));
}

/**
 * Portfolio quality: rewards low default rate and good yield.
 * A concentrated portfolio that hasn't defaulted yet still loses points
 * because diversification is tracked separately.
 */
export function calcPortfolioQualityScore(
  activeLoans: Pick<Loan, 'outstanding_balance' | 'status' | 'interest_rate'>[],
  allLoans: Pick<Loan, 'outstanding_balance' | 'status' | 'interest_rate'>[],
): number {
  const totalBook = allLoans.reduce((acc, l) => acc + l.outstanding_balance, 0);
  if (totalBook === 0) return 50; // No loans = neutral score

  const performingValue = activeLoans
    .filter(l => l.status === 'active')
    .reduce((acc, l) => acc + l.outstanding_balance, 0);

  const performanceScore = (performingValue / totalBook) * 80;

  const avgRate = activeLoans.length > 0
    ? activeLoans.reduce((acc, l) => acc + l.interest_rate, 0) / activeLoans.length
    : 0;
  const yieldScore = Math.min(avgRate / MAX_EXPECTED_LOAN_RETURN, 1.0) * 20;

  return Math.max(0, Math.min(100, performanceScore + yieldScore));
}

/**
 * Reserve health: rewards maintaining healthy liquidity above minimum.
 * Perfect reserve = 50 pts, 2× reserve = 100 pts, below minimum = 0–50 pts.
 */
export function calcReserveHealthScore(balanceSheet: Pick<BalanceSheet, 'reserve_ratio'>): number {
  const ratio = balanceSheet.reserve_ratio;
  const clamped = Math.max(0, Math.min(ratio / MIN_RESERVE_RATIO, 2.0));
  return clamped * 50;
}

/**
 * Composite score combining all three components.
 */
export function calcCompositeScore(
  equity: number,
  allEquities: number[],
  activeLoans: Pick<Loan, 'outstanding_balance' | 'status' | 'interest_rate'>[],
  allLoans: Pick<Loan, 'outstanding_balance' | 'status' | 'interest_rate'>[],
  balanceSheet: Pick<BalanceSheet, 'reserve_ratio'>,
): {
  total_score: number;
  net_worth_score: number;
  portfolio_quality_score: number;
  reserve_health_score: number;
} {
  const net_worth_score = calcNetWorthScore(equity, allEquities);
  const portfolio_quality_score = calcPortfolioQualityScore(activeLoans, allLoans);
  const reserve_health_score = calcReserveHealthScore(balanceSheet);

  const total_score =
    net_worth_score        * SCORE_WEIGHT_NET_WORTH +
    portfolio_quality_score * SCORE_WEIGHT_PORTFOLIO_QUALITY +
    reserve_health_score   * SCORE_WEIGHT_RESERVE_HEALTH;

  return { total_score, net_worth_score, portfolio_quality_score, reserve_health_score };
}
