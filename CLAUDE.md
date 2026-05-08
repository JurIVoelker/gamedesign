# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Farmyard Duel** — 1v1 real-time PvP browser game (two farmers sabotaging each other's crops). Bun monorepo with three workspaces: `frontend`, `backend`, `shared`.

## Commands

Run from the repo root unless noted.

```bash
bun install          # install all workspace dependencies

bun dev              # start frontend (port 8080) + backend (port 3001) in parallel
bun dev:fe           # frontend only
bun dev:be           # backend only

bun build            # tsc check + vite build (frontend) + tsc --noEmit (backend)
bun --filter frontend lint   # ESLint + Prettier check
```

No test suite exists yet.

## Code style

Use double quotes for strings in TypeScript/TSX files (enforced by Prettier).

## Working style

Ask questions more than usual. When something is underspecified or involves a design choice (layout, naming, architecture, game mechanics), always ask before implementing. Use the `AskUserQuestion` tool to ask — never just plain text questions.

## Architecture

### Monorepo layout

| Package | Stack |
|---|---|
| `frontend/` | Vite + React + PixiJS + TailwindCSS |
| `backend/` | Bun.serve WebSocket server (server-authoritative) |
| `shared/` | TypeScript types only, no runtime code |

`shared` is consumed via `"@gamedesign/shared": "workspace:*"` and exports directly from source (`"main": "./src/index.ts"`). The root `tsconfig.json` sets the path alias; child configs extend it.

### WebSocket protocol

The game is server-authoritative. The only two-way flow:

```
Client                     Server
  │── hello {playerId} ──▶│  player sends UUID (stored in localStorage)
  │◀── assigned {slot} ───│  slot = "p1" | "p2"
  │◀── game_ready ─────── │  broadcast when both slots filled
  │── player_action ─────▶│  SowField | HarvestField | BuyItem | UseItem | UpgradeTool
  │◀── game_state ─────── │  server broadcasts new GameState after each action
  │◀── ping / ──pong──▶   │  heartbeat every 30s, timeout at 60s
```

All message types and type guards live in `shared/src/types/messages.ts`. Always validate with `isClientMessage` / `isServerMessage` at boundaries.

### Backend internals

- `server.ts` — Bun.serve entry, wires WebSocket handlers
- `session.ts` — wraps `ServerWebSocket` with heartbeat tracking
- `game.ts` — `GameManager` (singleton, holds `knownSlots` Map for reconnection) + `Game` (two `Slot` objects referencing `Session`s)
- `messages.ts` — routes incoming `ClientMessage` to game logic

`GameManager.knownSlots` persists slot assignments across reconnects using the client's UUID. Swap the single `Game` instance to a `Map<roomCode, Game>` when adding multi-room support.

### Frontend rendering (PixiJS)

`FarmCanvas` (React) mounts a `div` that fills the viewport and passes it to `GameEngine`. `GameEngine` owns the PixiJS `Application`:

1. `buildEntities()` — instantiates `FieldEntity` and `HouseEntity` objects with logical coordinates
2. `drawScene()` — calls `entity.render(stage: Container)` on each; entities draw themselves with PixiJS `Graphics`
3. `rescale()` — scales the scene container to fit the window with `OUTER_MARGIN` padding; re-runs on `window resize`

Layout constants (`FIELD_W/H`, `HOUSE_W/H`, gaps, margins) live in `GameEngine.ts` and the entity files. Logical scene dimensions are derived from them, so changing a constant automatically flows through to layout and scaling.

### Frontend state

Two Zustand stores:

- `connectionStore` — WebSocket lifecycle: status (`disconnected` → `connecting` → `waiting` → `in_game`), playerId, slot, send function
- `gameStore` — mirrors the `GameState` received from the server

`App.tsx` gates UI on `connectionStore.status`: `Lobby` when not in game, `HUD` when in game. `FarmCanvas` renders regardless of connection state.
