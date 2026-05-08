# Room State Sync

## Purpose

The backend is the single authoritative source of room state. Every connected client mirrors it via WebSocket; nothing is cached client-side as the source of truth. Each room has a queue, current track, history, danmaku ring, and presence map.

## Requirements

### Requirement: WebSocket endpoint per room

The backend SHALL expose a WebSocket endpoint at `/ws?room=<slug>` that accepts a stable `userId` from each client and treats the server-side `RoomState` as canonical.

#### Scenario: Client connects, sends hello, receives state

- **WHEN** a client opens `wss://<host>/ws?room=<slug>` and sends `{type:"hello", userId, name, emoji, anonymous}`
- **THEN** the server SHALL register the user in `room.users[userId]` and immediately send a full `{type:"state", state:RoomState}` snapshot

#### Scenario: Reconnect resumes the same identity

- **WHEN** a client reconnects with the same `userId`
- **THEN** the server SHALL keep the user's prior presence row and broadcast a fresh `state` snapshot

### Requirement: Mutations are server-authoritative

All queue/track/profile/danmaku mutations SHALL go through the WebSocket as typed messages. The server applies them, increments `state.rev`, and re-broadcasts the full state to every subscriber of that room.

#### Scenario: Queue add propagates to all peers

- **WHEN** client A sends `{type:"queue.add", song}` and the room already has a `current`
- **THEN** the server SHALL append the song to the queue, bump `rev`, and every connected client SHALL receive the new state

#### Scenario: Track advance moves head to current and current to history

- **WHEN** any client sends `{type:"track.next"}`
- **THEN** the server SHALL push the current track (with `finishedAt`) into history and shift the queue head into current

### Requirement: No playback synchronization

The server SHALL NOT track or sync playback position, play/pause state, or volume. Each client plays independently.

#### Scenario: Server ignores playback fields

- **WHEN** a client sends a message containing playback position
- **THEN** the server SHALL discard that field and not broadcast it

### Requirement: Presence with 60s online window

Users are considered online if their `lastSeen` is within the last 60 seconds. Clients SHALL send `{type:"heartbeat"}` periodically (≤30s). Stale presence rows SHALL be pruned on the next mutation.

#### Scenario: Idle user falls offline

- **WHEN** a user has not sent any message in 60s
- **THEN** the user's row remains in `users` but appears offline in any presence-aware UI; the next mutation in the room SHALL prune it

### Requirement: Danmaku ring buffer of 50

The backend SHALL keep at most the last 50 danmaku messages per room.

#### Scenario: Older messages drop

- **WHEN** a 51st `{type:"danmaku", text}` arrives
- **THEN** the oldest message SHALL be discarded and `state.danmaku.length` SHALL stay at 50

### Requirement: Per-user rate limits

The backend SHALL apply token-bucket rate limits keyed by `userId`:

- `queue.add`: 30/min
- `danmaku`: 60/min
- link parsing: 20/min

#### Scenario: Limit exceeded returns an error message, not state

- **WHEN** a client exceeds a limit
- **THEN** the server SHALL respond with `{type:"error", error:"rate limited (...)"}` and SHALL NOT mutate state
