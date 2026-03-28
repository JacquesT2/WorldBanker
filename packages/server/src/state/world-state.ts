import type {
  Town, Region, WorldEvent, TradeRoute,
  Loan, Deposit, BalanceSheet,
  LoanProposal, LoanAuction, Player, BankingLicense, PlayerScore, WorldClock,
  AutoBidRule,
  Company, CompanyAsset, CompanyRelation,
} from '@argentum/shared';

export interface EconomicCycle {
  phase: 'boom' | 'normal' | 'contraction';
  phase_tick_start: number;
  phase_duration: number;
  multiplier: number;
}

export interface EventCooldowns {
  // regionId -> eventType -> lastTick
  [regionId: string]: { [eventType: string]: number };
}

/**
 * All hot state lives here in memory.
 * Tick processors READ and MUTATE this state directly.
 * DB writes are fire-and-forget snapshots after each tick.
 */
export class WorldState {
  worldId: string;
  worldName: string;

  // World geography (read-only after seeding)
  regions: Map<string, Region> = new Map();
  towns: Map<string, Town> = new Map();
  tradeRoutes: TradeRoute[] = [];
  townRegionMap: Map<string, string> = new Map(); // townId -> regionId

  // World time
  clock: WorldClock;
  cycle: EconomicCycle;

  // Active simulation state
  events: Map<string, WorldEvent> = new Map();
  eventCooldowns: EventCooldowns = {};
  loanProposals: Map<string, LoanProposal> = new Map();
  auctions: Map<string, LoanAuction> = new Map();

  // Company state (non-player economic actors)
  companies: Map<string, Company> = new Map();
  companyAssets: Map<string, CompanyAsset> = new Map();
  companyRelations: Map<string, CompanyRelation> = new Map(); // key: `${companyId}:${playerId}`
  companyTownIndex: Map<string, string[]> = new Map();        // townId -> companyIds

  // Player state
  players: Map<string, Player> = new Map();
  balanceSheets: Map<string, BalanceSheet> = new Map();
  licenses: Map<string, BankingLicense[]> = new Map();     // playerId -> licenses
  townLicenses: Map<string, string[]> = new Map();          // townId -> playerIds
  loans: Map<string, Loan> = new Map();
  playerLoans: Map<string, string[]> = new Map();           // playerId -> loanIds
  deposits: Map<string, Deposit> = new Map();
  playerDeposits: Map<string, string[]> = new Map();        // playerId -> depositIds
  townDeposits: Map<string, string[]> = new Map();          // townId -> depositIds
  scores: Map<string, PlayerScore> = new Map();
  autoBidRules: Map<string, AutoBidRule> = new Map();

  // Previous tick snapshot for delta computation
  prevTownOutputs: Map<string, number> = new Map();

  constructor(worldId: string, worldName: string) {
    this.worldId = worldId;
    this.worldName = worldName;
    this.clock = {
      world_id: worldId,
      current_tick: 0,
      current_day: 1,
      current_season: 'spring',
      current_year: 1,
    };
    this.cycle = {
      phase: 'normal',
      phase_tick_start: 0,
      phase_duration: 90,
      multiplier: 1.0,
    };
  }

  /** Returns all active events affecting a specific town */
  getActiveEventsForTown(townId: string): WorldEvent[] {
    const result: WorldEvent[] = [];
    for (const event of this.events.values()) {
      if (event.town_id === townId && event.ticks_remaining > 0) {
        result.push(event);
      }
    }
    return result;
  }

  /** Returns the region for a given town */
  getRegionForTown(townId: string): Region | undefined {
    const regionId = this.townRegionMap.get(townId);
    if (!regionId) return undefined;
    return this.regions.get(regionId);
  }

  /** Returns all player IDs licensed in a town */
  getLicensedPlayers(townId: string): string[] {
    return this.townLicenses.get(townId) ?? [];
  }

  /** Returns all active loans for a player */
  getActiveLoansForPlayer(playerId: string): Loan[] {
    const ids = this.playerLoans.get(playerId) ?? [];
    return ids
      .map(id => this.loans.get(id))
      .filter((l): l is Loan => l !== undefined && l.status === 'active');
  }

  /** Returns all deposits for a player */
  getDepositsForPlayer(playerId: string): Deposit[] {
    const ids = this.playerDeposits.get(playerId) ?? [];
    return ids
      .map(id => this.deposits.get(id))
      .filter((d): d is Deposit => d !== undefined);
  }

  /** Returns all deposits in a town (across all banks) */
  getDepositsForTown(townId: string): Deposit[] {
    const ids = this.townDeposits.get(townId) ?? [];
    return ids
      .map(id => this.deposits.get(id))
      .filter((d): d is Deposit => d !== undefined);
  }

