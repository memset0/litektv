## Context

`favorites` rows currently store the song as it was imported. The user keeps a mix of 伴奏 / 原唱 versions of the same song with messy or junk titles, and wants both a curated view layered on top AND the ability to undo damage if the catalog gets abused (e.g. someone clears half the list, or makes a malicious bulk edit).

Three additive nullable columns on `favorites`:

- `display_title` — the polished song name.
- `authors` — JSON array of strings (`["陶喆","蔡依林"]` etc.) stored as text.
- `mode` — small enum, `'instr'` or `'vocal'` or NULL.

A new append-only `favorite_audit` table records every successful `add` / `update` / `remove` (and rollback) so the operator can run a CLI tool to roll the favorites table back to any point in time.

## Goals / Non-Goals

**Goals:**
- Add the three columns + audit table; surface them through the existing `favorites` snapshot.
- Add `favorite.update` and `favorite.remove` WS messages; both share the existing rate-limit budget.
- Render structured form **only when all three** manual fields are set; raw title otherwise.
- Catalog row gets ✏️ / `+` / 🗑 buttons.
- ★ on queue / history rows: empty → favorite, filled → open edit modal.
- CLI rollback tool — local-shell-only entrypoint, dry-run by default, applies inside one transaction.

**Non-Goals:**
- No HTTP / WS rollback path. Anyone with rollback authority needs SSH access.
- No automatic translation traditional → simplified — operator's responsibility.
- No bulk-edit UI in the catalog modal.
- No CSV / JSON export of favorites in this change.
- No version history surfaced in the UI (the audit log is operator-internal).

## Decisions

**All-three-fields trigger for the structured title.**

- Why: the user explicitly asked for "only when all three are set". Falling back to raw for any partial state keeps the rendered output predictable — anything other than the canonical "[mode] · [name] · [authors]" trio just shows the imported title, no half-formed strings.
- Cost: the operator can't get partial credit for filling out e.g. just `displayTitle` to clean up Traditional/Simplified mismatch. Trade-off accepted since "I'll set all three when I bother" matches the actual workflow.

**Single `Favorite Edit` modal reused by three entry points** (catalog ✏️, filled ★ on queue row, filled ★ on history row).

- Why: same target data, same fields, same Save / Cancel / Delete actions. One component, lifted to a high-enough parent that any of the three triggers can open it.
- The modal's "Delete" button doubles as the unstar control on queue / history rows — no need for a separate "remove" button next to the star.

**`favorite.update` accepts a partial patch** rather than the full row.

- Why: the operator (or the edit modal) typically only touches one or two fields. Requiring the full row would force the client to round-trip the existing values, and `null` vs. "not present" semantics in the JSON wire format would be ambiguous. Treating omitted keys as "no change" and explicit `null` as "clear" matches HTTP PATCH conventions.
- The server validates `mode` against the literal set; rejects unknowns.

**Audit log: append-only single table, before+after JSON snapshots.**

- Why: simplest schema that supports point-in-time replay. Each row is self-contained — no need to walk multiple tables to reconstruct state at time T.
- Trade-off: JSON snapshots of every row mutation grow the DB linearly with edit volume. For the user's solo / small-group usage this is bounded (favorites turn over slowly). If the table ever gets uncomfortable a future change can add periodic compaction (e.g. snapshot the whole `favorites` table once a week and prune older rows).

**Rollback runs as `pnpm --dir packages/backend tsx src/rollbackFavorites.ts <ISO timestamp>`, no `--apply` by default.**

- Why: classic Unix CLI pattern. Dry-run prints the diff so the operator sees exactly what's about to change before committing.
- The script connects directly to the same `litektv.db`; concurrent backend writes are safe because the rollback runs in one SQLite transaction (better-sqlite3's default behavior under WAL mode).

**Replay algorithm**: walk `favorite_audit` rows in `ts ASC` order; for each `(source, video_id, page)` keep the latest `after_json` (for `add`/`update`) or mark removed (for `remove`); stop at audit rows with `ts > target`. The resulting set is the target table state. Diff against current `favorites` to compute add/update/remove operations.

- Edge case: rollback rows themselves. Skip them in the replay walk — they record bulk rewrites, not single-row mutations. Point-in-time rollback "undoes" any prior rollback because we're replaying from the singular mutations.

**Rate-limit `favorite.update` and `favorite.remove` against the same bucket as `favorite.add`.**

- Why: simpler than three buckets; the budget already covers "actions on favorites". 60/min is generous for a human and stingy for an abuser.

## Risks / Trade-offs

- [Risk] `authors` stored as text means buggy JSON breaks the row's parse on the way back to the client → Mitigation: parse defensively in `db.ts`'s row-mapper; on parse failure, log + treat as `undefined`. Don't crash the snapshot send.
- [Risk] Audit log grows unboundedly → Mitigation: documented as append-only, future change adds compaction.
- [Risk] An admin makes a mistake and rolls back too far, losing recent good edits → Mitigation: each rollback itself logs an audit row with the prior state; running the rollback again with a later timestamp restores those edits.
- [Risk] Frontend forgets to thread `formatSongTitle(song, favoritesByKey)` at one site → Mitigation: spec scenarios enumerate the four sites; tasks list each call site explicitly; smoke-test step requires all four to render the structured form for a fully-populated favorite.
- [Trade-off] No HTTP rollback path means a human-in-the-loop with shell access. Acceptable per the user's stated security posture.

## Migration Plan

1. Backend boot runs:
   - `ALTER TABLE favorites ADD COLUMN display_title TEXT` (idempotent — guarded against "duplicate column" error).
   - `... ADD COLUMN authors TEXT`, `... ADD COLUMN mode TEXT CHECK (...)`.
   - `CREATE TABLE IF NOT EXISTS favorite_audit (...)`.
2. Deploy: `pnpm --dir packages/backend build && systemctl restart litektv.service` (per the existing CLAUDE.md restart rule).
3. Frontend reload picks up `formatSongTitle` and the new edit / delete UI.
4. Operator can now open ✏️ on any favorite (or click a filled ★) to set fields, OR run direct SQL — both paths log to `favorite_audit`. Direct SQL bypasses the audit log unless the operator wraps writes in inserts to `favorite_audit` themselves; this is documented but not enforced (the audit log captures app traffic, not raw DB tampering).
5. Rollback: `pnpm --dir packages/backend tsx src/rollbackFavorites.ts 2026-05-08T08:00:00Z` (dry-run). Add `--apply` to commit. The script runs against the live DB; backend keeps serving (better-sqlite3 + WAL handles concurrent reads).
6. Rollback: schema change is forward-compatible — reverting the code leaves the new columns sitting unused (NULL) and the audit table untouched.
