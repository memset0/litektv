# litektv-backend

Realtime room/queue/danmaku backend for [litektv](../). Implements the surface captured in the OpenSpec capabilities under [`openspec/specs/`](../../openspec/specs/) — primarily `room-state-sync`, `link-parser`, `room-persistence`, and `room-routing`:

- `POST /api/parse-link` — resolve YouTube / Bilibili URLs (incl. `b23.tv` redirects) and fetch metadata.
- `GET /api/thumb?source&id` — 302 redirect to a source thumbnail.
- `GET /api/health` — liveness probe.
- `WS /ws?room=<slug>` — per-room state sync (queue, current track, history, presence, danmaku).

Playback position is **not** synced — the server only tracks *which* track is current. See spec §4 and §5.

## Stack

- Node.js ≥ 20, TypeScript, pnpm
- `express` for REST, `ws` for WebSocket, `zod` for input validation

## Develop

Run from the repo root, not from this directory:

```bash
pnpm install      # workspace install (covers backend + frontend)
pnpm dev          # NODE_ENV=development; embeds Vite middleware on port 38117
```

In dev the same Node process serves REST (`/api/*`), WebSocket (`/ws`), AND the Vite-transformed SPA on port 38117. Edit `packages/frontend/src/*.tsx` and HMR fires in connected browsers — no full reload, room state preserved.

Environment variables:

| Name | Default | Notes |
|------|---------|-------|
| `PORT` | `38117` | HTTP port (REST + WS + SPA share it) |
| `HOST` | `127.0.0.1` | Bind host |
| `NODE_ENV` | (unset → prod) | Set to `development` to embed Vite middleware. Anything else serves `STATIC_DIR` as built static assets. |
| `STATIC_DIR` | (unset) | Prod-only: directory of the Vite build output, typically `../frontend/dist`. |
| `DB_PATH` | `./data/litektv.db` | SQLite database file path. In production it points at the repo's `backend/data/` (kept out of `packages/`). |
| `ROOM_TTL_MS` | `86400000` | GC idle rooms after this (24h) |

## Build & run (prod)

```bash
pnpm build                                    # builds frontend (vite) and backend (tsc)
NODE_ENV=production STATIC_DIR=$(pwd)/packages/frontend/dist pnpm start
```

In prod the running Node process does NOT load Vite — `STATIC_DIR` is served by `express.static`, with the SPA fallback going to `<STATIC_DIR>/index.html`.

## WebSocket protocol

Connect with `?room=<slug>`. First client message must be `hello`:

```json
{ "type": "hello", "userId": "u_xxx", "name": "alice", "emoji": "🎤", "anonymous": false }
```

Server immediately sends a `state` snapshot, and re-broadcasts `state` after every mutation. The full client→server message list lives in [`openspec/specs/room-state-sync/spec.md`](../../openspec/specs/room-state-sync/spec.md).

## Rate limits

Per `userId` (token bucket, refill over 60 s):

- `queue.add` — 30/min
- `danmaku` — 60/min
- `POST /api/parse-link` — 20/min (falls back to IP if no `userId` provided)

## Persistence

SQLite (WAL) via `better-sqlite3`. Each room's `RoomState` is serialized as JSON in a single row keyed by slug; every mutation writes through. On startup the in-memory map is hydrated from the DB. Rooms with no subscribers and no activity for `ROOM_TTL_MS` are garbage-collected (and their row is deleted).
