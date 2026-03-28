export type RegionType =
  | 'coastal-trade-hub'
  | 'river-delta'
  | 'mountain-mining'
  | 'forest-timber'
  | 'steppe-pastoral'
  | 'volcanic'
  | 'island-archipelago'
  | 'crossroads'
  | 'marshland'
  | 'highland-plateau';

export type CultureType =
  | 'trade'     // coastal, crossroads — fast velocity, debt tolerant
  | 'agrarian'  // delta, forest — conservative, seasonal cash flow
  | 'frontier'  // mountain, steppe, volcanic — boom/bust
  | 'insular';  // island, highland — slow trust but loyal

export interface Region {
  id: string;                    // stable slug e.g. 'region_aurean_coast'
  name: string;
  type: RegionType;
  culture: CultureType;
  capital_town_id: string;
  base_risk_modifier: number;    // 0.8–1.5 multiplier on event probability
  base_trade_modifier: number;   // 0.8–1.3 multiplier on trade volume
  description: string;
}

export type ResourceType =
  | 'grain' | 'timber' | 'iron' | 'stone' | 'wool'
  | 'fish' | 'spice' | 'wine' | 'coal' | 'horses'
  | 'silk' | 'salt' | 'livestock' | 'herbs' | 'gold_ore'
  | 'silver_ore' | 'copper' | 'obsidian' | 'peat' | 'pearls';

export type RiskFactor =
  | 'flood_prone'
  | 'drought_prone'
  | 'piracy_risk'
  | 'bandit_raids'
  | 'volcanic_activity'
  | 'political_instability'
  | 'plague_risk'
  | 'border_conflict'
  | 'earthquake_risk'
  | 'storm_risk'
  | 'fire_risk'
  | 'isolation';

export interface Town {
  id: string;                         // stable slug e.g. 'town_valdris_port'
  name: string;
  region_id: string;
  population: number;                 // 500–50000
  wealth_per_capita: number;          // 10–500 gold
  economic_output: number;            // Derived: sum(company revenues) × season × events × cycle
  resources: ResourceType[];
  risk_factors: RiskFactor[];
  is_regional_capital: boolean;
  x_coord: number;                    // 0–100 normalized for SVG map
  y_coord: number;
}

export interface TradeRoute {
  id: string;
  town_a_id: string;
  town_b_id: string;
  strength: number;                   // 1–10
  route_type: 'land' | 'river' | 'sea';
}

export type EventType =
  | 'flood'
  | 'drought'
  | 'plague'
  | 'bandit_raid'
  | 'volcanic_eruption'
  | 'earthquake'
  | 'trade_boom'
  | 'pirate_attack'
  | 'storm'
  | 'forest_fire'
  | 'good_harvest'
  | 'poor_harvest'
  | 'resource_discovery'
  | 'political_crisis'
  | 'migration_wave'
  | 'war_declaration'
  | 'siege'
  | 'military_victory';

export interface WorldEvent {
  id: string;
  world_id: string;
  event_type: EventType;
  town_id: string;
  severity: number;                   // 0.0–1.0
  duration_ticks: number;
  ticks_remaining: number;
  economic_output_modifier: number;   // e.g. 0.7 = 30% reduction
  population_modifier: number;        // e.g. 0.95 = 5% mortality
  loan_default_modifier: number;      // multiplier on default probability
  description: string;
  occurred_at_tick: number;
}
