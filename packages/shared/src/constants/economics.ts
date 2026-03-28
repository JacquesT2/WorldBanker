// Deposit flow
export const DEPOSIT_RATE_EXPONENT = 1.5;       // Citizens are rate-sensitive
export const DEPOSIT_REPUTATION_EXPONENT = 0.8; // Reputation matters, but less than rate
export const MIN_DEPOSIT_INTEREST_RATE = 0.00;  // Player can offer 0% (but won't attract much)
export const MAX_DEPOSIT_INTEREST_RATE = 0.15;  // 15% annual ceiling

// Lending
export const MIN_LENDING_RATE = 0.02;           // 2% minimum (below this, not worth it)
export const MAX_LENDING_RATE = 0.30;           // 30% annual ceiling (above is usurious)
export const INTEREST_STRESS_THRESHOLD = 0.10;  // Rates above 10% start stressing borrowers
export const INTEREST_STRESS_MULTIPLIER = 3.0;  // How fast default risk rises above threshold

// Population dynamics
export const NATURAL_GROWTH_RATE_PER_TICK = 0.00005;  // ~1.8% annually
export const MAX_MIGRATION_RATE_PER_TICK   = 0.005;   // cap at 0.5% per tick
export const MIGRATION_THRESHOLD_GDP       = 5000;    // output delta to trigger migration

// Economic cycle
export const BOOM_OUTPUT_MULTIPLIER        = 1.15;
export const CONTRACTION_OUTPUT_MULTIPLIER = 0.85;
export const BOOM_CYCLE_MIN_TICKS          = 30;
export const BOOM_CYCLE_MAX_TICKS          = 90;

// Event probabilities per tick (before geographic modifiers)
export const BASE_EVENT_PROBABILITY_PER_TICK = 0.002; // ~0.2% chance per town per tick
export const EVENT_REGIONAL_COOLDOWN_TICKS   = 180;   // Min ticks between same event type in region
