export type CompanyTraitId =
  | 'organised'     | 'disorganised'
  | 'orderly'       | 'chaotic'
  | 'hierarchical'  | 'flat'        | 'bureaucratic'
  | 'friendly'      | 'hostile'
  | 'kind'          | 'predatory'
  | 'aggressive'    | 'conservative'
  | 'toxic'
  | 'innovative'    | 'traditional'
  | 'risk_tolerant' | 'risk_averse'
  | 'well_connected'| 'isolated'
  | 'loyal'         | 'opportunistic';

/**
 * Numeric effect modifiers a single trait contributes.
 * A company's effective values are the product/sum across all its traits.
 */
export interface TraitEffects {
  /** Multiplier on operating cashflow (1.0 = neutral) */
  cashflow_modifier: number;
  /** Multiplier on profit margins */
  margin_modifier: number;
  /** Multiplier on per-tick loan default probability */
  base_default_modifier: number;
  /** Multiplier on collateral value the company offers */
  collateral_modifier: number;
  /** Multiplier on how often this company seeks loans */
  loan_demand_modifier: number;
  /** Multiplier on the maximum interest rate they will accept */
  max_rate_modifier: number;
  /** -1.0 (very conservative) to +1.0 (very aggressive) capital deployment */
  capital_aggression: number;
  /** -1.0 (hostile) to +1.0 (very collaborative) with other entities */
  collaboration_score: number;
  /** Multiplier on how fast player-company relations improve */
  relation_gain_modifier: number;
  /** Multiplier on asset expansion speed */
  expansion_rate: number;
}

export interface CompanyTrait {
  id: CompanyTraitId;
  name: string;
  description: string;
  effects: TraitEffects;
}

export type CompanyType =
  | 'merchant_guild'
  | 'noble_house'
  | 'craft_workshop'
  | 'shipping_company'
  | 'farm_estate'
  | 'mining_operation'
  | 'trade_company'
  | 'military_contractor'
  | 'religious_order'
  | 'banking_house';

export type AssetType =
  | 'warehouse'
  | 'merchant_ship'
  | 'mine'
  | 'farm'
  | 'market_stall'
  | 'smithy'
  | 'mill'
  | 'tavern'
  | 'dockyard'
  | 'quarry'
  | 'granary'
  | 'tannery'
  | 'textile_mill'
  | 'brewery'
  | 'watchtower';

/**
 * A physical asset owned by a company (or orphaned after bankruptcy).
 * Orphaned assets deteriorate in condition and drag down town economic output
 * until acquired by another company.
 */
export interface CompanyAsset {
  id: string;
  /** null when orphaned — the asset exists in the world but has no owner */
  company_id: string | null;
  world_id: string;
  town_id: string;
  asset_type: AssetType;
  name: string;
  /** Current market value in gold */
  value: number;
  /** 0–100; deteriorates when orphaned, affects revenue contribution */
  condition: number;
  /** Annual gold revenue this asset contributes to its owner */
  annual_revenue: number;
  created_at_tick: number;
  orphaned_at_tick?: number;
}

export interface CompanyRelation {
  company_id: string;
  player_id: string;
  /** -100 (hostile) to +100 (trusted partner), 0 = unknown/neutral */
  score: number;
  last_interaction_tick: number;
}

export type CompanyStatus = 'active' | 'struggling' | 'bankrupt';

/**
 * A non-player company entity that lives in a town.
 * Companies are the primary borrowers and economic actors in the world.
 * Traits drive all behavioral parameters — loan rates, default risk, collaboration.
 */
export interface Company {
  id: string;
  world_id: string;
  name: string;
  town_id: string;
  company_type: CompanyType;
  /** 2–5 trait IDs; their combined effects define all behavioral parameters */
  traits: CompanyTraitId[];

  // ── Financial state (updated each tick) ───────────────────────────────────
  cash: number;
  /** Sum of annual_revenue across all owned assets + operating income */
  annual_revenue: number;
  /** Annual operating costs (derived from margins and cashflow traits) */
  annual_expenses: number;
  /** cash + total_asset_value − total_debt */
  equity: number;
  /** Sum of outstanding borrowed loan balances */
  total_debt: number;

  // ── Derived loan behavior (computed from traits at creation, cached) ───────
  /** Per-tick probability [0–1] of generating a loan request */
  loan_demand_per_tick: number;
  /** Highest annual interest rate they will accept */
  max_acceptable_rate: number;
  /** Per-tick base default probability before relation/event adjustments */
  base_default_probability: number;

  status: CompanyStatus;
  founded_at_tick: number;
  asset_count: number;
}
