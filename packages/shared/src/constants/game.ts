export const TICK_INTERVAL_MS = 5000;          // 5 real seconds per tick
export const TICKS_PER_SEASON = 90;             // 90 ticks = 1 season
export const SEASONS_PER_YEAR = 4;
export const TICKS_PER_YEAR = TICKS_PER_SEASON * SEASONS_PER_YEAR; // 360

export const STARTING_CASH = 1500;             // Gold on new player registration
export const MIN_RESERVE_RATIO = 0.10;         // 10% of deposits must be held as cash

export const LOAN_PROPOSAL_EXPIRY_TICKS = 24;  // Proposals expire after 2 minutes real-time
export const MAX_PROPOSALS_PER_TOWN_PER_TICK = 2;

export const AUCTION_DURATION_TICKS = 6;       // 30 seconds for players to place bids
export const MAX_AUCTIONS_PER_TOWN = 6;        // Max queued open auctions per town

export const DEPOSIT_GENERATION_RATE = 0.001;  // New deposits = townOutput * this per tick

// Scoring weights
export const SCORE_WEIGHT_NET_WORTH = 0.40;
export const SCORE_WEIGHT_PORTFOLIO_QUALITY = 0.30;
export const SCORE_WEIGHT_RESERVE_HEALTH = 0.30;

// License
export const BASE_LICENSE_FEE = 500;
export const LICENSE_COMPETITION_PREMIUM = 200; // Per existing license in town

// Default recovery (fallback if not set per borrower)
export const DEFAULT_RECOVERY_RATE = 0.50;

// Reputation
export const REPUTATION_STARTING = 50;
export const REPUTATION_MAX = 100;
export const REPUTATION_MIN = 0;
export const REPUTATION_DECAY_PER_TICK = 0.001; // Slow natural decay toward neutral
