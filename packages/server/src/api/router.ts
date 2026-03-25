import { Router } from 'express';
import type { WorldState } from '../state/world-state';
import { createAuthRouter } from './routes/auth';
import { createWorldRouter } from './routes/world';
import { createLoansRouter } from './routes/loans';
import { createDepositsRouter } from './routes/deposits';
import { createLicensesRouter } from './routes/licenses';
import { createInvestmentsRouter } from './routes/investments';
import { createLeaderboardRouter } from './routes/leaderboard';

export function createApiRouter(state: WorldState): Router {
  const router = Router();

  router.use('/auth',        createAuthRouter(state));
  router.use('/world',       createWorldRouter(state));
  router.use('/loans',       createLoansRouter(state));
  router.use('/deposits',    createDepositsRouter(state));
  router.use('/licenses',    createLicensesRouter(state));
  router.use('/investments', createInvestmentsRouter(state));
  router.use('/leaderboard', createLeaderboardRouter(state));

  return router;
}
