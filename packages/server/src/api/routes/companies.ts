import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import type { WorldState } from '../../state/world-state';

/**
 * /companies — read-only views of company entities for the client.
 * Players interact with companies through loans and relations; this API
 * surfaces the information they need to make lending decisions.
 */
export function createCompaniesRouter(state: WorldState) {
  const router = Router();

  // GET /companies — all non-bankrupt companies in the player's licensed towns
  router.get('/', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const licenses = state.licenses.get(player_id) ?? [];
    const licensedTownIds = new Set(licenses.map(l => l.town_id));

    const companies = Array.from(state.companies.values())
      .filter(c => licensedTownIds.has(c.town_id) && c.status !== 'bankrupt')
      .map(c => {
        const relation = state.getRelation(c.id, player_id);
        return { ...c, relation_score: relation.score };
      });

    res.json(companies);
  });

  // GET /companies/:id — single company with full detail
  router.get('/:id', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const company = state.companies.get(req.params['id']!);
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const assets = Array.from(state.companyAssets.values())
      .filter(a => a.company_id === company.id);
    const relation = state.getRelation(company.id, player_id);
    const activeLoans = Array.from(state.loans.values())
      .filter(l => l.company_id === company.id && l.player_id === player_id && l.status === 'active');

    res.json({
      ...company,
      assets,
      relation_score: relation.score,
      active_loans_with_player: activeLoans.length,
      total_borrowed_from_player: activeLoans.reduce((s, l) => s + l.outstanding_balance, 0),
    });
  });

  // GET /companies/town/:townId — all companies in a specific town
  router.get('/town/:townId', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const townId = req.params['townId']!;

    const companies = state.getActiveCompaniesForTown(townId).map(c => {
      const relation = state.getRelation(c.id, player_id);
      return { ...c, relation_score: relation.score };
    });

    res.json(companies);
  });

  // GET /companies/orphaned-assets — assets with no owner (bankruptcy remnants)
  router.get('/assets/orphaned', authMiddleware, (req, res) => {
    const { player_id } = (req as AuthenticatedRequest).auth;
    const licenses = state.licenses.get(player_id) ?? [];
    const licensedTownIds = new Set(licenses.map(l => l.town_id));

    const orphaned = Array.from(state.companyAssets.values())
      .filter(a => a.company_id === null && licensedTownIds.has(a.town_id));

    res.json(orphaned);
  });

  return router;
}
