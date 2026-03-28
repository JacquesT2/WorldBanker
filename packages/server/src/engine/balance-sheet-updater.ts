import type { WorldState } from '../state/world-state';
import { MIN_RESERVE_RATIO } from '@argentum/shared';
import { pool } from '../db/pool';

/**
 * Step 8: Recompute balance sheet aggregates for all players.
 * Derives total_loan_book, total_deposits_owed, equity, and reserve_ratio
 * from the current state of loans and deposits.
 * Derives total_loan_book, total_deposits_owed, equity, and reserve_ratio.
 */
export function updateBalanceSheets(state: WorldState): void {
  const tick = state.clock.current_tick;

  for (const player of state.players.values()) {
    if (player.is_bankrupt) continue;

    const bs = state.balanceSheets.get(player.id);
    if (!bs) continue;

    // Total loan book: sum of outstanding active loan balances
    const activeLoans = state.getActiveLoansForPlayer(player.id);
    bs.total_loan_book = activeLoans.reduce((acc, l) => acc + l.outstanding_balance, 0);

    // Total deposits owed: sum of all deposit balances
    const deposits = state.getDepositsForPlayer(player.id);
    bs.total_deposits_owed = deposits.reduce((acc, d) => acc + d.balance, 0);

    // Equity: assets - liabilities
    const totalAssets     = bs.cash + bs.total_loan_book;
    const totalLiabilities = bs.total_deposits_owed + bs.total_interest_accrued;
    bs.equity = totalAssets - totalLiabilities;

    // Reserve ratio: cash / deposits (1.0 if no deposits)
    bs.reserve_ratio = bs.total_deposits_owed > 0
      ? bs.cash / bs.total_deposits_owed
      : 1.0;

    bs.last_updated_tick = tick;

    if (bs.total_deposits_owed > 0 && bs.reserve_ratio < MIN_RESERVE_RATIO * 1.2) {
      console.warn(`[balance-sheet] Player ${player.username} reserve ratio critical: ${(bs.reserve_ratio * 100).toFixed(1)}%`);
    }
  }

  persistHistory(state);
}

function persistHistory(state: WorldState): void {
  const tick = state.clock.current_tick;
  const rows: Array<[string, string, number, number, number, number, number, number, number]> = [];

  for (const player of state.players.values()) {
    if (player.is_bankrupt) continue;
    const bs = state.balanceSheets.get(player.id);
    if (!bs) continue;
    rows.push([
      player.id, state.worldId, tick,
      bs.cash, bs.total_loan_book, bs.total_deposits_owed,
      bs.total_interest_accrued, bs.equity, bs.reserve_ratio,
    ]);
  }

  if (rows.length === 0) return;

  const values = rows.map((_, i) => {
    const base = i * 9;
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`;
  }).join(',');

  pool.query(
    `INSERT INTO player_balance_history
       (player_id,world_id,tick,cash,total_loan_book,total_deposits_owed,total_interest_accrued,equity,reserve_ratio)
     VALUES ${values}
     ON CONFLICT (player_id, tick) DO NOTHING`,
    rows.flat(),
  ).catch(err => console.error('[balance-sheet] history write failed:', err));
}
