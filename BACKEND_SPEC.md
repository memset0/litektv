# NEON KTV — Backend Spec & Product Requirements

A neon/cyberpunk-themed shared karaoke jukebox. Frontend is already built as a single-page React app (`KTV.html` + JSX/CSS files). This document captures everything the backend must implement so playback, queueing, identity, and danmaku stay in sync across all participants in a room.

---

## 1. Product summary

- A web app that lets a group of people in (or remote from) a KTV room queue up videos from **YouTube** and **Bilibili** and sing along.
- Multiple users join the **same room** via URL / QR code; everyone sees the **same queue, the same current song, the same history, and the same danmaku stream** in real time.
- There is **no centralized "DJ"** — every participant has equal rights to queue, reorder, skip, replay, and post danmaku.
- Each client plays the video **independently in their own browser** (so each person can adjust their own volume / fullscreen). The backend does **not** synchronize playback position — only the *identity of the currently playing track*.

---

## 2. Audio/video sources

The backend must accept user-pasted links and normalize them. It must support **at minimum**:

| Source   | Long form examples                                                       | Short form / redirects        |
|----------|--------------------------------------------------------------------------|-------------------------------|
| YouTube  | `youtube.com/watch?v=XXXX` · `m.youtube.com/...` · `youtube.com/shorts/XXXX` | `youtu.be/XXXX`              |
| Bilibili | `bilibili.com/video/BVxxxxxx` · `?p=N` for multipart                     | `b23.tv/xxxx` (HTTP redirect) |

### Required parsing endpoint

`POST /api/parse-link`
```json
// req
{ "url": "https://b23.tv/AbC123" }

// res
{
  "source": "bili",          // "yt" | "bili"
  "videoId": "BV1xxxxxxx",   // YouTube videoId or Bilibili BV
  "page": 1,                 // bilibili only; multipart page index, default 1
  "title": "Some song name",
  "thumb": "https://...jpg",
  "duration": 234            // seconds, optional but preferred
}
```

