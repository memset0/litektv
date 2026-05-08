## 1. Pass page through to the Bilibili player iframe

- [x] 1.1 In `packages/frontend/urlparse.jsx` `embedUrl`, in the `song.source === "bili"` branch, add `\`page=${song.page || 1}\`` to the `params` array (alongside `bvid`, `autoplay`, `t`, `high_quality`, `danmaku`, `as_wide`)

## 2. Verify

- [x] 2.1 Queue `https://www.bilibili.com/video/BV1ir4y1u7om?p=2` (with or without tracking params); confirm the title in the queue row reads `… - P2 …` and the player loads P2, not P1
- [x] 2.2 Queue a single-part link (e.g. `BV1uv411q7Mv`); confirm playback still works (`page=1` is harmless)
- [x] 2.3 Spot-check a previously-queued multipart song that's already in the SQLite store reloads with the right P after a backend restart
