import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate, AcceptLoanSchema } from '../middleware/validate';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';
import type { Loan } from '@argentum/shared';
import { calcDefaultProbabilityPerTick } from '@argentum/shared';

export function createLoansRouter(state: WorldState) {
  const router = Router();

  // GET /loans/queue — all proposals for player's licensed towns
  router.get('/queue', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const licenses = state.licenses.get(player_id) ?? [];
    const licensedTownIds = new Set(licenses.map(l => l.town_id));
    const tick = state.clock.current_tick;

    const proposals = Array.from(state.loanProposals.values()).filter(
      p =>
        licensedTownIds.has(p.town_id) &&
        !p.accepted_by_player_id &&
        p.expires_at_tick > tick
    );

    // Enrich proposals with town and risk context
    const enriched = proposals.map(p => {
      const town = state.towns.get(p.town_id);
      const region = state.getRegionForTown(p.town_id);
      const activeEvents = state.getActiveEventsForTown(p.town_id);
      return {
        ...p,
        town_name: town?.name,
        region_name: region?.name,
        active_events: activeEvents.map(e => ({
          type: e.event_type,
          description: e.description,
          ticks_remaining: e.ticks_remaining,
        })),
        region_risk: region?.base_risk_modifier,
      };
    });

    res.json(enriched);
  });

  // GET /loans/active — player's active loans
  router.get('/active', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const loans = state.getActiveLoansForPlayer(player_id);
    res.json(loans);
  });

  // POST /loans/:proposalId/accept
  router.post('/:proposalId/accept', authMiddleware, validate(AcceptLoanSchema), async (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const { proposalId } = req.params;
    const { offered_rate } = req.body;

    const proposal = state.loanProposals.get(proposalId!);
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found or expired' });
      return;
    }
    if (proposal.accepted_by_player_id) {
      res.status(409).json({ error: 'Proposal already accepted' });
      return;
    }
    if (proposal.expires_at_tick <= state.clock.current_tick) {
      res.status(410).json({ error: 'Proposal has expired' });
      return;
    }

    // Verify player has a license in this town
    const licenses = state.licenses.get(player_id) ?? [];
    if (!licenses.some(l => l.town_id === proposal.town_id)) {
      res.status(403).json({ error: 'No banking license for this town' });
      return;
    }

    // Verify player can afford to fund the loan from cash
    const bs = state.balanceSheets.get(player_id);
    if (!bs) {
      res.status(500).json({ error: 'Balance sheet not found' });
      return;
    }

    if (bs.cash < proposal.requested_amount) {
      res.status(422).json({
        error: 'Insufficient cash',
        available: bs.cash,
        required: proposal.requested_amount,
      });
      return;
    }

    // Verify rate is within borrower's acceptable range
    if (offered_rate > proposal.max_acceptable_rate) {
      res.status(422).json({
        error: 'Offered rate exceeds borrower\'s maximum',
        max_acceptable_rate: proposal.max_acceptable_rate,
      });
      return;
    }

    const tick = state.clock.current_tick;
    const loanId = uuidv4();

    const region = state.getRegionForTown(proposal.town_id);
    const activeEvents = state.getActiveEventsForTown(proposal.town_id);

    const loanData: Loan = {
      id: loanId,
      player_id,
      town_id: proposal.town_id,
      borrower_name: proposal.borrower_name,
      borrower_type: proposal.borrower_type,
      principal: proposal.requested_amount,
      outstanding_balance: proposal.requested_amount,
      interest_rate: offered_rate,
      term_ticks: proposal.term_ticks,
      ticks_elapsed: 0,
      status: 'active',
      default_probability_per_tick: calcDefaultProbabilityPerTick(
        { borrower_type: proposal.borrower_type, ticks_elapsed: 0, term_ticks: proposal.term_ticks, interest_rate: offered_rate },
        region?.base_risk_modifier ?? 1.0,
        activeEvents,
      ),
      collateral_value: proposal.collateral_value,
      partial_recovery_rate: proposal.partial_recovery_rate,
      created_at_tick: tick,
    };

    try {
      await pool.query(
        `INSERT INTO loans
           (id, player_id, town_id, borrower_name, borrower_type, principal,
            outstanding_balance, interest_rate, term_ticks, ticks_elapsed, status,
            default_probability_per_tick, collateral_value, partial_recovery_rate, created_at_tick)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          loanId, player_id, proposal.town_id, proposal.borrower_name, proposal.borrower_type,
          proposal.requested_amount, proposal.requested_amount, offered_rate, proposal.term_ticks,
          0, 'active', loanData.default_probability_per_tick,
          proposal.collateral_value, proposal.partial_recovery_rate, tick,
        ]
      );

      // Mark proposal as accepted
      await pool.query(
        'UPDATE loan_proposals SET accepted_by_player_id = $1, accepted_at_tick = $2 WHERE id = $3',
        [player_id, tick, proposalId]
      );

      // Deduct cash
      bs.cash -= proposal.requested_amount;
      await pool.query(
        'UPDATE balance_sheets SET cash = $1 WHERE player_id = $2',
        [bs.cash, player_id]
      );

      // Update hot state
      proposal.accepted_by_player_id = player_id;
      proposal.accepted_at_tick = tick;
      state.loanProposals.delete(proposalId!);
      state.addLoan(loanData);

      res.status(201).json({ loan_id: loanId, outstanding_balance: loanData.outstanding_balance });
    } catch (err) {
      console.error('[loans/accept]', err);
      res.status(500).json({ error: 'Failed to accept loan' });
    }
  });

  // POST /loans/:proposalId/reject
  router.post('/:proposalId/reject', authMiddleware, async (req, res) => {
    const proposalId = req.params['proposalId'];
    const proposal = state.loanProposals.get(proposalId!);

    if (!proposal || proposal.accepted_by_player_id) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    // Just remove from the proposal queue — it will also expire naturally
    state.loanProposals.delete(proposalId!);
    res.json({ success: true });
  });

  return router;
}
