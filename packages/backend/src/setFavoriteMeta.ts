/**
 * CLI: update a single favorite's manual-metadata fields (display_title /
 * authors / mode) and append the corresponding audit row in one pass.
 *
 * Usage:
 *   setFavoriteMeta <source> <videoId> <page> [--display-title TEXT] \
 *                                              [--authors "A1, A2"]   \
 *                                              [--mode instr|vocal|none] \
 *                                              [--actor LABEL] \
 *                                              [--apply]
 *
 * Conventions:
 *   - Mode "none" SETS the column to NULL (clears it). Omitting --mode leaves
 *     mode unchanged.
 *   - --authors expects a comma-separated list (Chinese ， also accepted).
 *     Empty string clears the column to NULL.
 *   - --display-title with empty string clears the column to NULL.
 *   - --actor labels the audit row's user_name (default: "cli-set-meta").
 *
 * Local-shell only. No HTTP / WS exposure.
 *
 * Production typically needs DB_PATH set:
 *   DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
 *     pnpm --dir packages/backend tsx src/setFavoriteMeta.ts <args>
 */

import { parseArgs } from "node:util";
import {
  findFavorite,
  initDb,
  type FavoritePatch,
} from "./db.js";
import type { Source } from "./types.js";
import { applyMetaPatch } from "./favoriteMetaOps.js";

interface CliInputs {
  source: Source;
  videoId: string;
  page: number;
  patch: FavoritePatch;
  apply: boolean;
  actor: string;
}

function parseAuthorsList(raw: string): string[] | null {
  // empty or whitespace-only → clear
  if (raw.trim().length === 0) return null;
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseCliArgs(argv: string[]): CliInputs {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      "display-title": { type: "string" },
      authors: { type: "string" },
      mode: { type: "string" },
      actor: { type: "string" },
      apply: { type: "boolean" },
    },
  });
  if (positionals.length < 3) {
    console.error(
      "usage: setFavoriteMeta <source> <videoId> <page> [--display-title T] [--authors \"A1,A2\"] [--mode instr|vocal|none] [--apply]",
    );
    process.exit(2);
  }
  const src = positionals[0]!;
  const videoId = positionals[1]!;
  const pageStr = positionals[2]!;
  if (src !== "yt" && src !== "bili") {
    console.error(`bad source: ${src} (expected yt or bili)`);
    process.exit(2);
  }
  const page = Number(pageStr);
  if (!Number.isInteger(page) || page < 0) {
    console.error(`bad page: ${pageStr} (expected non-negative integer)`);
    process.exit(2);
  }
  const patch: FavoritePatch = {};
  if ("display-title" in values && values["display-title"] !== undefined) {
    const dt = values["display-title"];
    patch.displayTitle = dt.length === 0 ? null : dt;
  }
  if ("authors" in values && values.authors !== undefined) {
    patch.authors = parseAuthorsList(values.authors);
  }
  if ("mode" in values && values.mode !== undefined) {
    const m = values.mode;
    if (m === "none") patch.mode = null;
    else if (m === "instr" || m === "vocal") patch.mode = m;
    else {
      console.error(`bad mode: ${m} (expected instr | vocal | none)`);
      process.exit(2);
    }
  }
  return {
    source: src as Source,
    videoId,
    page,
    patch,
    apply: !!values.apply,
    actor: values.actor || "cli-set-meta",
  };
}

function describePatch(patch: FavoritePatch): string {
  const parts: string[] = [];
  if ("displayTitle" in patch)
    parts.push(`displayTitle = ${patch.displayTitle === null ? "NULL" : JSON.stringify(patch.displayTitle)}`);
  if ("authors" in patch)
    parts.push(`authors = ${patch.authors === null ? "NULL" : JSON.stringify(patch.authors)}`);
  if ("mode" in patch)
    parts.push(`mode = ${patch.mode === null ? "NULL" : patch.mode}`);
  return parts.length === 0 ? "(no fields specified)" : parts.join(", ");
}

async function main() {
  const args = parseCliArgs(process.argv);
  initDb();
  const before = findFavorite(args.source, args.videoId, args.page);
  if (!before) {
    console.error(
      `no favorite at (${args.source}, ${args.videoId}, p${args.page})`,
    );
    process.exit(1);
  }
  console.log(`# target: ${args.source} ${args.videoId} p${args.page}`);
  console.log(`# title : "${before.title}"`);
  console.log(`# before:`);
  console.log(`    displayTitle = ${before.displayTitle === undefined ? "NULL" : JSON.stringify(before.displayTitle)}`);
  console.log(`    authors      = ${before.authors === undefined ? "NULL" : JSON.stringify(before.authors)}`);
  console.log(`    mode         = ${before.mode === undefined ? "NULL" : before.mode}`);
  console.log(`# patch : ${describePatch(args.patch)}`);
  if (Object.keys(args.patch).length === 0) {
    console.log("nothing to do (no field flags supplied)");
    return;
  }
  if (!args.apply) {
    console.log("");
    console.log("dry-run only — re-run with --apply to commit");
    return;
  }
  const result = applyMetaPatch(args.source, args.videoId, args.page, args.patch, args.actor);
  if (!result.before) {
    console.error("update failed: row vanished between read and write");
    process.exit(1);
  }
  console.log("# after :");
  console.log(`    displayTitle = ${result.after?.displayTitle === undefined ? "NULL" : JSON.stringify(result.after?.displayTitle)}`);
  console.log(`    authors      = ${result.after?.authors === undefined ? "NULL" : JSON.stringify(result.after?.authors)}`);
  console.log(`    mode         = ${result.after?.mode === undefined ? "NULL" : result.after?.mode}`);
  console.log("applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
