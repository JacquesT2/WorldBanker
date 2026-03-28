import { v4 as uuidv4 } from 'uuid';
import type { WorldState } from '../state/world-state';
import type { LoanProposal, Company } from '@argentum/shared';
import {
  TICKS_PER_YEAR,
  LOAN_PROPOSAL_EXPIRY_TICKS,
  resolveTraitEffects,
} from '@argentum/shared';

/** Per-tick base default probability before trait/relation adjustments */
const BASE_COMPANY_DEFAULT_RATE = 0.001; // ~0.36/year at 360 ticks

/** Fraction of revenue paid out as operating expenses (base, before margin trait) */
const BASE_EXPENSE_RATIO = 0.65;

/** Equity threshold below which a company becomes 'struggling' */
const STRUGGLING_EQUITY_RATIO = 0.15; // equity < 15% of annual_revenue

/** Struggling companies gradually recover cash from operations each tick */
const RECOVERY_CASH_PER_TICK_RATIO = 0.001;

/**
 * Step 7: Process all active companies.
 *
 * Each tick:
 * 1. Accrue operating income and expenses (cash flow)
 * 2. Update company status (active / struggling / bankrupt)
 * 3. On bankruptcy: orphan assets, mark company bankrupt
 * 4. Degrade orphaned asset conditions
 * 5. Generate loan proposals from companies that need capital
 */