  /** Returns all unexpired, unaccepted proposals for a town */
  getProposalsForTown(townId: string, currentTick: number): LoanProposal[] {
    const result: LoanProposal[] = [];
    for (const p of this.loanProposals.values()) {
      if (
        p.town_id === townId &&
        !p.accepted_by_player_id &&
        p.expires_at_tick > currentTick
      ) {
        result.push(p);
      }
    }
    return result;
  }

  /** Returns the relation score between a company and a player (0 if unknown) */
  getRelation(companyId: string, playerId: string): CompanyRelation {
    return this.companyRelations.get(`${companyId}:${playerId}`) ?? {
      company_id: companyId,
      player_id: playerId,
      score: 0,
      last_interaction_tick: 0,
    };
  }

  /** Upsert a company–player relation */
  setRelation(relation: CompanyRelation): void {
    this.companyRelations.set(`${relation.company_id}:${relation.player_id}`, relation);
  }

  /** Returns all active companies in a town */
  getActiveCompaniesForTown(townId: string): Company[] {
    const ids = this.companyTownIndex.get(townId) ?? [];
    return ids
      .map(id => this.companies.get(id))
      .filter((c): c is Company => c !== undefined && c.status !== 'bankrupt');
  }

  /** Sum of annual_revenue across all active companies in a town */
  getTownCompanyRevenue(townId: string): number {
    return this.getActiveCompaniesForTown(townId)
      .reduce((sum, c) => sum + c.annual_revenue, 0);
  }

  /** Add a license to both player and town indexes */
  addLicense(license: BankingLicense): void {
    const playerList = this.licenses.get(license.player_id) ?? [];
    playerList.push(license);
    this.licenses.set(license.player_id, playerList);

    const townList = this.townLicenses.get(license.town_id) ?? [];
    if (!townList.includes(license.player_id)) {
      townList.push(license.player_id);
      this.townLicenses.set(license.town_id, townList);
    }
  }

  /** Add a loan to both global and player indexes */
  addLoan(loan: Loan): void {
    this.loans.set(loan.id, loan);
    const playerList = this.playerLoans.get(loan.player_id) ?? [];
    if (!playerList.includes(loan.id)) {
      playerList.push(loan.id);
      this.playerLoans.set(loan.player_id, playerList);
    }
  }

  /** Add or update a deposit in both player and town indexes */
  setDeposit(deposit: Deposit): void {
    this.deposits.set(deposit.id, deposit);

    const playerList = this.playerDeposits.get(deposit.player_id) ?? [];
    if (!playerList.includes(deposit.id)) {
      playerList.push(deposit.id);
      this.playerDeposits.set(deposit.player_id, playerList);
    }

    const townList = this.townDeposits.get(deposit.town_id) ?? [];
    if (!townList.includes(deposit.id)) {
      townList.push(deposit.id);
      this.townDeposits.set(deposit.town_id, townList);
    }
  }

  /** Add a company and register it in the town index */
  addCompany(company: Company): void {
    this.companies.set(company.id, company);
    const townList = this.companyTownIndex.get(company.town_id) ?? [];
    if (!townList.includes(company.id)) {
      townList.push(company.id);
      this.companyTownIndex.set(company.town_id, townList);
    }
  }

  /** Get all non-bankrupt players */
  getActivePlayers(): Player[] {
    return Array.from(this.players.values()).filter(p => !p.is_bankrupt);
  }

  /**
   * Replace all mutable game state in-place from a freshly loaded WorldState.
   * Preserves object identity so existing references (engine, socket server) stay valid.
   */
  replaceWith(fresh: WorldState): void {
    this.clock = fresh.clock;
    this.cycle = fresh.cycle;
    this.towns = fresh.towns;
    this.prevTownOutputs = fresh.prevTownOutputs;
    this.events = fresh.events;
    this.eventCooldowns = fresh.eventCooldowns;
    this.loanProposals = fresh.loanProposals;
    this.auctions = fresh.auctions;
    this.companies = fresh.companies;
    this.companyAssets = fresh.companyAssets;
    this.companyRelations = fresh.companyRelations;
    this.companyTownIndex = fresh.companyTownIndex;
    this.players = fresh.players;
    this.balanceSheets = fresh.balanceSheets;
    this.licenses = fresh.licenses;
    this.townLicenses = fresh.townLicenses;
    this.loans = fresh.loans;
    this.playerLoans = fresh.playerLoans;
    this.deposits = fresh.deposits;
    this.playerDeposits = fresh.playerDeposits;
    this.townDeposits = fresh.townDeposits;
    this.scores = fresh.scores;
    this.autoBidRules = fresh.autoBidRules;
  }
}
