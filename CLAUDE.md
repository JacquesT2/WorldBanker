# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Argentum** is a real-time multiplayer medieval banking simulation game. Players compete as bankers in a fantasy world, managing loans, deposits, licenses, and infrastructure investments across towns and regions.

## Commands

### Setup
```bash
docker compose up -d          # Start PostgreSQL (port 5433)
npm install                   # Install all workspace dependencies
npm run db:migrate            # Run database migrations
npm run db:seed               # Seed initial world data
```

### Development
```bash
npm run dev:server            # Start server with hot reload (port 3001)
npm run dev:client            # Start Next.js frontend (port 3000)
```

### Build
```bash
npm run build                 # Build all packages
```

### Testing
```bash
npm run test                                              # Run all tests
npm run test --workspace=@argentum/shared                # Test specific package
npm run test --workspace=@argentum/server -- --testPathPattern=loan  # Single test file
```

### Linting
```bash
npm run lint --workspace=@argentum/client                # Lint client (Next.js ESLint)
```

## Architecture

### Monorepo Structure
Three npm workspaces in `packages/`:
- **@argentum/shared** — Types, constants, and formulas consumed by both client and server
- **@argentum/server** — Express + socket.io game server with tick-based engine
- **@argentum/client** — Next.js 14 frontend with Zustand state management

### Game Engine (server)
The core is a **5-second tick loop** in `packages/server/src/engine/tick-engine.ts` that runs 11 sequential steps:
1. World clock advancement
2. Event rolling (random world events)
3. Economy update
4. Population update
5. Loan processing
6. Deposit processing
7. Infrastructure processing
8. Balance sheet update
9. Bankruptcy check
10. Leaderboard update
11. Delta broadcasting (push changes to clients via socket.io)

Each step is error-isolated so one failure doesn't halt the engine.

### State Model
All hot game data lives in **in-memory `WorldState`** (`packages/server/src/state/world-state.ts`), loaded from PostgreSQL at startup. DB writes are fire-and-forget snapshots after each tick — they do not block the game loop.

### Real-time Updates
The server computes a `TickDelta` each tick (only changed fields) and broadcasts it via socket.io. The client's Zustand stores (`player-store`, `world-store`) merge incoming deltas into local state.

### Shared Package
`@argentum/shared` exports:
- **types/** — `world.ts`, `player.ts`, `banking.ts`, `tick.ts`, `socket.ts`
- **constants/** — `game.ts` (tick rate, starting cash, scoring weights), `economics.ts`
- **formulas/** — Pure functions for GDP, deposit flow, loan default probability, scoring, licensing, population
- **world-data/** — Static town, region, and trade route definitions

### Database
PostgreSQL with a custom migration runner. Migrations are numbered SQL files in `packages/server/src/db/migrations/` (001–008), covering worlds, regions, towns, trade routes, players, banking tables, events/clock, tick logs, and proposals/scores.

**Connection:** `DATABASE_URL=postgresql://argentum:argentum_dev@localhost:5433/argentum`

### Client Routing
Next.js App Router with two layout zones:
- `/login` — Unauthenticated
- `/(game)/` — Protected; layout sets up socket.io connection and stores

API calls go through `packages/client/src/lib/api.ts` (typed fetch wrapper with JWT injection). Socket.io client is initialized in `packages/client/src/lib/socket.ts`.

### Authentication
JWT Bearer tokens. Server validates via middleware; client stores token and injects it on every request.

## Game Time
- 1 tick = 5 seconds real time
- 90 ticks = 1 season
- 4 seasons = 1 game year (360 ticks ≈ 30 minutes real time)

## Environment
Copy `packages/server/.env.example` to `packages/server/.env` before running the server. `JWT_SECRET` must be at least 32 characters.
