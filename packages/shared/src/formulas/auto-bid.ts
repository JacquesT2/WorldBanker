import type { BalanceSheet } from '../types/banking.js';
import type { AutoBidRule } from '../types/auto-bid.js';

export interface LoanLike {
  requested_amount: number;
  base_default_probability: number;
  collateral_value: number;
  partial_recovery_rate: number;
  max_acceptable_rate: number;
  company_type: string;
}

export function loanLgd(p: LoanLike): number {
  const recovery = (p.collateral_value * p.partial_recovery_rate) / p.requested_amount;
  return Math.max(0, 1 - recovery);
}

export function loanNetYieldPct(p: LoanLike, offeredRate: number): number {
  const annualDefaultProb = p.base_default_probability * 360;
  return (offeredRate - annualDefaultProb * loanLgd(p)) * 100;
}

export function passesAutoBidRule(
  p: LoanLike,
  rule: AutoBidRule,
  bs: BalanceSheet,
  deployedSoFar: number,
): boolean {
  const annualRiskPct = p.base_default_probability * 360 * 100;
  const offeredRate   = Math.max(0.02, p.max_acceptable_rate - rule.rate_discount);

  if (annualRiskPct > rule.max_risk_pct_per_year) return false;
  if (loanNetYieldPct(p, offeredRate) < rule.min_net_yield_pct) return false;
  if (rule.max_loan_amount > 0 && p.requested_amount > rule.max_loan_amount) return false;
  if (rule.allowed_types.length > 0 && !rule.allowed_types.includes(p.company_type)) return false;
  if (rule.max_total_capital > 0 && deployedSoFar + p.requested_amount > rule.max_total_capital) return false;

  const cashAfter    = bs.cash - deployedSoFar - p.requested_amount;
  const reserveAfter = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
  if (reserveAfter < rule.min_reserve_after) return false;

  return true;
}
