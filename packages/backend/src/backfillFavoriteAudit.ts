/**
 * One-shot CLI: synthesize `op='add'` audit rows for any pre-existing
 * favorite row that has no audit history yet. Used when the audit log was
 * introduced AFTER some favorites had already been starred.
 *
 * Idempotent — re-running this script is safe; it only inserts an `add`
 * audit row for favorites that don't already have ANY audit row keyed by
 * `(source, video_id, page)`. It never touches the favorites table itself.
 *
 * Local-shell only. There is intentionally no HTTP / WS / frontend route.
 *
 * Usage:
 *   pnpm --dir packages/backend tsx src/backfillFavoriteAudit.ts             # dry-run
 *   pnpm --dir packages/backend tsx src/backfillFavoriteAudit.ts --apply     # commit
 *
 * Production typically also needs DB_PATH set:
 *   DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
 *     pnpm --dir packages/backend tsx src/backfillFavoriteAudit.ts --apply
 */

import { initDb, listFavoriteAudit, listFavorites } from "./db.js";
import type { Favorite } from "./types.js";

interface CliOptions {
  apply: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  return { apply: argv.slice(2).includes("--apply") };
}

const keyOf = (f: { source: string; videoId: string; page: number }) =>
  `${f.source}|${f.videoId}|${f.page}`;

async function main() {
  const opts = parseArgs(process.argv);
  initDb();

  const favs = listFavorites();
  const audit = listFavoriteAudit({});
  const auditedKeys = new Set<string>();
  for (const e of audit) {
    if (e.source != null && e.videoId != null && e.page != null) {
      auditedKeys.add(keyOf({ source: e.source, videoId: e.videoId, page: e.page }));
    }
  }

  const missing: Favorite[] = favs.filter((f) => !auditedKeys.has(keyOf(f)));
  console.log(`# favorites total: ${favs.length}`);
  console.log(`# favorites already have at least one audit row: ${favs.length - missing.length}`);
  console.log(`# favorites missing audit: ${missing.length}`);
  if (missing.length === 0) {
    console.log("nothing to backfill");
    return;
  }
  for (const f of missing) {
    console.log(`  + ${f.source} ${f.videoId} p${f.page}  ts=${new Date(f.addedAt).toISOString()}  "${f.title}"`);
  }
  if (!opts.apply) {
    console.log("");
    console.log("dry-run only — re-run with --apply to commit");
    return;
  }

  // Synthesize one `op='add'` audit row per missing favorite, stamped to the
  // favorite's own `added_at` so the audit log timestamp reflects when the
  // row actually came into being. Actor is the row's first-starrer
  // (added_by_*); `before_json` is null and `after_json` is the full row.
  // Inserts run inside a single transaction.
  // We do this via direct prepare/run rather than db.appendFavoriteAudit so
  // the script can backfill rows whose `addedBy` is partially missing
  // without re-shaping payloads.
  const Database = (await import("better-sqlite3")).default;
  const path = await import("node:path");
  const { config } = await import("./config.js");
  const db = new Database(path.resolve(config.dbPath));
  const stmt = db.prepare(
    `INSERT INTO favorite_audit
       (ts, op, source, video_id, page, user_id, user_name, user_emoji, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const txn = db.transaction(() => {
    for (const f of missing) {
      const after = {
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
      stmt.run(
        f.addedAt,
        "add",
        f.source,
        f.videoId,
        f.page,
        f.addedBy?.id ?? null,
        f.addedBy?.name ?? null,
        f.addedBy?.emoji ?? null,
        null,
        JSON.stringify(after),
      );
    }
  });
  txn();
  db.close();
  console.log(`applied: backfilled ${missing.length} 'add' audit row(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
