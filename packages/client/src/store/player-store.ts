'use client';
import { create } from 'zustand';
import type {
  Player, BalanceSheet, BankingLicense, Loan, Deposit,
  LoanProposal, PlayerScore,
} from '@argentum/shared';
import type { TickDelta } from '@argentum/shared';

const MAX_HISTORY = 720; // ~2 game years

export interface BalanceSheetSnapshot {
  tick: number;
  cash: number;
  total_loan_book: number;
  total_deposits_owed: number;
  total_interest_accrued: number;
  equity: number;
  reserve_ratio: number;
}

export interface TownDepositSnapshot {
  tick: number;
  balance: number;
}

interface PlayerStore {
  player: Player | null;
  balanceSheet: BalanceSheet | null;
  licenses: BankingLicense[];
  loans: Loan[];
  deposits: Deposit[];
  proposals: LoanProposal[];
  leaderboard: PlayerScore[];
  history: BalanceSheetSnapshot[];
  townDepositHistory: Record<string, TownDepositSnapshot[]>;  // town_id -> snapshots

  // Actions
  hydrate: (data: {
    player: Player;
    balanceSheet: BalanceSheet | null;
    licenses: BankingLicense[];
    loans: Loan[];
    deposits: Deposit[];
    proposals: LoanProposal[];
    leaderboard: PlayerScore[];
    balanceHistory: BalanceSheetSnapshot[];
  }) => void;
  applyDelta: (delta: TickDelta) => void;
  removeProposal: (id: string) => void;
  addLoan: (loan: Loan) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  player: null,
  balanceSheet: null,
  licenses: [],
  loans: [],
  deposits: [],
  proposals: [],
  leaderboard: [],
  history: [],
  townDepositHistory: {},

  hydrate: ({ player, balanceSheet, licenses, loans, deposits, proposals, leaderboard, balanceHistory }) => {
    const townDepositHistory: Record<string, TownDepositSnapshot[]> = {};
    for (const d of deposits) {
      townDepositHistory[d.town_id] = [{ tick: balanceHistory.at(-1)?.tick ?? 0, balance: d.balance }];
    }
    set({
      player, balanceSheet, licenses, loans, deposits, proposals, leaderboard,
      history: balanceHistory,
      townDepositHistory,
    });
  },

  applyDelta: (delta) => {
    const playerId = get().player?.id;
    if (!playerId) return;

    set(state => {
      const update = delta.player_updates[playerId];
      const newLoans = new Map(state.loans.map(l => [l.id, l]));

      // Remove defaulted/repaid loans
      if (update) {
        for (const id of update.new_loan_default_ids) {
          const loan = newLoans.get(id);
          if (loan) newLoans.set(id, { ...loan, status: 'defaulted' });
        }
        for (const id of update.new_loan_repayment_ids) {
          const loan = newLoans.get(id);
          if (loan) newLoans.set(id, { ...loan, status: 'repaid' });
        }
      }

      // Update proposals
      const existingProposals = new Map(state.proposals.map(p => [p.id, p]));
      for (const p of delta.loan_proposal_updates.new_proposals) {
        // Only add if player is licensed in that town
        const isLicensed = state.licenses.some(l => l.town_id === p.town_id);
        if (isLicensed) existingProposals.set(p.id, p);
      }
      for (const id of delta.loan_proposal_updates.expired_proposal_ids) {
        existingProposals.delete(id);
      }

      const newBs = update?.balance_sheet ?? state.balanceSheet;
      const newHistory = newBs
        ? [
            ...state.history.slice(-(MAX_HISTORY - 1)),
            {
              tick: delta.tick,
              cash: newBs.cash,
              total_loan_book: newBs.total_loan_book,
              total_deposits_owed: newBs.total_deposits_owed,
              total_interest_accrued: newBs.total_interest_accrued,
              equity: newBs.equity,
              reserve_ratio: newBs.reserve_ratio,
            },
          ]
        : state.history;

      // Sync per-town deposit balances and accumulate history
      let newDeposits = state.deposits;
      let newTownDepositHistory = state.townDepositHistory;
      if (update?.deposit_balances) {
        newDeposits = state.deposits.map(d => ({
          ...d,
          balance: update.deposit_balances[d.town_id] ?? d.balance,
        }));
        const updatedHistory = { ...state.townDepositHistory };
        for (const [townId, balance] of Object.entries(update.deposit_balances)) {
          const prev = updatedHistory[townId] ?? [];
          updatedHistory[townId] = [
            ...prev.slice(-(MAX_HISTORY - 1)),
            { tick: delta.tick, balance },
          ];
        }
        newTownDepositHistory = updatedHistory;
      }

      return {
        balanceSheet: newBs,
        loans: Array.from(newLoans.values()),
        deposits: newDeposits,
        proposals: Array.from(existingProposals.values()),
        leaderboard: delta.leaderboard,
        history: newHistory,
        townDepositHistory: newTownDepositHistory,
      };
    });
  },

  removeProposal: (id) => set(s => ({ proposals: s.proposals.filter(p => p.id !== id) })),

  addLoan: (loan) => set(s => ({ loans: [...s.loans, loan] })),
}));
