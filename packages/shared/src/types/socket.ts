import type { TickDelta, WorldSnapshot } from './tick.js';
import type { WorldEvent, Town } from './world.js';
import type { Loan, Deposit, LoanProposal, BalanceSheet } from './banking.js';
import type { Player, BankingLicense } from './player.js';

export interface BalanceHistoryPoint {
  tick: number;
  cash: number;
  total_loan_book: number;
  total_deposits_owed: number;
  total_interest_accrued: number;
  equity: number;
  reserve_ratio: number;
}

// Full player-specific snapshot (sent on connect)
export interface PlayerSnapshot extends WorldSnapshot {
  player: Player;
  licenses: BankingLicense[];
  balance_sheet: BalanceSheet;
  loans: Loan[];
  deposits: Deposit[];
  balance_history: BalanceHistoryPoint[];
}

// Server → Client
export interface ServerToClientEvents {
  'world:snapshot': (snapshot: PlayerSnapshot) => void;
  'tick:delta': (delta: TickDelta) => void;
  'loan:proposal:new': (proposal: LoanProposal) => void;
  'loan:defaulted': (data: { loan_id: string; recovery_amount: number }) => void;
  'player:bankrupt': (data: { player_id: string; bank_name: string }) => void;
  'event:occurred': (event: WorldEvent) => void;
  'town:updated': (town: Town) => void;
}

// Client → Server
export type AckCallback<T = void> = (response: { success: boolean; error?: string; data?: T }) => void;

export interface ClientToServerEvents {
  'loan:accept': (
    data: { proposal_id: string; offered_rate: number },
    callback: AckCallback<{ loan_id: string }>
  ) => void;
  'loan:reject': (
    data: { proposal_id: string },
    callback: AckCallback
  ) => void;
  'deposit:set-rate': (
    data: { town_id: string; rate: number },
    callback: AckCallback
  ) => void;
  'lending:set-allocation': (
    data: { town_id: string; capital: number; rate: number },
    callback: AckCallback
  ) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  player_id: string;
  world_id: string;
}
