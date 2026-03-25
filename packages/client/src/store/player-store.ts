'use client';
import { create } from 'zustand';
import type {
  Player, BalanceSheet, BankingLicense, Loan, Deposit,
  LoanProposal, PlayerScore,
} from '@argentum/shared';
import type { TickDelta } from '@argentum/shared';

interface PlayerStore {
  player: Player | null;
  balanceSheet: BalanceSheet | null;
  licenses: BankingLicense[];
  loans: Loan[];
  deposits: Deposit[];
  proposals: LoanProposal[];
  leaderboard: PlayerScore[];

  // Actions
  hydrate: (data: {
    player: Player;
    balanceSheet: BalanceSheet | null;
    licenses: BankingLicense[];
    loans: Loan[];
    deposits: Deposit[];
    proposals: LoanProposal[];
    leaderboard: PlayerScore[];
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

  hydrate: ({ player, balanceSheet, licenses, loans, deposits, proposals, leaderboard }) => {
    set({ player, balanceSheet, licenses, loans, deposits, proposals, leaderboard });
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

      return {
        balanceSheet: update?.balance_sheet ?? state.balanceSheet,
        loans: Array.from(newLoans.values()),
        proposals: Array.from(existingProposals.values()),
        leaderboard: delta.leaderboard,
      };
    });
  },

  removeProposal: (id) => set(s => ({ proposals: s.proposals.filter(p => p.id !== id) })),

  addLoan: (loan) => set(s => ({ loans: [...s.loans, loan] })),
}));
