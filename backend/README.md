# litektv-backend

Realtime room/queue/danmaku backend for [litektv](../). Implements the surface described in [`../BACKEND_SPEC.md`](../BACKEND_SPEC.md):

- `POST /api/parse-link` — resolve YouTube / Bilibili URLs (incl. `b23.tv` redirects) and fetch metadata.
- `GET /api/thumb?source&id` — 302 redirect to a source thumbnail.
- `GET /api/health` — liveness probe.
- `WS /ws?room=<slug>` — per-room state sync (queue, current track, history, presence, danmaku).

Playback position is **not** synced — the server only tracks *which* track is current. See spec §4 and §5.

## Stack

- Node.js ≥ 20, TypeScript, pnpm
- `express` for REST, `ws` for WebSocket, `zod` for input validation

## Develop

```bash
pnpm install
pnpm dev          # tsx watch on src/index.ts
```

Environment variables:

| Name | Default | Notes |
|------|---------|-------|
| `PORT` | `38117` | HTTP port (REST + WS share it) |
| `HOST` | `127.0.0.1` | Bind host |
| `STATIC_DIR` | (unset) | If set, serves files at `/` (e.g. `..` to serve the JSX frontend during dev) |
| `ROOM_TTL_MS` | `86400000` | GC idle rooms after this (24h) |

## Build & run

```bash
pnpm build
pnpm start
```

## WebSocket protocol

Connect with `?room=<slug>`. First client message must be `hello`:

```json
{ "type": "hello", "userId": "u_xxx", "name": "alice", "emoji": "🎤", "anonymous": false }
```

Server immediately sends a `state` snapshot, and re-broadcasts `state` after every mutation. Other client message types are listed in [`BACKEND_SPEC.md` §5](../BACKEND_SPEC.md).

## Rate limits

Per `userId` (token bucket, refill over 60 s):

- `queue.add` — 30/min
- `danmaku` — 60/min
- `POST /api/parse-link` — 20/min (falls back to IP if no `userId` provided)

## Persistence

In-memory only in v1. Rooms with no subscribers and no activity for `ROOM_TTL_MS` are garbage-collected.
