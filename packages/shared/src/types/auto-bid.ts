export interface AutoBidRule {
  player_id: string;
  enabled: boolean;
  max_risk_pct_per_year: number;   // e.g. 20 (%)
  min_net_yield_pct: number;       // e.g. 5 (%)
  max_loan_amount: number;         // 0 = no limit
  max_total_capital: number;       // 0 = no limit
  min_reserve_after: number;       // e.g. 0.15
  allowed_types: string[];         // [] = all types
  rate_discount: number;           // e.g. 0.01
}

export const DEFAULT_AUTO_BID_RULE: Omit<AutoBidRule, 'player_id'> = {
  enabled: false,
  max_risk_pct_per_year: 20,
  min_net_yield_pct: 5,
  max_loan_amount: 0,
  max_total_capital: 0,
  min_reserve_after: 0.15,
  allowed_types: [],
  rate_discount: 0,
};
