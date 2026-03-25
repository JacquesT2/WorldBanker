export interface Player {
  id: string;
  world_id: string;
  username: string;
  bank_name: string;
  reputation: number;           // 0–100
  starting_town_id: string;
  is_bankrupt: boolean;
  bankruptcy_tick?: number;
  created_at: string;
}

export interface BankingLicense {
  id: string;
  player_id: string;
  town_id: string;
  acquired_at_tick: number;
  cost_paid: number;
  is_starting_license: boolean;
}

export interface PlayerScore {
  player_id: string;
  username: string;
  bank_name: string;
  total_score: number;
  net_worth_score: number;          // 40% weight
  portfolio_quality_score: number;  // 30% weight
  reserve_health_score: number;     // 30% weight
  rank: number;
  last_updated_tick: number;
}
