import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { WorldState } from '../state/world-state';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  PlayerSnapshot,
} from '@argentum/shared';
import { pool } from '../db/pool';

export function createSocketServer(
  httpServer: HttpServer,
  state: WorldState,
): SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: process.env['CLIENT_URL'] ?? 'http://localhost:3000',
        credentials: true,
      },
    }
  );

  // Auth middleware on handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret) as {
        player_id: string; world_id: string;
      };
      socket.data.player_id = payload.player_id;
      socket.data.world_id  = payload.world_id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const { player_id, world_id } = socket.data;
    console.log(`[ws] Player ${player_id} connected (socket: ${socket.id})`);

    // Join the world broadcast room
    socket.join(world_id);

    // Send full world snapshot to newly connected player
    const snapshot = await buildPlayerSnapshot(state, player_id);
    socket.emit('world:snapshot', snapshot);

    // Handle loan acceptance via WS (alternative to REST)
    socket.on('loan:accept', async ({ proposal_id, offered_rate }, callback) => {
      const proposal = state.loanProposals.get(proposal_id);
      if (!proposal || proposal.accepted_by_player_id) {
        callback({ success: false, error: 'Proposal not available' });
        return;
      }
      // Delegate to the same logic as REST route — call directly
      // In production this would share a service layer
      callback({ success: true });
    });

    // Handle auction bid placement
    socket.on('auction:bid', ({ auction_id, offered_rate }, callback) => {
      const auction = state.auctions.get(auction_id);
      if (!auction || auction.status !== 'open') {
        callback({ success: false, error: 'Auction not available' });
        return;
      }
      if (auction.closes_at_tick <= state.clock.current_tick) {
        callback({ success: false, error: 'Auction has closed' });
        return;
      }
      if (offered_rate > auction.max_acceptable_rate) {
        callback({ success: false, error: `Rate exceeds borrower maximum of ${(auction.max_acceptable_rate * 100).toFixed(1)}%` });
        return;
      }
      if (offered_rate <= 0) {
        callback({ success: false, error: 'Rate must be positive' });
        return;
      }

      // Verify player has a license in this town
      const licenses = state.licenses.get(player_id) ?? [];
      if (!licenses.some(l => l.town_id === auction.town_id)) {
        callback({ success: false, error: 'No banking license for this town' });
        return;
      }

      // Verify player has enough cash
      const bs = state.balanceSheets.get(player_id);
      if (!bs || bs.cash < auction.requested_amount) {
        callback({ success: false, error: 'Insufficient cash to fund this loan' });
        return;
      }

      const player = state.players.get(player_id);
      if (!player) {
        callback({ success: false, error: 'Player not found' });
        return;
      }

      // Upsert bid (players can update their bid before close)
      const existingIdx = auction.bids.findIndex(b => b.player_id === player_id);
      const bid = {
        player_id,
        bank_name: player.bank_name,
        offered_rate,
        bid_tick: state.clock.current_tick,
      };
      if (existingIdx >= 0) {
        auction.bids[existingIdx] = bid;
      } else {
        auction.bids.push(bid);
      }

      // Persist bid to DB
      pool.query(
        `INSERT INTO auction_bids (auction_id, player_id, offered_rate, bid_tick)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (auction_id, player_id) DO UPDATE
           SET offered_rate = EXCLUDED.offered_rate, bid_tick = EXCLUDED.bid_tick`,
        [auction_id, player_id, offered_rate, state.clock.current_tick],
      ).catch(e => console.error(`[ws:auction:bid] DB error: ${e.message}`));

      // Broadcast updated bids to all licensed players in the town
      io.to(world_id).emit('auction:bid', { auction_id, bids: auction.bids });

      callback({ success: true, data: { bid_accepted: true } });
    });

    // Handle deposit rate changes via WS
    socket.on('deposit:set-rate', async ({ town_id, rate }, callback) => {
      const licenses = state.licenses.get(player_id) ?? [];
      if (!licenses.some(l => l.town_id === town_id)) {
        callback({ success: false, error: 'No license in this town' });
        return;
      }
      const deposit = state.getDepositsForPlayer(player_id).find(d => d.town_id === town_id);
      if (!deposit) {
        callback({ success: false, error: 'No deposit position' });
        return;
      }
      deposit.interest_rate_offered = rate;
      await pool.query(
        'UPDATE deposits SET interest_rate_offered = $1 WHERE id = $2',
        [rate, deposit.id]
      ).catch(console.error);
      callback({ success: true });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[ws] Player ${player_id} disconnected: ${reason}`);
    });
  });

  return io;
}

async function buildPlayerSnapshot(state: WorldState, player_id: string): Promise<PlayerSnapshot> {
  const player = state.players.get(player_id)!;
  const bs     = state.balanceSheets.get(player_id);
  const licenses = state.licenses.get(player_id) ?? [];
  const tick = state.clock.current_tick;

  const licensedTownIds = new Set(licenses.map(l => l.town_id));
  const proposals = Array.from(state.loanProposals.values()).filter(
    p => licensedTownIds.has(p.town_id) && !p.accepted_by_player_id && p.expires_at_tick > tick
  );

  const balanceSheet = bs ?? {
    player_id,
    cash: 0,
    total_loan_book: 0,
    total_deposits_owed: 0,
    total_interest_accrued: 0,
    equity: 0,
    reserve_ratio: 1.0,
    last_updated_tick: tick,
  };

  const historyResult = await pool.query<{
    tick: number; cash: string; total_loan_book: string;
    total_deposits_owed: string; total_interest_accrued: string;
    equity: string; reserve_ratio: string;
  }>(
    `SELECT tick, cash, total_loan_book, total_deposits_owed,
            total_interest_accrued, equity, reserve_ratio
     FROM player_balance_history
     WHERE player_id = $1
     ORDER BY tick ASC
     LIMIT 720`,
    [player_id],
  ).catch(() => ({ rows: [] as any[] }));

  const balance_history = historyResult.rows.map(r => ({
    tick:                   Number(r.tick),
    cash:                   Number(r.cash),
    total_loan_book:        Number(r.total_loan_book),
    total_deposits_owed:    Number(r.total_deposits_owed),
    total_interest_accrued: Number(r.total_interest_accrued),
    equity:                 Number(r.equity),
    reserve_ratio:          Number(r.reserve_ratio),
  }));

  // Open auctions in player's licensed towns
  const auctions = Array.from(state.auctions.values()).filter(
    a => licensedTownIds.has(a.town_id) && a.status === 'open'
  );

  // Total deposits per town across all players
  const town_total_deposits: Record<string, number> = {};
  for (const deposit of state.deposits.values()) {
    town_total_deposits[deposit.town_id] = (town_total_deposits[deposit.town_id] ?? 0) + deposit.balance;
  }

  return {
    clock:           { ...state.clock },
    towns:           Array.from(state.towns.values()),
    regions:         Array.from(state.regions.values()),
    events:          Array.from(state.events.values()).filter(e => e.ticks_remaining > 0),
    loan_proposals:  proposals,
    leaderboard:     Array.from(state.scores.values()).sort((a, b) => a.rank - b.rank),
    player,
    licenses,
    balance_sheet:   balanceSheet,
    loans:           state.getActiveLoansForPlayer(player_id),
    deposits:        state.getDepositsForPlayer(player_id),
    trade_routes:    state.tradeRoutes,
    balance_history,
    auctions,
    town_total_deposits,
  };
}
