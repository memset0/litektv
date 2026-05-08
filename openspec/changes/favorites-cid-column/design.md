## Context

`bilibili-page-via-cid` (archived 2026-05-08) added `Song.cid` end-to-end and made the iframe URL UA-aware. The favorites table was deliberately left out — the design doc said adding a column would be a separate change because the (source, video_id, page) PK would need a careful migration. Turns out the `favorites-rich-metadata` change has already established a clean idempotent ALTER TABLE pattern (`display_title`, `authors`, `mode`); we ride that. The PK is unchanged — `cid` is metadata, not a key.

## Goals / Non-Goals

**Goals:**
- One persisted `cid` per favorite row so catalog re-adds skip the upstream API call.
- Backfill 24 existing Bilibili favorite rows during apply.
- Document the existing graceful-on-failure contract so it doesn't regress.

**Non-Goals:**
- No PK change. cid is not in the favorites identity tuple.
- No retro-fetch on EVERY favorite (only fill nulls).
- No new edit affordance in the catalog UI for cid (it's machine-derived, not human-edited).

## Decisions

### D1. Add `cid INTEGER` column via the existing migration list

`db.ts` already has:

```ts
const migrations = [
  "display_title TEXT",
  "authors TEXT",
  "mode TEXT",
];
for (const column of migrations) {
  // try ALTER TABLE; ignore "duplicate column" error
}
```

Extend with `"cid INTEGER"`. Existing rows get NULL; new rows get whatever the INSERT supplies. The `CREATE TABLE` block also adds the column for fresh installs.

### D2. Read path normalizes NULL → undefined

`FavoriteRow.cid` is typed `number | null` in TS (matches sqlite). The mapper converts: `cid: r.cid ?? undefined`. So in-memory `Favorite` always has `cid?: number` (never `null`), matching the `@litektv/types` contract.

### D3. Wire snapshot omits null cid

When serializing the `favorites` broadcast, omit cid for rows that have it null. JSON.stringify of an `undefined` value drops the key automatically; this falls out of D2.

### D4. Catalog ref ships `cid` when present

`packages/frontend/src/catalog.tsx`'s `onAddRef` currently builds:

```ts
onAddRef({
  source: f.source,
  videoId: f.videoId,
  page: f.source === "bili" && f.page ? f.page : undefined,
});
```

Add `cid: f.cid` to the ref. The backend `queue.add` ref branch already prefers `ref.cid` over re-parsing (per bilibili-page-via-cid's `let cid: number | undefined = ref.cid;` logic). So this is a one-key addition with zero new backend code.

### D5. Backfill is a one-shot script

Following the same pattern as `/tmp/backfill-cid.mjs` (the rooms backfill from the prior change): collect (videoId, page) of Bilibili favorites with NULL cid, fetch from Bilibili API with a polite delay, UPDATE rows. Stop systemd, run script, restart. No retry/cron complexity — this is a one-time correction.

The existing rooms backfill script handled 31 unique pairs in ~10 seconds; favorites are fewer (24), so it'll be even quicker.

### D6. Graceful failure is already coded; we just spec it

`fetchBilibiliMeta` already wraps everything in try/catch and returns `{}` on any error. `finalizeMeta` does `cid: meta.cid` (undefined when missing). `embedUrl` branches on truthy `song.cid`. So the failure mode is already non-fatal. The spec delta in `link-parser` documents this contract so future code keeps it.

## Risks / Trade-offs

- **[Risk] ALTER TABLE on a busy DB** → favorites is small (24 rows). The ALTER is fast, single-statement, atomic. No measurable downtime.
- **[Risk] Rate limit on Bilibili side during backfill** → 24 fetches with 280ms delay = ~7 seconds. Well under any plausible rate limit. Mitigation in script: log failures and continue (doesn't crash); user can re-run.
- **[Risk] Older clients don't know about cid in the favorites snapshot** → cid is an additive optional field; older clients ignore it. No regression.
- **[Trade-off] Favorites table now has 4 nullable columns (display_title, authors, mode, cid)** → mild fragmentation but each is structurally distinct. Not a refactor target.

## Migration Plan

1. Backend: add column to migration list + `CREATE TABLE`, plus `FAV_SELECT` / `addFavorite` write path. `pnpm build` and `systemctl restart litektv.service`. The boot path runs `initDb` which fires the idempotent ALTER.
2. Frontend: catalog ref carries `cid`. `pnpm build`.
3. Backfill: stop unit, run script, start unit. ~10 seconds.
4. Live verify: catalog → + on a Bilibili song; check the queue row carries cid (via SQLite); confirm playback works on both desktop and mobile.

## Open Questions

None.
