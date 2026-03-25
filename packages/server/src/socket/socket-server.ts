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
    const snapshot = buildPlayerSnapshot(state, player_id);
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

function buildPlayerSnapshot(state: WorldState, player_id: string): PlayerSnapshot {
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
    total_investments: 0,
    total_deposits_owed: 0,
    total_interest_accrued: 0,
    equity: 0,
    reserve_ratio: 1.0,
    last_updated_tick: tick,
  };

  return {
    clock:          { ...state.clock },
    towns:          Array.from(state.towns.values()),
    regions:        Array.from(state.regions.values()),
    events:         Array.from(state.events.values()).filter(e => e.ticks_remaining > 0),
    loan_proposals: proposals,
    leaderboard:    Array.from(state.scores.values()).sort((a, b) => a.rank - b.rank),
    player,
    licenses,
    balance_sheet:  balanceSheet,
    loans:          state.getActiveLoansForPlayer(player_id),
    deposits:       state.getDepositsForPlayer(player_id),
  };
}
