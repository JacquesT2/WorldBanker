export type LoanStatus = 'active' | 'repaid' | 'defaulted' | 'written_off';

export type BorrowerType =
  | 'merchant'
  | 'guild'
  | 'noble'
  | 'farmer'
  | 'craftsman'
  | 'shipwright'
  | 'miner';

export interface Loan {
  id: string;
  player_id: string;
  town_id: string;
  borrower_name: string;
  borrower_type: BorrowerType;
  principal: number;
  outstanding_balance: number;
  interest_rate: number;                  // Annual rate, e.g. 0.12 = 12%
  term_ticks: number;
  ticks_elapsed: number;
  status: LoanStatus;
  default_probability_per_tick: number;   // Computed and cached each tick
  collateral_value: number;
  partial_recovery_rate: number;          // 0.0–0.8 fraction recovered on default
  created_at_tick: number;
  defaulted_at_tick?: number;
  repaid_at_tick?: number;
}

export interface LoanProposal {
  id: string;
  world_id: string;
  town_id: string;
  borrower_type: BorrowerType;
  borrower_name: string;
  requested_amount: number;
  max_acceptable_rate: number;            // Borrower's ceiling rate
  term_ticks: number;
  base_default_probability: number;       // Per-tick base before adjustments
  collateral_value: number;
  partial_recovery_rate: number;
  expires_at_tick: number;
  created_at_tick: number;
  accepted_by_player_id?: string;
  accepted_at_tick?: number;
}

export interface Deposit {
  id: string;
  player_id: string;
  town_id: string;
  balance: number;                        // Total citizen deposits held
  interest_rate_offered: number;          // Annual rate offered by player
  last_inflow_tick: number;
  last_interest_accrual_tick: number;
}

export type SectorInvestmentType = 'military' | 'heavy_industry' | 'construction' | 'commerce' | 'maritime' | 'agriculture';

export interface SectorInvestment {
  id: string;
  player_id: string;
  town_id: string;
  sector_type: SectorInvestmentType;
  amount_invested: number;
  completion_tick: number;
  completed: boolean;
  annual_return_rate: number;
  reputation_bonus: number;
}

/** @deprecated use SectorInvestment */
export type InfrastructureInvestment = SectorInvestment;

export interface BalanceSheet {
  player_id: string;
  cash: number;
  total_loan_book: number;                // Sum of outstanding_balance (active loans)
  total_investments: number;              // Sum of infrastructure investments
  total_deposits_owed: number;            // Total citizen deposits (liability)
  total_interest_accrued: number;         // Interest owed to depositors, not yet paid
  equity: number;                         // assets - liabilities
  reserve_ratio: number;                  // cash / total_deposits_owed
  last_updated_tick: number;
}
