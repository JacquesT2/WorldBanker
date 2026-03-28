import { Pool } from 'pg';
import { WorldState } from './world-state';
import type {
  Town, Region, WorldEvent, TradeRoute,
  Loan, Deposit, BalanceSheet,
  LoanProposal, LoanAuction, Player, BankingLicense, PlayerScore,
  Company, CompanyAsset, CompanyRelation,
} from '@argentum/shared';

/**
 * Reconstruct full hot state from DB after server restart.
 * Runs all queries sequentially; typically <500ms for this data volume.
 */
export async function loadWorldState(pool: Pool): Promise<WorldState> {
  const { rows: worldRows } = await pool.query<{
    id: string; name: string;
  }>('SELECT id, name FROM worlds WHERE is_active = true LIMIT 1');

  if (worldRows.length === 0) {
    throw new Error('No active world found. Run db:seed first.');
  }

  const { id: worldId, name: worldName } = worldRows[0]!;
  const state = new WorldState(worldId, worldName);

  // Load regions
  const { rows: regionRows } = await pool.query<{
    id: string; name: string; type: string; culture: string;
    capital_town_id: string; base_risk_modifier: string;
    base_trade_modifier: string; description: string;
  }>('SELECT * FROM regions WHERE world_id = $1', [worldId]);

  for (const r of regionRows) {
    const region: Region = {
      id: r.id,
      name: r.name,
      type: r.type as Region['type'],
      culture: r.culture as Region['culture'],
      capital_town_id: r.capital_town_id,
      base_risk_modifier: parseFloat(r.base_risk_modifier),
      base_trade_modifier: parseFloat(r.base_trade_modifier),
      description: r.description,
    };
    state.regions.set(region.id, region);
  }

  // Load towns
  const { rows: townRows } = await pool.query<{
    id: string; name: string; region_id: string;
    population: number; wealth_per_capita: string; economic_output: string;
    resources: string[];
    risk_factors: string[]; is_regional_capital: boolean;
    x_coord: string; y_coord: string;
  }>('SELECT id, name, region_id, population, wealth_per_capita, economic_output, resources, risk_factors, is_regional_capital, x_coord, y_coord FROM towns WHERE world_id = $1', [worldId]);

  for (const t of townRows) {
    const town: Town = {
      id: t.id,
      name: t.name,
      region_id: t.region_id,
      population: t.population,
      wealth_per_capita: parseFloat(t.wealth_per_capita),
      economic_output: parseFloat(t.economic_output),
      resources: t.resources as Town['resources'],
      risk_factors: t.risk_factors as Town['risk_factors'],
      is_regional_capital: t.is_regional_capital,
      x_coord: parseFloat(t.x_coord),
      y_coord: parseFloat(t.y_coord),
    };
    state.towns.set(town.id, town);
    state.townRegionMap.set(town.id, town.region_id);
  }

  // Load trade routes
  const { rows: routeRows } = await pool.query<{
    id: string; town_a_id: string; town_b_id: string;
    strength: number; route_type: string;
  }>('SELECT * FROM trade_routes WHERE world_id = $1', [worldId]);

  state.tradeRoutes = routeRows.map(r => ({
    id: r.id,
    town_a_id: r.town_a_id,
    town_b_id: r.town_b_id,
    strength: r.strength,
    route_type: r.route_type as TradeRoute['route_type'],
  }));

  // Load world clock
  const { rows: clockRows } = await pool.query(
    'SELECT * FROM world_clock WHERE world_id = $1',
    [worldId]
  );
  if (clockRows.length > 0) {
    const c = clockRows[0];
    state.clock = {
      world_id: worldId,
      current_tick: c.current_tick,
      current_day: c.current_day,
      current_season: c.current_season,
      current_year: c.current_year,
    };
  }

  // Load economic cycle
  const { rows: cycleRows } = await pool.query(
    'SELECT * FROM economic_cycle WHERE world_id = $1',
    [worldId]
  );
  if (cycleRows.length > 0) {
    const c = cycleRows[0];
    state.cycle = {
      phase: c.phase,
      phase_tick_start: c.phase_tick_start,
      phase_duration: c.phase_duration,
      multiplier: parseFloat(c.multiplier),
    };
  }

  // Load active events
  const { rows: eventRows } = await pool.query<{
    id: string; event_type: string; town_id: string;
    severity: string; duration_ticks: number; ticks_remaining: number;
    economic_output_modifier: string; population_modifier: string;
    loan_default_modifier: string; description: string; occurred_at_tick: number;
  }>(
    'SELECT * FROM world_events WHERE world_id = $1 AND ticks_remaining > 0',
    [worldId]
  );

  for (const e of eventRows) {
    const event: WorldEvent = {
      id: e.id,
      world_id: worldId,
      event_type: e.event_type as WorldEvent['event_type'],
      town_id: e.town_id,
      severity: parseFloat(e.severity),
      duration_ticks: e.duration_ticks,
      ticks_remaining: e.ticks_remaining,
      economic_output_modifier: parseFloat(e.economic_output_modifier),
      population_modifier: parseFloat(e.population_modifier),
      loan_default_modifier: parseFloat(e.loan_default_modifier),
      description: e.description,
      occurred_at_tick: e.occurred_at_tick,
    };
    state.events.set(event.id, event);
  }

  // Load event cooldowns
  const { rows: cooldownRows } = await pool.query<{
    region_id: string; event_type: string; last_tick: number;
  }>('SELECT region_id, event_type, last_tick FROM event_cooldowns WHERE world_id = $1', [worldId]);

  for (const cd of cooldownRows) {
    if (!state.eventCooldowns[cd.region_id]) {
      state.eventCooldowns[cd.region_id] = {};
    }
    state.eventCooldowns[cd.region_id]![cd.event_type] = cd.last_tick;
  }

  // Load companies
  const { rows: companyRows } = await pool.query<{
    id: string; world_id: string; name: string; town_id: string;
    company_type: string; traits: string[];
    cash: string; annual_revenue: string; annual_expenses: string;
    equity: string; total_debt: string;
    loan_demand_per_tick: string; max_acceptable_rate: string;
    base_default_probability: string;
    status: string; founded_at_tick: number; asset_count: number;
  }>('SELECT * FROM companies WHERE world_id = $1 AND status != $2', [worldId, 'bankrupt']);

  for (const c of companyRows) {
    const company: Company = {
      id: c.id,
      world_id: c.world_id,
      name: c.name,
      town_id: c.town_id,
      company_type: c.company_type as Company['company_type'],
      traits: c.traits as Company['traits'],
      cash: parseFloat(c.cash),
      annual_revenue: parseFloat(c.annual_revenue),
      annual_expenses: parseFloat(c.annual_expenses),
      equity: parseFloat(c.equity),
      total_debt: parseFloat(c.total_debt),
      loan_demand_per_tick: parseFloat(c.loan_demand_per_tick),
      max_acceptable_rate: parseFloat(c.max_acceptable_rate),
      base_default_probability: parseFloat(c.base_default_probability),
      status: c.status as Company['status'],
      founded_at_tick: c.founded_at_tick,
      asset_count: c.asset_count,
    };
    state.addCompany(company);
  }

  // Load company assets
  const { rows: assetRows } = await pool.query<{
    id: string; company_id: string | null; world_id: string; town_id: string;
    asset_type: string; name: string; value: string; condition: number;
    annual_revenue: string; created_at_tick: number; orphaned_at_tick: number | null;
  }>('SELECT * FROM company_assets WHERE world_id = $1', [worldId]);

  for (const a of assetRows) {
    const asset: CompanyAsset = {
      id: a.id,
      company_id: a.company_id ?? null,
      world_id: a.world_id,
      town_id: a.town_id,
      asset_type: a.asset_type as CompanyAsset['asset_type'],
      name: a.name,
      value: parseFloat(a.value),
      condition: a.condition,
      annual_revenue: parseFloat(a.annual_revenue),
      created_at_tick: a.created_at_tick,
      orphaned_at_tick: a.orphaned_at_tick ?? undefined,
    };
    state.companyAssets.set(asset.id, asset);
  }

  // Load company relations
  const { rows: relationRows } = await pool.query<{
    company_id: string; player_id: string; score: string; last_interaction_tick: number;
  }>(`
    SELECT cr.* FROM company_relations cr
    JOIN players p ON p.id = cr.player_id
    WHERE p.world_id = $1
  `, [worldId]);

  for (const r of relationRows) {
    const relation: CompanyRelation = {
      company_id: r.company_id,
      player_id: r.player_id,
      score: parseFloat(r.score),
      last_interaction_tick: r.last_interaction_tick,
    };
    state.setRelation(relation);
  }

  // Load players
  const { rows: playerRows } = await pool.query<{
    id: string; username: string; bank_name: string;
    reputation: string; starting_town_id: string;
    is_bankrupt: boolean; bankruptcy_tick: number | null;
    is_bot: boolean; bot_strategy: string | null;
    created_at: string;
  }>('SELECT * FROM players WHERE world_id = $1', [worldId]);

  for (const p of playerRows) {
    const player: Player = {
      id: p.id,
      world_id: worldId,
      username: p.username,
      bank_name: p.bank_name,
      reputation: parseFloat(p.reputation),
      starting_town_id: p.starting_town_id,
      is_bankrupt: p.is_bankrupt,
      bankruptcy_tick: p.bankruptcy_tick ?? undefined,
      is_bot: p.is_bot ?? false,
      bot_strategy: p.bot_strategy ?? undefined,
      created_at: p.created_at,
    };
    state.players.set(player.id, player);
  }

  // Load balance sheets
  const { rows: bsRows } = await pool.query<{
    player_id: string; cash: string; total_loan_book: string;
    total_deposits_owed: string;
    total_interest_accrued: string; equity: string;
    reserve_ratio: string; last_updated_tick: number;
  }>(`
    SELECT bs.* FROM balance_sheets bs
    JOIN players p ON p.id = bs.player_id
    WHERE p.world_id = $1
  `, [worldId]);

  for (const b of bsRows) {
    const bs: BalanceSheet = {
      player_id: b.player_id,
      cash: parseFloat(b.cash),
      total_loan_book: parseFloat(b.total_loan_book),
      total_deposits_owed: parseFloat(b.total_deposits_owed),
      total_interest_accrued: parseFloat(b.total_interest_accrued),
      equity: parseFloat(b.equity),
      reserve_ratio: parseFloat(b.reserve_ratio),
      last_updated_tick: b.last_updated_tick,
    };
    state.balanceSheets.set(bs.player_id, bs);
  }

  // Load licenses
  const { rows: licenseRows } = await pool.query<{
    id: string; player_id: string; town_id: string;
    acquired_at_tick: number; cost_paid: string; is_starting_license: boolean;
  }>(`
    SELECT bl.* FROM banking_licenses bl
    JOIN players p ON p.id = bl.player_id
    WHERE p.world_id = $1
  `, [worldId]);

  for (const l of licenseRows) {
    const license: BankingLicense = {
      id: l.id,
      player_id: l.player_id,
      town_id: l.town_id,
      acquired_at_tick: l.acquired_at_tick,
      cost_paid: parseFloat(l.cost_paid),
      is_starting_license: l.is_starting_license,
    };
    state.addLicense(license);
  }

  // Load active loans
  const { rows: loanRows } = await pool.query<{
    id: string; player_id: string; town_id: string;
    company_id: string; borrower_name: string; company_type: string;
    principal: string; outstanding_balance: string; interest_rate: string;
    term_ticks: number; ticks_elapsed: number; status: string;
    default_probability_per_tick: string; collateral_value: string;
    partial_recovery_rate: string; created_at_tick: number;
    defaulted_at_tick: number | null; repaid_at_tick: number | null;
  }>(`
    SELECT l.* FROM loans l
    JOIN players p ON p.id = l.player_id
    WHERE p.world_id = $1 AND l.status = 'active'
  `, [worldId]);

  for (const l of loanRows) {
    const loan: Loan = {
      id: l.id,
      player_id: l.player_id,
      town_id: l.town_id,
      company_id: l.company_id,
      borrower_name: l.borrower_name,
      company_type: l.company_type as Loan['company_type'],
      principal: parseFloat(l.principal),
      outstanding_balance: parseFloat(l.outstanding_balance),
      interest_rate: parseFloat(l.interest_rate),
      term_ticks: l.term_ticks,
      ticks_elapsed: l.ticks_elapsed,
      status: l.status as Loan['status'],
      default_probability_per_tick: parseFloat(l.default_probability_per_tick),
      collateral_value: parseFloat(l.collateral_value),
      partial_recovery_rate: parseFloat(l.partial_recovery_rate),
      created_at_tick: l.created_at_tick,
      defaulted_at_tick: l.defaulted_at_tick ?? undefined,
      repaid_at_tick: l.repaid_at_tick ?? undefined,
    };
    state.addLoan(loan);
  }

  // Load deposits
  const { rows: depositRows } = await pool.query<{
    id: string; player_id: string; town_id: string;
    balance: string; interest_rate_offered: string;
    last_inflow_tick: number; last_interest_accrual_tick: number;
  }>(`
    SELECT d.* FROM deposits d
    JOIN players p ON p.id = d.player_id
    WHERE p.world_id = $1 AND d.balance > 0
  `, [worldId]);

  for (const d of depositRows) {
    const deposit: Deposit = {
      id: d.id,
      player_id: d.player_id,
      town_id: d.town_id,
      balance: parseFloat(d.balance),
      interest_rate_offered: parseFloat(d.interest_rate_offered),
      last_inflow_tick: d.last_inflow_tick,
      last_interest_accrual_tick: d.last_interest_accrual_tick,
    };
    state.setDeposit(deposit);
  }

  // Load active loan proposals
  const { rows: proposalRows } = await pool.query<{
    id: string; world_id: string; town_id: string;
    company_id: string; borrower_name: string; company_type: string;
    requested_amount: string; max_acceptable_rate: string;
    term_ticks: number; base_default_probability: string;
    collateral_value: string; partial_recovery_rate: string;
    expires_at_tick: number; created_at_tick: number;
    accepted_by_player_id: string | null; accepted_at_tick: number | null;
  }>(
    `SELECT * FROM loan_proposals
     WHERE world_id = $1 AND accepted_by_player_id IS NULL
       AND expires_at_tick > $2`,
    [worldId, state.clock.current_tick]
  );

  for (const pr of proposalRows) {
    const proposal: LoanProposal = {
      id: pr.id,
      world_id: pr.world_id,
      town_id: pr.town_id,
      company_id: pr.company_id,
      borrower_name: pr.borrower_name,
      company_type: pr.company_type as LoanProposal['company_type'],
      requested_amount: parseFloat(pr.requested_amount),
      max_acceptable_rate: parseFloat(pr.max_acceptable_rate),
      term_ticks: pr.term_ticks,
      base_default_probability: parseFloat(pr.base_default_probability),
      collateral_value: parseFloat(pr.collateral_value),
      partial_recovery_rate: parseFloat(pr.partial_recovery_rate),
      expires_at_tick: pr.expires_at_tick,
      created_at_tick: pr.created_at_tick,
      accepted_by_player_id: pr.accepted_by_player_id ?? undefined,
      accepted_at_tick: pr.accepted_at_tick ?? undefined,
    };
    state.loanProposals.set(proposal.id, proposal);
  }

  // Load player scores
  const { rows: scoreRows } = await pool.query<{
    player_id: string; total_score: string; net_worth_score: string;
    portfolio_quality_score: string; reserve_health_score: string;
    rank: number; last_updated_tick: number;
  }>(`
    SELECT ps.*, p.username, p.bank_name
    FROM player_scores ps
    JOIN players p ON p.id = ps.player_id
    WHERE p.world_id = $1
  `, [worldId]);

  for (const s of scoreRows) {
    const score: PlayerScore = {
      player_id: s.player_id,
      username: (s as any).username,
      bank_name: (s as any).bank_name,
      total_score: parseFloat(s.total_score),
      net_worth_score: parseFloat(s.net_worth_score),
      portfolio_quality_score: parseFloat(s.portfolio_quality_score),
      reserve_health_score: parseFloat(s.reserve_health_score),
      rank: s.rank,
      last_updated_tick: s.last_updated_tick,
    };
    state.scores.set(score.player_id, score);
  }

  // Load auto-bid rules
  const { rows: ruleRows } = await pool.query<{
    player_id: string; enabled: boolean;
    max_risk_pct_per_year: string; min_net_yield_pct: string;
    max_loan_amount: number; max_total_capital: number;
    min_reserve_after: string; allowed_types: string[]; rate_discount: string;
  }>('SELECT * FROM player_auto_bid_rules');

  for (const r of ruleRows) {
    state.autoBidRules.set(r.player_id, {
      player_id: r.player_id,
      enabled: r.enabled,
      max_risk_pct_per_year: parseFloat(r.max_risk_pct_per_year),
      min_net_yield_pct: parseFloat(r.min_net_yield_pct),
      max_loan_amount: r.max_loan_amount,
      max_total_capital: r.max_total_capital,
      min_reserve_after: parseFloat(r.min_reserve_after),
      allowed_types: r.allowed_types,
      rate_discount: parseFloat(r.rate_discount),
    });
  }

  // Load open auctions (with their bids)
  const { rows: auctionRows } = await pool.query<{
    id: string; world_id: string; town_id: string;
    company_id: string; borrower_name: string; company_type: string;
    requested_amount: string; max_acceptable_rate: string;
    term_ticks: number; base_default_probability: string;
    collateral_value: string; partial_recovery_rate: string;
    created_at_tick: number; closes_at_tick: number;
  }>(
    `SELECT * FROM loan_auctions WHERE world_id = $1 AND status = 'open' AND closes_at_tick > $2`,
    [worldId, state.clock.current_tick]
  );

  for (const a of auctionRows) {
    const { rows: bidRows } = await pool.query<{
      player_id: string; bank_name: string; offered_rate: string; bid_tick: number;
    }>(
      `SELECT ab.player_id, p.bank_name, ab.offered_rate, ab.bid_tick
       FROM auction_bids ab
       JOIN players p ON p.id = ab.player_id
       WHERE ab.auction_id = $1`,
      [a.id]
    );

    const auction: LoanAuction = {
      id: a.id,
      world_id: a.world_id,
      town_id: a.town_id,
      company_id: a.company_id,
      borrower_name: a.borrower_name,
      company_type: a.company_type as LoanAuction['company_type'],
      requested_amount: parseFloat(a.requested_amount),
      max_acceptable_rate: parseFloat(a.max_acceptable_rate),
      term_ticks: a.term_ticks,
      base_default_probability: parseFloat(a.base_default_probability),
      collateral_value: parseFloat(a.collateral_value),
      partial_recovery_rate: parseFloat(a.partial_recovery_rate),
      created_at_tick: a.created_at_tick,
      closes_at_tick: a.closes_at_tick,
      bids: bidRows.map(b => ({
        player_id: b.player_id,
        bank_name: b.bank_name,
        offered_rate: parseFloat(b.offered_rate),
        bid_tick: b.bid_tick,
      })),
      status: 'open',
    };
    state.auctions.set(auction.id, auction);
  }

  // Initialize prev outputs from current state
  for (const [id, town] of state.towns) {
    state.prevTownOutputs.set(id, town.economic_output);
  }

  console.log(`[state-loader] Loaded world "${worldName}" — tick ${state.clock.current_tick}`);
  console.log(`  Regions: ${state.regions.size}, Towns: ${state.towns.size}, Players: ${state.players.size}`);
  console.log(`  Companies: ${state.companies.size}, Assets: ${state.companyAssets.size}`);
  console.log(`  Active loans: ${state.loans.size}, Deposits: ${state.deposits.size}`);

  return state;
}
