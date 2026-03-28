// Re-export shared types and formulas for use in the loans UI
export type { AutoBidRule, LoanLike } from '@argentum/shared';
export {
  DEFAULT_AUTO_BID_RULE as DEFAULT_RULE,
  loanLgd as lgd,
  loanNetYieldPct as netYieldPct,
  passesAutoBidRule as passesRule,
} from '@argentum/shared';

// AutoRule is now an alias for AutoBidRule (snake_case fields)
export type { AutoBidRule as AutoRule } from '@argentum/shared';
