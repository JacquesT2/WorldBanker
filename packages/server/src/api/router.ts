import { Router } from 'express';
import type { WorldState } from '../state/world-state';
import type { TickEngine } from '../engine/tick-engine';
import { createAuthRouter } from './routes/auth';
import { createWorldRouter } from './routes/world';
import { createLoansRouter } from './routes/loans';
import { createDepositsRouter } from './routes/deposits';
import { createLicensesRouter } from './routes/licenses';
import { createCompaniesRouter } from './routes/companies';
import { createLeaderboardRouter } from './routes/leaderboard';
import { createDevRouter } from './routes/dev';
import { createAutoBidRouter } from './routes/auto-bid';

export function createApiRouter(state: WorldState, engine: TickEngine): Router {
  const router = Router();

  router.use('/auth',        createAuthRouter(state));
  router.use('/world',       createWorldRouter(state));
  router.use('/loans',       createLoansRouter(state));
  router.use('/deposits',    createDepositsRouter(state));
  router.use('/licenses',    createLicensesRouter(state));
  router.use('/companies',   createCompaniesRouter(state));
  router.use('/leaderboard', createLeaderboardRouter(state));
  router.use('/dev',         createDevRouter(engine));
  router.use('/auto-bid',   createAutoBidRouter(state));

  return router;
}
