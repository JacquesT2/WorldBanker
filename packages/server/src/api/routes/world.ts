import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { WorldState } from '../../state/world-state';

export function createWorldRouter(state: WorldState) {
  const router = Router();

  // GET /world/state — full snapshot for the authenticated player
  router.get('/state', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;

    const player = state.players.get(player_id);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const bs = state.balanceSheets.get(player_id);
    const licenses = state.licenses.get(player_id) ?? [];

    // Active loan proposals for towns this player is licensed in
    const licensedTownIds = new Set(licenses.map(l => l.town_id));
    const proposals = Array.from(state.loanProposals.values()).filter(
      p =>
        licensedTownIds.has(p.town_id) &&
        !p.accepted_by_player_id &&
        p.expires_at_tick > state.clock.current_tick
    );

    res.json({
      clock: state.clock,
      towns: Array.from(state.towns.values()),
      regions: Array.from(state.regions.values()),
      events: Array.from(state.events.values()).filter(e => e.ticks_remaining > 0),
      loan_proposals: proposals,
      leaderboard: Array.from(state.scores.values()).sort((a, b) => a.rank - b.rank),
      player,
      balance_sheet: bs,
      licenses,
      loans: state.getActiveLoansForPlayer(player_id),
      deposits: state.getDepositsForPlayer(player_id),
    });
  });

  // GET /world/regions
  router.get('/regions', authMiddleware, (_req, res) => {
    res.json(Array.from(state.regions.values()));
  });

  // GET /world/towns
  router.get('/towns', authMiddleware, (_req, res) => {
    res.json(Array.from(state.towns.values()));
  });

  // GET /world/towns/:townId
  router.get('/towns/:townId', authMiddleware, (req, res) => {
    const town = state.towns.get(req.params['townId']!);
    if (!town) {
      res.status(404).json({ error: 'Town not found' });
      return;
    }

    const { player_id } = (req as AuthenticatedRequest).auth;
    const events = state.getActiveEventsForTown(town.id);
    const competingBanks = state.getLicensedPlayers(town.id).map(pid => {
      const p = state.players.get(pid)!;
      const dep = state.getDepositsForPlayer(pid).find(d => d.town_id === town.id);
      return {
        player_id: pid,
        bank_name: p.bank_name,
        reputation: p.reputation,
        deposit_rate: dep?.interest_rate_offered ?? 0,
        deposit_balance: pid === player_id ? dep?.balance : undefined,
        is_you: pid === player_id,
      };
    });

    const region = state.getRegionForTown(town.id);
    const proposals = state.getProposalsForTown(town.id, state.clock.current_tick);

    res.json({ town, region, events, competing_banks: competingBanks, proposals });
  });

  return router;
}