Behavior:
- Server must follow redirects (so `b23.tv` short links resolve).
- If metadata fetch fails, return at least `source` + `videoId` and let the client fall back to a generic title.
- The backend, **not** the client, should resolve short URLs (the client's CORS-proxy hack must go away in production).

---

## 3. Identity & rooms

### Room

- Identified by an opaque `slug` (random 6–8 chars). The browser URL `?room=<slug>` decides which room a client joins.
- A room has **no owner / no admin** — all controls are equally available to every participant.
- Rooms persist (queue + history + danmaku tail of last 50) for **at least 24h after the last activity**, then may be GC'd.
- A new visitor with a slug that doesn't exist yet should auto-create that room.

### User

- Each client generates a stable `userId` (UUID, kept in `localStorage`) on first visit.
- Profile fields: `name` (≤16 chars), `emoji` avatar, `anonymous` flag.
- Server stores presence: `lastSeen` ms; clients are considered **online** if seen within the last 60 s.
- Server need not authenticate users — `userId` from the client is trusted. (If anti-abuse becomes a concern, attach a signed JWT minted on first connect.)

---

## 4. Real-time room state model

The canonical per-room document looks like this:

```ts
type RoomState = {
  slug: string;
  current: Song | null;        // the track everyone is playing right now
  queue: Song[];               // upcoming, FIFO unless reordered
  history: Song[];             // finished tracks, oldest first; each has finishedAt
  users: Record<UserId, {
    name: string; emoji: string; anonymous: boolean; lastSeen: number;
  }>;
  danmaku: DanmakuMsg[];       // ring buffer, last 50
  rev: number;                 // monotonic; bump on every mutation
};

type Song = {
  id: string;                  // uuid; stable across moves; NOT the same as videoId
  source: "yt" | "bili";
  videoId: string;
  page?: number;               // bili multipart
  title: string;
  thumb?: string | null;
  duration?: number;
  addedBy: { id?: string; name: string; emoji: string; anonymous: boolean };
  addedAt: number;             // ms
  finishedAt?: number;         // ms, set when popped to history
};

type DanmakuMsg = {
  id: string;
  ts: number;
  text: string;                // ≤80 chars
  authorId?: string;           // optional; system messages have none
};
```

### NOT in the state model (intentionally)

- ❌ `playback.playing` / `position` / `wallTime` / `volume` / `muted` — playback is **per-client**, not synced.
- ❌ Per-user role flags — everyone is equal.

---

## 5. Transport

Recommended: **WebSocket** (Socket.IO is fine) per room. SSE + REST POST is acceptable.

### Client → Server messages

```ts
{ type: "hello", userId, name, emoji, anonymous }       // join room
{ type: "heartbeat" }                                   // every 20–30s

{ type: "queue.add", song }                             // append (or set current if none)
{ type: "queue.move", id, delta: -1|+1 }
{ type: "queue.top",  id }
{ type: "queue.remove", id }
{ type: "queue.shuffle" }
{ type: "queue.clear" }

{ type: "track.next" }                                  // pop head of queue → current; old current → history
{ type: "track.prev" }                                  // pop last of history → current; old current → front of queue
{ type: "track.meta", id, patch: { title?, thumb?, duration? } }

{ type: "danmaku", text }
{ type: "profile.update", name?, emoji?, anonymous? }
```

### Server → Client messages

```ts
{ type: "state", state: RoomState }                     // full snapshot on connect
{ type: "patch", rev, ops: JsonPatchOp[] }              // incremental updates
{ type: "danmaku", msg }                                // push-only convenience
```

Server is authoritative for ordering. Conflicting concurrent edits (e.g. two clients moving the same song) are resolved last-write-wins by server-side `rev`.

### Auto-advance — DO NOT IMPLEMENT

The server **must NOT** auto-advance the queue when "the song ends" — there is no shared playhead, so the server doesn't know when a song ends. Advancing is purely user-initiated (`track.next` / `track.prev`).

---

## 6. Frontend behaviors already wired (informational)

- Locked aesthetic: Orbitron font, cyber neon palette, `comfy` density.
- Layout switcher (top-right): SPLIT / TV / PHONE — purely client-local CSS.
- Floating QR button (bottom-left): displays `window.location.href` as a QR for joining.
- Danmaku flies right→left in 4 lanes; persists in fullscreen.
- Fullscreen toggle on the player; danmaku still overlays.
- Onboarding asks for name + emoji on first visit; can switch to anonymous later.
- Each browser tab plays the embedded video on its own — no shared playhead.

---

## 7. Suggested REST surface (for parser + thumbnails)

```
POST /api/parse-link        { url } → Song meta (see §2)
GET  /api/thumb?source&id   → 302 to source thumbnail (cache-friendly, avoids hot-linking to YT/Bili)
POST /api/qr?data=<url>     → image/png   (optional; we currently use api.qrserver.com)
```

Everything else (queue, danmaku, presence) goes over WebSocket.

---

## 8. Persistence & ops

- Storage: Postgres or Redis. Room state is small (<32 KB for a busy room).
- Ring buffer: keep last 50 danmaku messages; older ones drop.
- Persistence on hot-reload: snapshot RoomState every N mutations.
- Privacy: don't log danmaku content beyond the ring buffer; don't log user IPs beyond rate-limit windows.
- Rate limits per `userId`:
  - `queue.add`: 30 / minute
  - `danmaku`:   60 / minute
  - link parse:  20 / minute

---

## 9. Out of scope (v1)

- Account login / OAuth
- Lyric files / scoring
- Direct file uploads
- Centralized "host" device
- Synchronized playback position
- Multi-room admin / moderation tools

---

## 10. Open questions for product

1. Should rooms be discoverable, or only by-link? *(currently: only by-link)*
2. Should we expose a "promote to current" alongside "top of queue"? *(currently: only top-of-queue + manual next)*
3. Lifecycle: keep history forever, or cap at e.g. last 200?
4. Mobile: should the phone layout collapse the player into a mini-bar when scrolling the queue?
