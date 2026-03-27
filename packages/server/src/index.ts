import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { pool, checkDbConnection } from './db/pool';
import { loadWorldState } from './state/state-loader';
import { createApiRouter } from './api/router';
import { createSocketServer } from './socket/socket-server';
import { TickEngine } from './engine/tick-engine';
import { seedBots } from './db/seeds/seed-bots';

async function main(): Promise<void> {
  console.log('[server] Starting Argentum Game Server...');

  // Verify DB connection
  await checkDbConnection();

  // Load world state into memory
  const state = await loadWorldState(pool);

  // Create bot players for all strategy profiles (skips existing bots)
  await seedBots(pool, state);

  // Create Express app
  const app = express();
  app.use(cors({
    origin: process.env['CLIENT_URL'] ?? 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      tick: state.clock.current_tick,
      season: state.clock.current_season,
      year: state.clock.current_year,
      players: state.players.size,
    });
  });

  // REST API
  app.use('/api', createApiRouter(state));

  // HTTP server
  const httpServer = http.createServer(app);

  // WebSocket server
  const io = createSocketServer(httpServer, state);

  // Tick engine
  const engine = new TickEngine(state, pool);
  engine.attachSocket(io);
  engine.start();

  // Start listening
  httpServer.listen(config.serverPort, () => {
    console.log(`[server] Listening on port ${config.serverPort}`);
    console.log(`[server] World: "${state.worldName}" | Tick: ${state.clock.current_tick}`);
    console.log(`[server] Players: ${state.players.size} | Towns: ${state.towns.size}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received — shutting down gracefully`);
    await engine.shutdown();
    httpServer.close();
    await pool.end();
    console.log('[server] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[server] Fatal startup error:', err.message);
  process.exit(1);
});
