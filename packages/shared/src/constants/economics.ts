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

// Default probability per tick (base rates by borrower type)
export const BASE_DEFAULT_RATES: Record<string, number> = {
  guild:      0.0005,
  merchant:   0.0008,
  craftsman:  0.0009,
  shipwright: 0.0007,
  noble:      0.0010,
  miner:      0.0012,
  farmer:     0.0015,
};

// Sector multipliers on economic output (per level, additive)
export const SECTOR_MILITARY_PER_LEVEL       = 0.01; // Mostly war power, small output boost
export const SECTOR_HEAVY_INDUSTRY_PER_LEVEL = 0.05; // Manufacturing capacity
export const SECTOR_CONSTRUCTION_PER_LEVEL   = 0.04; // Civic infrastructure
export const SECTOR_COMMERCE_PER_LEVEL       = 0.06; // Trade & markets — high impact
export const SECTOR_MARITIME_PER_LEVEL       = 0.07; // Ports & naval — highest for coastal
export const SECTOR_AGRICULTURE_PER_LEVEL    = 0.04; // Food security & growth

// Sector investment: ticks to complete
export const SECTOR_BUILD_TICKS: Record<string, number> = {
  military:       90,   // ~2.5 in-game seasons
  heavy_industry: 108,  // ~3 seasons  (heavy construction)
  construction:   72,   // ~2 seasons
  commerce:       36,   // ~1 season   (fastest — organise a market)
  maritime:       108,  // ~3 seasons  (ports are slow)
  agriculture:    54,   // ~1.5 seasons
};

// Sector: minimum investment to trigger a level-up [level 0→1, 1→2, …, 4→5]
export const SECTOR_LEVEL_COSTS: Record<string, number[]> = {
  military:       [1000, 2000, 4000,  8000, 16000],
  heavy_industry: [1500, 3000, 6000, 12000, 25000],
  construction:   [800,  1600, 3200,  6000, 12000],
  commerce:       [700,  1400, 2800,  5600, 11200],
  maritime:       [1500, 3000, 6000, 12000, 25000],
  agriculture:    [600,  1200, 2400,  4800,  9600],
};

// Sector annual return rates (for completed investments)
export const SECTOR_RETURN_RATES: Record<string, number> = {
  military:       0.03,
  heavy_industry: 0.06,
  construction:   0.04,
  commerce:       0.05,
  maritime:       0.07,
  agriculture:    0.04,
};

// Military sector: defense bonus per level against conflict events
export const MILITARY_DEFENSE_PER_LEVEL = 0.15; // 15% reduction in conflict loan_default_modifier per level

// Legacy aliases (deprecated)
export const INFRA_BUILD_TICKS  = SECTOR_BUILD_TICKS;
export const INFRA_LEVEL_COSTS  = SECTOR_LEVEL_COSTS;

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
