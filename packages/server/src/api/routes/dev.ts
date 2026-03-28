import { Router } from 'express';
import type { TickEngine } from '../../engine/tick-engine';

/**
 * Dev-only routes for game control. Not protected by auth — only mount in development.
 */
export function createDevRouter(engine: TickEngine): Router {
  const router = Router();

  // GET /dev/status
  router.get('/status', (_req, res) => {
    res.json(engine.getStatus());
  });

  // POST /dev/pause
  router.post('/pause', (_req, res) => {
    engine.pause();
    res.json(engine.getStatus());
  });

  // POST /dev/resume
  router.post('/resume', (_req, res) => {
    engine.resume();
    res.json(engine.getStatus());
  });

  // POST /dev/set-speed  { multiplier: number }
  router.post('/set-speed', (req, res) => {
    const multiplier = Number(req.body?.multiplier);
    if (!multiplier || multiplier <= 0 || multiplier > 100) {
      res.status(400).json({ error: 'multiplier must be between 0.1 and 100' });
      return;
    }
    engine.setSpeed(multiplier);
    res.json(engine.getStatus());
  });

  // POST /dev/reset
  router.post('/reset', async (_req, res) => {
    try {
      await engine.resetGame();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
