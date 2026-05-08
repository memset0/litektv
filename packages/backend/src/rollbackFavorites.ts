/**
 * CLI tool to roll back the `favorites` table to a target timestamp by
 * replaying the append-only `favorite_audit` log.
 *
 * Usage:
 *   pnpm --dir packages/backend tsx src/rollbackFavorites.ts <ISO-timestamp>           # dry-run
 *   pnpm --dir packages/backend tsx src/rollbackFavorites.ts <ISO-timestamp> --apply   # commit
 *
 * Local-shell only. There is intentionally NO HTTP / WS / frontend route that
 * can reach this code path; rolling back the favorites set is an operator
 * action that requires direct shell access to the backend host.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { config } from "./config.js";
import {
  appendFavoriteAudit,
  initDb,
  listFavoriteAudit,
  listFavorites,
} from "./db.js";
import type { Favorite, Source } from "./types.js";

interface CliOptions {
  targetTs: number;
  apply: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const apply = args.includes("--apply");
  const positional = args.filter((a) => !a.startsWith("--"));
  const tsArg = positional[0];
  if (!tsArg) {
    console.error("usage: rollbackFavorites <ISO-timestamp> [--apply]");
    console.error(
      "  example: rollbackFavorites 2026-05-08T08:00:00Z",
    );
    process.exit(2);
  }
  const targetTs = Date.parse(tsArg);
  if (!Number.isFinite(targetTs)) {
    console.error(`bad timestamp: ${tsArg}`);
    process.exit(2);
  }
  return { targetTs, apply };
}

interface FavoriteKey {
  source: Source;
  videoId: string;
  page: number;
}
const keyOf = (k: FavoriteKey) => `${k.source}|${k.videoId}|${k.page}`;
const parseKey = (k: string): FavoriteKey => {
  const [source, videoId, pageStr] = k.split("|");
  return {
    source: source as Source,
    videoId: videoId!,
    page: Number(pageStr),
  };
};

/**
 * Compute what the favorites table looked like at `targetTs` by starting
 * from the CURRENT state and undoing every audit row that landed after the
 * target. This handles rows that pre-date the audit log (no audit row
 * exists for them, so they remain in the target state) — a pure replay-
 * from-zero would mistakenly drop them.
 *
 * Rollback rows are skipped — point-in-time recovery is computed from the
 * underlying singular mutations regardless of whether prior rollbacks ran.
 */
function computeTargetState(targetTs: number): Map<string, Favorite> {
  const state = new Map<string, Favorite>();
  for (const f of listFavorites()) {
    state.set(keyOf(f), f);
  }
  const audit = listFavoriteAudit({});
  // Walk in reverse chronological order; only inverses for rows AFTER the target.
  for (let i = audit.length - 1; i >= 0; i--) {
    const e = audit[i]!;
    if (e.ts <= targetTs) continue;
    if (e.op === "rollback") continue;
    if (e.source == null || e.videoId == null || e.page == null) continue;
    const k = keyOf({ source: e.source, videoId: e.videoId, page: e.page });
    if (e.op === "add") {
      // The add was post-target, so the row didn't exist at target. Drop it.
      state.delete(k);
    } else if (e.op === "remove") {
      // The remove was post-target, so the row DID exist at target — restore.
      if (e.before && !Array.isArray(e.before)) state.set(k, e.before);
    } else if (e.op === "update") {
      // Roll the update back to its `before` snapshot.
      if (e.before && !Array.isArray(e.before)) state.set(k, e.before);
    }
  }
  return state;
}

interface Diff {
  toInsert: Favorite[];
  toUpdate: { before: Favorite; after: Favorite }[];
  toDelete: Favorite[];
}

function favoritesEqual(a: Favorite, b: Favorite): boolean {
  // Canonical comparison ignores `addedAt` ordering only if explicitly equal;
  // we treat all visible fields as significant, since the rollback should
  // restore the table to byte-equivalent state.
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}
function canonicalize(f: Favorite): Record<string, unknown> {
  // Fields are emitted in a fixed order so JSON.stringify is deterministic.
  return {
    source: f.source,
    videoId: f.videoId,
    page: f.page,
    title: f.title,
    thumb: f.thumb ?? null,
    duration: f.duration ?? null,
    addedBy: f.addedBy ?? null,
    addedAt: f.addedAt,
    displayTitle: f.displayTitle ?? null,
    authors: f.authors ?? null,
    mode: f.mode ?? null,
  };
}

