## 1. Backend — schema + read/write

- [ ] 1.1 In `packages/backend/src/db.ts`, add `cid INTEGER` to the favorites `CREATE TABLE` block (after `mode`).
- [ ] 1.2 Extend the boot migrations list with `"cid INTEGER"` so existing DBs auto-upgrade idempotently.
- [ ] 1.3 Add `cid: number | null` to the `FavoriteRow` interface; map `r.cid ?? undefined` in the row-to-Favorite converter.
- [ ] 1.4 Update `FAV_SELECT` to include `cid`.
- [ ] 1.5 In `addFavorite`, include `cid` in the INSERT column list and bind value (null when undefined).
- [ ] 1.6 In `packages/backend/src/types.ts`, add `cid?: number` to `Favorite`.
- [ ] 1.7 In `packages/backend/src/ws.ts` `favorite.add` handler, pass `cid: parsed.song.cid` to `addFavorite(...)`. The schema already accepts cid.

## 2. Frontend — catalog ref carries cid

- [ ] 2.1 In `packages/frontend/src/catalog.tsx`, add `cid: f.cid` to the `onAddRef` payload.
- [ ] 2.2 Verify TypeScript still compiles (`useFavorites` already returns `Favorite` which now has cid; no other call site needs an update).

## 3. Backfill existing favorites

- [ ] 3.1 Stop `litektv.service`. Snapshot the DB to `litektv.db.bak.before-fav-cid-backfill`.
- [ ] 3.2 Run a one-shot script (analogous to `/tmp/backfill-cid.mjs` for rooms): for each Bilibili favorite where `cid IS NULL`, fetch from `/x/web-interface/view`, write back. Polite 280ms delay between calls.
- [ ] 3.3 Verify: `SELECT count(*) FROM favorites WHERE source='bili' AND cid IS NULL` should be 0 (or just rows whose upstream lookup failed; log + leave them).
- [ ] 3.4 Restart `litektv.service`. Confirm Active timestamp.

## 4. Build, push

- [ ] 4.1 `pnpm build` at repo root produces both dist outputs.
- [ ] 4.2 Commit groups individually (backend, frontend, backfill log if any) and push.

## 5. Live verification

- [ ] 5.1 Open the catalog modal; click `+` on a Bilibili song.
- [ ] 5.2 Inspect SQLite: the resulting queue row's `cid` SHOULD match the favorite's `cid` (no fresh upstream fetch happened).
- [ ] 5.3 Confirm playback works on desktop (cid path) and mobile (p path).
- [ ] 5.4 Bonus: temporarily block the Bilibili API (e.g. `iptables -A OUTPUT -d api.bilibili.com -j REJECT` with sudo, or just paste a video that returns code !== 0); confirm `favorite.add` and `queue.add` for unknown rows don't crash — they just store / queue without cid and the iframe falls back to `&page=` / `&p=`.

## 6. Archive (handled by user)

- [ ] 6.1 User runs `openspec archive favorites-cid-column` once they've live-tested.
