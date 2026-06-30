# Farmyard Duel

A 1v1 real-time PvP browser game — two farmers on neighboring farms racing to earn gold while sabotaging each other's crops.

## How to play

Each match lasts **8 minutes**. Both players start with 150 gold. The player with the most gold when time runs out wins.

**Core loop**

1. **Sow** a field to plant crops (takes a few seconds)
2. Wait ~60 seconds for crops to **grow**
3. **Harvest** to collect 40 gold
4. Spend gold on upgrades and sabotage

**Upgrades** (your own farm)

| Upgrade | Effect |
|---|---|
| Tools | Faster sow & harvest actions |
| Fertilizer | Faster crop growth + more gold per harvest |

**Sabotage** (opponent's farm)

| Tool | Effect |
|---|---|
| Crows | Land on opponent fields and eat crop progress — chase them away to stop them |
| Thief | Sneaks onto the opponent's farm disguised as a villager and steals gold over time |
| Weather | Slows the opponent's crop growth and actions; higher levels add lightning strikes |

**Merchant visits** — a traveling merchant drops by ~3 times per match offering 3 random items for gold. Items range from useful (Crystal Ball, Spy Glass) to chaotic (Halving Brew, Swap Potion, Fake Merchant).

## Quick start

**Prerequisite:** [Bun](https://bun.sh) — install with `curl -fsSL https://bun.sh/install | bash` (Mac/Linux) or `powershell -c "irm bun.sh/install.ps1 | iex"` (Windows).

```bash
git clone <repo-url>
cd gamedesign
bun install
bun dev
```

Then open **http://localhost:8080** in your browser.

### Playing with a friend (local)

1. Open two browser tabs at http://localhost:8080
2. Tab 1: click **Create Room**, note the 5-letter code
3. Tab 2: enter the code, click **Join Room**
4. Both tabs should show "Opponent connected" — the match starts automatically

### Playing solo (vs bot)

Complete the tutorial stages first (accessible from the lobby). Once all stages are done, a **Testspiel gegen Bot** button unlocks — click it to play a full match against the computer.

## Development

```bash
bun install          # install all workspace dependencies
bun dev              # start frontend (port 8080) + backend (port 3001) in parallel
bun dev:fe           # frontend only
bun dev:be           # backend only
bun run build        # type-check + production build
```

### Project structure

```
gamedesign/
├── frontend/   Vite + React + PixiJS + TailwindCSS
├── backend/    Bun.serve WebSocket server (server-authoritative)
└── shared/     TypeScript types & constants shared by both sides
```
