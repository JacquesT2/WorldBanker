import type { CompanyType } from './company.js';

export type LoanStatus = 'active' | 'repaid' | 'defaulted' | 'written_off';

export interface Loan {
  id: string;
  player_id: string;
  town_id: string;
  company_id: string;
  /** Display name — populated from Company.name at loan creation */
  borrower_name: string;
  company_type: CompanyType;
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
  company_id: string;
  /** Display name from Company.name */
  borrower_name: string;
  company_type: CompanyType;
  requested_amount: number;
  max_acceptable_rate: number;            // Company's ceiling rate
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

export interface AuctionBid {
  player_id: string;
  bank_name: string;
  offered_rate: number;
  bid_tick: number;
}

export type AuctionStatus = 'open' | 'awarded' | 'no_bids';

export interface LoanAuction {
  id: string;
  world_id: string;
  town_id: string;
  company_id: string;
  borrower_name: string;
  company_type: CompanyType;
  requested_amount: number;
  max_acceptable_rate: number;    // Company's ceiling — bids above this are rejected
  term_ticks: number;
  base_default_probability: number;
  collateral_value: number;
  partial_recovery_rate: number;
  created_at_tick: number;
  closes_at_tick: number;         // Bidding window ends here
  bids: AuctionBid[];             // All bids placed (visible to all licensed players)
  status: AuctionStatus;
  winning_bid?: AuctionBid;       // Set when auction closes with bids
}

export interface BalanceSheet {
  player_id: string;
  cash: number;
  total_loan_book: number;                // Sum of outstanding_balance (active loans)
  total_deposits_owed: number;            // Total citizen deposits (liability)
  total_interest_accrued: number;         // Interest owed to depositors, not yet paid
  equity: number;                         // assets - liabilities
  reserve_ratio: number;                  // cash / total_deposits_owed
  last_updated_tick: number;
}
