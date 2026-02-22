# Procedural Crime Investigation

A **dim-lit, atmospheric, multiplayer co-op** crime investigation game built with TypeScript, PixiJS, and WebSockets.

1–4 players share a procedurally generated case: explore evidence on a virtual corkboard, connect clues with red string, interview suspects, and make an accusation before dawn.

---

## Quick Start

```bash
# 1. Install everything
npm run install:all

# 2. Start dev servers (server + client concurrently)
npm run dev
```

| Service | URL |
|---------|-----|
| Client (Vite) | http://localhost:3000 |
| Server (Express + WS) | http://localhost:4000 |

The client dev server proxies `/api` requests to the server automatically.

---

## Environment Variables

Copy `server/.env` and fill in optional API keys:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default `4000`) | Server listen port |
| `PEXELS_API_KEY` | No | [Pexels](https://www.pexels.com/api/) key for location images |
| `UNSPLASH_API_KEY` | No | [Unsplash](https://unsplash.com/developers) key for location images |

Without API keys the game still works — it falls back to [DiceBear](https://www.dicebear.com/) avatars for portraits and uses gradient colour fills for locations.

---

## Architecture

```
root/
├── server/           # Node.js + Express + ws
│   └── src/
│       ├── case/         Deterministic procedural case generator
│       ├── chat/         In-memory chat manager
│       ├── daily/        Daily seed (YYYY-MM-DD based)
│       ├── game/         Authoritative game state manager
│       ├── images/       Pluggable image provider (Pexels / Unsplash / DiceBear)
│       ├── lobby/        Lobby CRUD + host transfer
│       ├── network/      WebSocket message router
│       └── utils/        Shared types, helpers, zod schemas
│
├── client/           # Vite + TypeScript + PixiJS
│   ├── public/audio/     Audio placeholder dirs (add your own .mp3 files)
│   └── src/
│       ├── board/        PixiJS corkboard + Verlet rope physics
│       ├── core/         Audio, scene manager, game store
│       ├── network/      WebSocket client + HTTP fetchers
│       ├── scenes/       UI scenes (menu, play, lobby, game, settings, …)
│       ├── timeline/     Timeline panel
│       ├── tutorial/     10-step interactive tutorial
│       └── ui/           Toast, helpers, pause menu
│
└── package.json      # Root workspace scripts
```

### Key Design Decisions

- **Server-authoritative**: All game mutations flow through the server. The client sends operations; the server validates, applies, and broadcasts the result.
- **Deterministic case generation**: Cases are seeded (via `seedrandom`). The same seed always produces the same case — this powers the **Daily Case** feature.
- **Scene-based navigation**: The client uses a simple scene stack (no framework router). Each scene creates/destroys its own DOM.
- **Verlet rope physics**: Red strings on the corkboard are simulated with a Verlet integration rope (12 segments, gravity, constraint solving) rendered via PixiJS `Graphics`.

---

## Daily Seed

The daily seed is simply `daily-YYYY-MM-DD` using the server's UTC date. Every player who starts a "Daily Case" on the same calendar day gets the same procedurally generated mystery.

---

## Audio

The game references `.mp3` files in `client/public/audio/`. Directories are created with README files listing the expected filenames:

- **Music** (`/audio/music/`): `menu.mp3`, `investigation.mp3`, `interview.mp3`, `cinematic.mp3`
- **SFX** (`/audio/sfx/`): `pin_drop.mp3`, `rope_attach.mp3`, `ui_click.mp3`, `ui_hover.mp3`, `evidence_glow.mp3`, `chat_message.mp3`, `transition.mp3`

Missing files are caught silently — the game runs fine without them.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both server & client concurrently |
| `npm run dev:server` | Start server in watch mode (`tsx watch`) |
| `npm run dev:client` | Start Vite dev server |
| `npm run install:all` | Install deps in root, server, and client |

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Server**: Express, ws, zod, seedrandom, @faker-js/faker, nanoid
- **Client**: Vite, TypeScript, PixiJS v7
- **Fonts**: Playfair Display, Source Sans 3 (Google Fonts, loaded via CSS)

---

## License

MIT