function buildDiff(
  current: Favorite[],
  targetMap: Map<string, Favorite>,
): Diff {
  const currentMap = new Map(current.map((f) => [keyOf(f), f]));
  const toInsert: Favorite[] = [];
  const toUpdate: { before: Favorite; after: Favorite }[] = [];
  const toDelete: Favorite[] = [];
  for (const [k, target] of targetMap) {
    const cur = currentMap.get(k);
    if (!cur) toInsert.push(target);
    else if (!favoritesEqual(cur, target)) toUpdate.push({ before: cur, after: target });
  }
  for (const [k, cur] of currentMap) {
    if (!targetMap.has(k)) toDelete.push(cur);
  }
  return { toInsert, toUpdate, toDelete };
}

function printDiff(diff: Diff, targetTs: number) {
  const stamp = new Date(targetTs).toISOString();
  console.log(`# rollback target: ${stamp}`);
  console.log(`# changes:`);
  console.log(`  + ${diff.toInsert.length} row(s) to insert`);
  console.log(`  ~ ${diff.toUpdate.length} row(s) to update`);
  console.log(`  - ${diff.toDelete.length} row(s) to delete`);
  for (const f of diff.toInsert) {
    console.log(`  + ${f.source} ${f.videoId} p${f.page}  "${f.title}"`);
  }
  for (const { before, after } of diff.toUpdate) {
    const changedFields: string[] = [];
    if (before.title !== after.title) changedFields.push("title");
    if (before.displayTitle !== after.displayTitle) changedFields.push("displayTitle");
    if (
      JSON.stringify(before.authors ?? null) !==
      JSON.stringify(after.authors ?? null)
    ) {
      changedFields.push("authors");
    }
    if (before.mode !== after.mode) changedFields.push("mode");
    console.log(
      `  ~ ${after.source} ${after.videoId} p${after.page}  fields: [${changedFields.join(",") || "..."}]`,
    );
  }
  for (const f of diff.toDelete) {
    console.log(`  - ${f.source} ${f.videoId} p${f.page}  "${f.title}"`);
  }
}

function applyDiff(diff: Diff, targetTs: number) {
  const dbPath = path.resolve(config.dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const before = listFavorites();
  const txn = db.transaction(() => {
    if (diff.toDelete.length > 0) {
      const stmt = db.prepare(
        "DELETE FROM favorites WHERE source = ? AND video_id = ? AND page = ?",
      );
      for (const f of diff.toDelete) stmt.run(f.source, f.videoId, f.page);
    }
    const upsertStmt = db.prepare(
      `INSERT INTO favorites
         (source, video_id, page, title, thumb, duration,
          added_by_id, added_by_name, added_by_emoji, added_at,
          display_title, authors, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, video_id, page) DO UPDATE SET
         title          = excluded.title,
         thumb          = excluded.thumb,
         duration       = excluded.duration,
         added_by_id    = excluded.added_by_id,
         added_by_name  = excluded.added_by_name,
         added_by_emoji = excluded.added_by_emoji,
         added_at       = excluded.added_at,
         display_title  = excluded.display_title,
         authors        = excluded.authors,
         mode           = excluded.mode`,
    );
    const writeRow = (f: Favorite) => {
      upsertStmt.run(
        f.source,
        f.videoId,
        f.page,
        f.title,
        f.thumb ?? null,
        f.duration ?? null,
        f.addedBy?.id ?? null,
        f.addedBy?.name ?? null,
        f.addedBy?.emoji ?? null,
        f.addedAt,
        f.displayTitle ?? null,
        f.authors == null ? null : JSON.stringify(f.authors),
        f.mode ?? null,
      );
    };
    for (const f of diff.toInsert) writeRow(f);
    for (const { after } of diff.toUpdate) writeRow(after);
  });
  txn();
  db.close();
  // Audit the rollback itself — re-uses the global `db` handle from initDb()
  // (the one we just closed was a separate connection for the bulk write).
  const after = listFavorites();
  appendFavoriteAudit({
    ts: Date.now(),
    op: "rollback",
    user: { name: "cli-rollback" },
    before,
    after,
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  initDb();
  const targetMap = computeTargetState(opts.targetTs);
  const current = listFavorites();
  const diff = buildDiff(current, targetMap);
  printDiff(diff, opts.targetTs);
  if (!opts.apply) {
    console.log("");
    console.log("dry-run only — re-run with --apply to commit");
    return;
  }
  if (
    diff.toInsert.length === 0 &&
    diff.toUpdate.length === 0 &&
    diff.toDelete.length === 0
  ) {
    console.log("nothing to apply");
    return;
  }
  applyDiff(diff, opts.targetTs);
  console.log("");
  console.log(
    `applied: +${diff.toInsert.length} ~${diff.toUpdate.length} -${diff.toDelete.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
