# Farmyard Duel

1v1 real-time PvP browser game — two farmers on neighboring farms who can sabotage each other.

## Folder layout

```
gamedesign/
├── frontend/   Vite + React + PixiJS + TailwindCSS
├── backend/    Bun.serve WebSocket server (server-authoritative)
└── shared/     TypeScript types shared by both sides
```

## Dev

```bash
bun install       # install all workspaces from repo root
bun dev           # start frontend (port 8080) + backend (port 3001) in parallel
```

Individual:
```bash
bun dev:fe        # frontend only
bun dev:be        # backend only
```

## Verification

1. `bun install` from root — all workspaces install
2. `bun dev` — both servers start
3. Open two browser tabs at http://localhost:8080
4. Tab 1: click **Create Room**, note the 5-letter code
5. Tab 2: enter code, click **Join Room**
6. Both tabs should show "Opponent connected"
7. The PixiJS canvas with 4 placeholder farm tiles renders in both tabs
8. Close one tab — the other shows "Opponent disconnected"
