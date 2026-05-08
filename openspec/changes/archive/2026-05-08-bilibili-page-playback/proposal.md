## Why

Bilibili multipart videos (e.g. `https://www.bilibili.com/video/BV1ir4y1u7om?p=2`) carry a `?p=N` query parameter that selects which sub-clip to play. The backend parser already extracts `page` correctly, the per-page title/duration get stored on the song record, and the WebSocket payload preserves `song.page`. **But the iframe URL we hand to `player.bilibili.com/player.html` does NOT include `page=N`** — so even when a user pastes a `?p=2` link, every viewer ends up watching P1.

Result: a user pastes a multipart link expecting "the right P", and gets the wrong clip with no obvious recourse.

## What Changes

- The frontend `embedUrl(song)` helper SHALL append `page=${song.page || 1}` to the Bilibili iframe URL when the source is `"bili"`.
- No backend change — parser, song schema, and persistence already handle `page` correctly.
- No JSX change beyond the helper output — the player picks up the new query string automatically.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `link-parser`: tighten the existing requirements so that the `page` value the parser extracts is also honored downstream by the playback embed (currently the spec stops at parsing).

## Impact

- Affected code: `packages/frontend/urlparse.jsx` (the `embedUrl` Bilibili branch — one line added to the `params` array).
- No backend changes, no DB schema changes, no new dependencies.
- Backward compatible: songs without `page` still play P1 (the iframe default).