export function processCompanies(state: WorldState): void {
  const tick = state.clock.current_tick;

  // ── 1 & 2: Cash flow and status ───────────────────────────────────────────
  for (const company of state.companies.values()) {
    if (company.status === 'bankrupt') continue;

    // Net cash flow this tick = (revenue − expenses) / TICKS_PER_YEAR
    const netPerTick = (company.annual_revenue - company.annual_expenses) / TICKS_PER_YEAR;
    company.cash += netPerTick;

    // Debt service: accrued interest on outstanding loans is handled by loan-processor
    // (which credits cash to the player). Company's total_debt is updated when loans are
    // created/repaid/defaulted — we just reduce equity by current debt here.
    company.equity = company.cash
      + calcTotalAssetValue(state, company.id)
      - company.total_debt;

    // Classify status
    const revenueBase = company.annual_revenue || 1;
    if (company.equity < 0 || (company.cash < 0 && company.total_debt > revenueBase)) {
      // Insolvent — go bankrupt
      company.status = 'bankrupt';
      orphanCompanyAssets(state, company, tick);
      console.log(`[companies] ${company.name} (${company.town_id}) went bankrupt`);
      continue;
    }

    const prevStatus = company.status;
    if (company.equity < revenueBase * STRUGGLING_EQUITY_RATIO || company.cash < 0) {
      company.status = 'struggling';
      if (prevStatus === 'active') {
        console.log(`[companies] ${company.name} is now struggling`);
      }
    } else {
      company.status = 'active';
    }
  }

  // ── 3: Degrade orphaned asset conditions ─────────────────────────────────
  for (const asset of state.companyAssets.values()) {
    if (asset.company_id !== null) continue;
    // Orphaned assets lose ~1 condition point per 10 ticks
    if (tick % 10 === 0 && asset.condition > 0) {
      asset.condition = Math.max(0, asset.condition - 1);
      // Reduce revenue proportionally
      asset.annual_revenue *= 0.99;
    }
  }

  // ── 4: Generate loan proposals from active companies ─────────────────────
  // Only generate for towns that have at least one licensed bank
  for (const company of state.companies.values()) {
    if (company.status === 'bankrupt') continue;

    // Roll whether this company seeks a loan this tick
    if (Math.random() >= company.loan_demand_per_tick) continue;

    // Don't spam proposals — skip if company already has a live proposal
    const hasLiveProposal = hasActiveLoanProposal(state, company.id);
    if (hasLiveProposal) continue;

    // Only generate if a bank is licensed in this town
    const licensedPlayers = state.getLicensedPlayers(company.town_id);
    if (licensedPlayers.length === 0) continue;

    const proposal = generateCompanyProposal(state, company, tick);
    if (proposal) {
      state.loanProposals.set(proposal.id, proposal);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcTotalAssetValue(state: WorldState, companyId: string): number {
  let total = 0;
  for (const asset of state.companyAssets.values()) {
    if (asset.company_id === companyId) {
      total += asset.value * (asset.condition / 100);
    }
  }
  return total;
}

function orphanCompanyAssets(state: WorldState, company: Company, tick: number): void {
  for (const asset of state.companyAssets.values()) {
    if (asset.company_id === company.id) {
      asset.company_id = null;
      asset.orphaned_at_tick = tick;
    }
  }
  company.asset_count = 0;
}

function hasActiveLoanProposal(state: WorldState, companyId: string): boolean {
  for (const p of state.loanProposals.values()) {
    if (p.company_id === companyId && !p.accepted_by_player_id) return true;
  }
  // Also check open auctions
  for (const a of state.auctions.values()) {
    if (a.company_id === companyId && a.status === 'open') return true;
  }
  return false;
}

/**
 * Compute the default probability for a specific loan, factoring in
 * the company's traits, its relation with the lender, and active events.
 */
export function calcCompanyDefaultProbability(
  company: Company,
  lenderPlayerId: string,
  regionRiskModifier: number,
  eventLoanDefaultModifier: number,
  relationScore: number,
): number {
  // Base from company traits
  let p = company.base_default_probability;

  // Region risk
  p *= regionRiskModifier;

  // Events
  p *= eventLoanDefaultModifier;

  // Relation bonus: good relations reduce default risk (loyal companies honour their lenders)
  // +100 relation → 0.6x, 0 → 1.0x, -100 → 1.6x
  const relationMod = 1.0 - (relationScore / 100) * 0.4;
  p *= relationMod;

  // Struggling companies are 2x riskier
  if (company.status === 'struggling') p *= 2.0;

  return Math.min(p, 0.1); // Cap at 10% per tick
}

function generateCompanyProposal(
  state: WorldState,
  company: Company,
  tick: number,
): LoanProposal | null {
  const effects = resolveTraitEffects(company.traits);

  // Loan size: proportional to annual revenue, scaled by capital aggression
  // Aggressive companies borrow more relative to revenue
  const aggressionScale = 1.0 + effects.capital_aggression * 0.5; // 0.5x–1.5x
  const scale = (0.08 + Math.random() * 0.12) * aggressionScale;
  const requested_amount = Math.max(100, Math.round(company.annual_revenue * scale / 100) * 100);

  // Don't borrow more than 2× annual revenue in total
  if (company.total_debt + requested_amount > company.annual_revenue * 2) return null;

  const base_default_probability = company.base_default_probability;

  // Max rate from traits + some per-company randomness
  const max_acceptable_rate = Math.max(
    0.06,
    company.max_acceptable_rate * (0.9 + Math.random() * 0.2),
  );

  // Term: conservative companies prefer shorter terms; aggressive prefer longer
  const baseTerm = 90 + Math.floor(Math.random() * 180); // 90–270 ticks
  const termScale = effects.capital_aggression > 0 ? 1.3 : 0.8;
  const term_ticks = Math.round(baseTerm * termScale);

  // Collateral: organised/loyal companies offer more; chaotic/toxic offer less
  const collateral_value = requested_amount * (0.3 + Math.random() * 0.4) * effects.collateral_modifier;
  const partial_recovery_rate = Math.min(0.85, 0.35 + Math.random() * 0.3);

  return {
    id: uuidv4(),
    world_id: state.worldId,
    town_id: company.town_id,
    company_id: company.id,
    borrower_name: company.name,
    company_type: company.company_type,
    requested_amount,
    max_acceptable_rate,
    term_ticks,
    base_default_probability,
    collateral_value,
    partial_recovery_rate,
    expires_at_tick: tick + LOAN_PROPOSAL_EXPIRY_TICKS,
    created_at_tick: tick,
  };
}

/**
 * Compute initial company financial parameters from its traits.
 * Called at seed time (and when a new company is introduced mid-game).
 */
export function deriveCompanyParams(
  company: Pick<Company, 'traits' | 'annual_revenue'>,
): {
  annual_expenses: number;
  loan_demand_per_tick: number;
  max_acceptable_rate: number;
  base_default_probability: number;
} {
  const effects = resolveTraitEffects(company.traits);

  // Expenses = revenue × (1 − margin). Better margin_modifier → lower expense ratio.
  const expenseRatio = BASE_EXPENSE_RATIO / effects.margin_modifier;
  const annual_expenses = company.annual_revenue * Math.min(0.95, expenseRatio);

  // Base demand: ~5% chance per tick, scaled by loan_demand_modifier
  // (at 5% / tick a company generates ~1 proposal every 20 ticks = ~1.7 min)
  const loan_demand_per_tick = Math.min(0.25, 0.05 * effects.loan_demand_modifier);

  // Max rate: base 12%, scaled by max_rate_modifier
  const max_acceptable_rate = 0.12 * effects.max_rate_modifier;

  // Default prob: base × combined trait modifier
  const base_default_probability = BASE_COMPANY_DEFAULT_RATE * effects.base_default_modifier;

  return { annual_expenses, loan_demand_per_tick, max_acceptable_rate, base_default_probability };
}
