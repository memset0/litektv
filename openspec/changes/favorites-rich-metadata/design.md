## Context

`favorites` rows currently store the song as it was imported. The user keeps a mix of 伴奏 / 原唱 versions of the same song, sometimes with messy or junk titles (mojibake, English-only, traditional/simplified mixed). They want to maintain a clean canonical view *without* losing the imported original (in case a future feature needs to re-resolve metadata).

The simplest and most flexible answer is three nullable columns on the existing `favorites` table:

- `display_title` — the polished song name.
- `authors` — JSON array of strings (`["陶喆","蔡依林"]` etc.) stored as text. JSON is fine here: typical author count is 1–4, and SQLite handles it.
- `mode` — small enum, currently `'instr'` or `'vocal'` or NULL.

The user has explicitly said they'll populate these fields via direct SQL. v1 has no edit UI and no `favorite.update` WS message — that keeps the change surgical and lets us iterate on the rendering rule without re-shipping any client/server protocol.

## Goals / Non-Goals

**Goals:**
- Add the three columns and surface them through the existing `favorites` snapshot.
- Provide a single rendering helper used everywhere a song title is shown.
- Make the upgrade safe on the live SQLite (additive ALTERs, idempotent).
- Preserve every other existing favorites behavior (add-only, addedBy/addedAt first-starrer-wins, snapshot broadcast).

**Non-Goals:**
- No edit UI in v1.
- No `favorite.update` / `favorite.set-meta` WebSocket message in v1.
- No automatic translation traditional → simplified — that's the operator's responsibility (they're SQL-editing).
- No per-page-level mode (Bilibili `?p=N` already keys the row, so a karaoke variant on `p=2` and the original on `p=3` are already two separate rows).
- No multi-language `displayTitle` (single string; if the user wants both EN and CN they pick one).

## Decisions

**Three nullable columns instead of a separate `favorite_meta` table.**

- Why: there's a 1:1 relationship and no other entity references the metadata. A side table adds a join to every `listFavorites` call for nothing.
- Cost: NULLable columns ride along with every favorite row. Acceptable — SQLite stores NULLs efficiently.

**`authors` as a JSON-array text column, not a separate `favorite_authors` table.**

- Why: render order matters (singer first, then composer, etc.), arrays preserve it, and the author list is read whole every time. A side table would require ordering columns + joins.
- Trade-off: searching by author requires `LIKE '%"陶喆"%'` (or pulling the array client-side). For v1 the catalog search already operates client-side via pinyin/initials/substring — searching authors there is a simple addition later.

**`mode` as a small enum constrained at the DB level.**

- The `CHECK (mode IS NULL OR mode IN ('instr','vocal'))` constraint guarantees the enum at the storage layer; if a future mode emerges (e.g. `'cover'`) we relax the CHECK in a future change.
- Why two letters? `instr` and `vocal` were chosen because they're unambiguous in English and short; UI maps them to `伴奏` and `原唱` at render time.

**Migration via `ALTER TABLE favorites ADD COLUMN ...` guarded by `pragma_table_info` lookup.**

- Why: simpler than a numeric-version migration table for a single additive step, idempotent on repeat boots.
- Alternative considered: drop and recreate the table. Rejected — would require copying every existing favorite row, plus blocks on a live DB.

**Rendering helper lives on the frontend, returns a string.**

- Why: title formatting is a pure function of `(song, favorite?)`. Putting it in one place (e.g. `packages/frontend/display.jsx` exporting `formatSongTitle(song, favoritesByKey)`) avoids drift between queue/history/catalog/now-playing call sites.
- The helper SHALL NOT modify either `song` or `favorite`. The structured string is computed every render; cheap (cap ~5 characters of work per row).

**Server still preserves first-starrer wins for ALL fields, including the new manual ones.**

- A subsequent `favorite.add` does NOT touch any existing column on the row. The whole point of manual metadata is that it's the operator's curated state — protocol traffic never overwrites it.

## Risks / Trade-offs

- [Risk] `authors` stored as text means buggy JSON (e.g. operator typo) breaks the row's parse on the way back to the client → Mitigation: parse defensively in `db.ts`'s row-mapper; on parse failure, log + treat as `null`. Don't crash the snapshot send.
- [Risk] Operator populates `mode` with an unexpected value → Mitigation: DB CHECK constraint refuses the write; the `UPDATE` fails loudly.
- [Risk] Frontend forgets to call the helper at one site, so structured title drifts → Mitigation: spec scenario explicitly enumerates queue / history / catalog / now-playing as the four sites; tasks.md lists them; future review/audit catches drift.
- [Trade-off] No edit UI now means anyone who wants to set metadata needs SSH access to the DB. Acceptable per user's stated workflow; can layer a small `/api/favorites/<key>` PATCH later.

## Migration Plan

1. Backend boot runs the additive ALTERs. Existing row reads emit `null` for the three new fields. Frontend handles `null` (helper falls through to raw `title`).
2. Deploy: `pnpm --dir packages/backend build && systemctl restart litektv.service`. Frontend reload picks up the new helper.
3. Operator populates whatever rows they care about via `sqlite3 backend/data/litektv.db` UPDATEs. Each update appears live on every connected client on the next `favorites` broadcast (which happens after the next `favorite.add` from any client; for an immediate refresh, any client can reconnect).
4. Rollback: revert the code change. Schema is forward-compatible (the extra columns just sit NULL); no data deleted.
