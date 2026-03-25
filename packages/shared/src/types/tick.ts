import type { Town, Region, WorldEvent } from './world.js';
import type { BalanceSheet, LoanProposal } from './banking.js';
import type { PlayerScore } from './player.js';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface WorldClock {
  world_id: string;
  current_tick: number;
  current_day: number;        // 1–90 within the season
  current_season: Season;
  current_year: number;
}

export interface TownEconomyUpdate {
  town_id: string;
  population: number;
  economic_output: number;
  population_delta: number;
  economic_output_delta: number;
  new_event_ids: string[];
}

export interface PlayerDeltaUpdate {
  balance_sheet: BalanceSheet;
  new_loan_default_ids: string[];
  new_loan_repayment_ids: string[];
  reputation_delta: number;
}

export interface LoanProposalUpdate {
  new_proposals: LoanProposal[];
  expired_proposal_ids: string[];
}

export interface TickDelta {
  tick: number;
  clock: WorldClock;
  town_updates: TownEconomyUpdate[];
  new_events: WorldEvent[];
  resolved_event_ids: string[];
  player_updates: Record<string, PlayerDeltaUpdate>;  // keyed by player_id
  loan_proposal_updates: LoanProposalUpdate;
  leaderboard: PlayerScore[];
}

export interface WorldSnapshot {
  clock: WorldClock;
  towns: Town[];
  regions: Region[];
  events: WorldEvent[];
  loan_proposals: LoanProposal[];
  leaderboard: PlayerScore[];
}
