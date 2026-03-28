import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate, AcceptLoanSchema } from '../middleware/validate';
import { pool } from '../../db/pool';
import type { WorldState } from '../../state/world-state';
import type { Loan } from '@argentum/shared';

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

    const enriched = proposals.map(p => {
      const town = state.towns.get(p.town_id);
      const region = state.getRegionForTown(p.town_id);
      const activeEvents = state.getActiveEventsForTown(p.town_id);
      const company = state.companies.get(p.company_id);
      const relation = state.getRelation(p.company_id, player_id);
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
        company_status: company?.status,
        company_equity: company?.equity,
        relation_score: relation.score,
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

    const licenses = state.licenses.get(player_id) ?? [];
    if (!licenses.some(l => l.town_id === proposal.town_id)) {
      res.status(403).json({ error: 'No banking license for this town' });
      return;
    }

    const bs = state.balanceSheets.get(player_id);
    if (!bs) {
      res.status(500).json({ error: 'Balance sheet not found' });
      return;
    }

    if (bs.cash < proposal.requested_amount) {
      res.status(422).json({ error: 'Insufficient cash', available: bs.cash, required: proposal.requested_amount });
      return;
    }

    if (offered_rate > proposal.max_acceptable_rate) {
      res.status(422).json({ error: 'Offered rate exceeds borrower\'s maximum', max_acceptable_rate: proposal.max_acceptable_rate });
      return;
    }

    const tick = state.clock.current_tick;
    const loanId = uuidv4();
    const company = state.companies.get(proposal.company_id);

    const loanData: Loan = {
      id: loanId,
      player_id,
      town_id: proposal.town_id,
      company_id: proposal.company_id,
      borrower_name: proposal.borrower_name,
      company_type: proposal.company_type,
      principal: proposal.requested_amount,
      outstanding_balance: proposal.requested_amount,
      interest_rate: offered_rate,
      term_ticks: proposal.term_ticks,
      ticks_elapsed: 0,
      status: 'active',
      default_probability_per_tick: company?.base_default_probability ?? 0.001,
      collateral_value: proposal.collateral_value,
      partial_recovery_rate: proposal.partial_recovery_rate,
      created_at_tick: tick,
    };

    try {
      await pool.query(
        `INSERT INTO loans
           (id, player_id, town_id, company_id, borrower_name, company_type, principal,
            outstanding_balance, interest_rate, term_ticks, ticks_elapsed, status,
            default_probability_per_tick, collateral_value, partial_recovery_rate, created_at_tick)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          loanId, player_id, proposal.town_id,
          proposal.company_id, proposal.borrower_name, proposal.company_type,
          proposal.requested_amount, proposal.requested_amount, offered_rate, proposal.term_ticks,
          0, 'active', loanData.default_probability_per_tick,
          proposal.collateral_value, proposal.partial_recovery_rate, tick,
        ]
      );

      await pool.query(
        'UPDATE loan_proposals SET accepted_by_player_id = $1, accepted_at_tick = $2 WHERE id = $3',
        [player_id, tick, proposalId]
      );

      bs.cash -= proposal.requested_amount;
      await pool.query('UPDATE balance_sheets SET cash = $1 WHERE player_id = $2', [bs.cash, player_id]);

      // Update company debt and relation
      if (company) {
        company.total_debt += proposal.requested_amount;
        const rel = state.getRelation(company.id, player_id);
        state.setRelation({
          ...rel,
          score: Math.min(100, rel.score + 5),
          last_interaction_tick: tick,
        });
      }

      proposal.accepted_by_player_id = player_id;
      proposal.accepted_at_tick = tick;
      state.loanProposals.delete(proposalId!);
      state.addLoan(loanData);

      res.status(201).json({ loan_id: loanId, loan: loanData });
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

    state.loanProposals.delete(proposalId!);
    res.json({ success: true });
  });

  return router;
}
