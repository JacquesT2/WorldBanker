import type { WorldState } from '../state/world-state';

export interface BankruptcyEvent {
  player_id: string;
  bank_name: string;
  tick: number;
}

/**
 * Step 9: Check for bankruptcy conditions.
 * A player is bankrupt when equity ≤ 0.
 * On bankruptcy: mark player, zero out their positions.
 */
export function checkBankruptcy(state: WorldState): BankruptcyEvent[] {
  const bankruptcies: BankruptcyEvent[] = [];
  const tick = state.clock.current_tick;

  for (const player of state.players.values()) {
    if (player.is_bankrupt) continue;

    const bs = state.balanceSheets.get(player.id);
    if (!bs) continue;

    if (bs.equity <= 0) {
      player.is_bankrupt = true;
      player.bankruptcy_tick = tick;
      player.reputation = 0;

      console.log(`[bankruptcy] ${player.bank_name} (${player.username}) has gone bankrupt at tick ${tick}`);

      // Default all remaining active loans (depositors take the loss)
      const activeLoans = state.getActiveLoansForPlayer(player.id);
      for (const loan of activeLoans) {
        loan.status = 'written_off';
        loan.defaulted_at_tick = tick;
      }

      // Set balance sheet to zero
      bs.cash = 0;
      bs.total_loan_book = 0;
      bs.total_deposits_owed = 0;
      bs.total_interest_accrued = 0;
      bs.equity = 0;
      bs.reserve_ratio = 0;

      bankruptcies.push({
        player_id: player.id,
        bank_name: player.bank_name,
        tick,
      });
    }
  }

  return bankruptcies;
}
