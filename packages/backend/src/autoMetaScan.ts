/**
 * CLI: scan all favorites and try to auto-fill (display_title, authors, mode)
 * from the imported title using a small set of high-confidence heuristics.
 * Skips any row whose manual-metadata fields are already non-NULL — never
 * overwrites a curated row.
 *
 * Default is dry-run; --apply commits via the same `applyMetaPatch` path
 * the interactive setFavoriteMeta CLI uses, so audit semantics are identical.
 *
 * Usage:
 *   pnpm --dir packages/backend tsx src/autoMetaScan.ts             # dry-run
 *   pnpm --dir packages/backend tsx src/autoMetaScan.ts --apply     # commit
 *
 *   DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
 *     pnpm --dir packages/backend tsx src/autoMetaScan.ts --apply
 *
 * Local-shell only. NO HTTP / WS exposure.
 */

import { initDb, listFavorites } from "./db.js";
import type { Favorite, FavoriteMode } from "./types.js";
import { applyMetaPatch } from "./favoriteMetaOps.js";

interface Heuristic {
  mode?: FavoriteMode;
  displayTitle?: string;
  authors?: string[];
  pattern?: string;
}

const NOISE = new Set([
  "伴奏", "原唱", "字幕版", "字幕", "无水印", "高品质", "带和声", "带字幕",
  "主旋律", "无原声", "无人声", "无主音", "国语", "粤语", "MV", "和声",
  "卡拉OK", "KTV", "off vocal", "off_vocal", "on vocal", "on_vocal",
  "inst", "instrumental", "inst.", "纯K", "纯k", "投屏", "自用",
  "MV伴奏", "原唱版", "伴奏版", "MV伴奏版",
]);

function looksLikeNoise(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 30) return true;
  if (NOISE.has(t)) return true;
  if (/^(?:KTV|MV|HD|HI[- ]?RES|UP)\b/i.test(t)) return true;
  // Reject things that are mostly punctuation / digits.
  if (/^[\d\s\-_·●▶（）()【】《》\.]+$/.test(t)) return true;
  return false;
}

// Strict per-piece validation — applied AFTER an extraction looks plausible
// to ensure we don't write a partial / noise-contaminated value to the DB.
// Coverage matters less than precision here; rejecting borderline rows is
// the right call (the user can fill them in manually via setFavoriteMeta).
const PIECE_NOISE_RE =
  /伴奏|原唱|KTV|卡拉OK|MV|字幕|无水印|高品质|带和声|和声|主旋律|off[\s_]?vocal|on[\s_]?vocal|inst(?:rumental)?(?:\s*ver)?|无原声|纯[Kk]|投屏|自用|国语|粤语|英文|日语|original|orig\b|ver\b/i;
const PIECE_BAD_CHARS_RE = /[-—–_·●▶/▶（）()【】《》\.,，。…\s]/;

function validatePiece(s: string): boolean {
  const t = s.trim();
  if (t.length < 1 || t.length > 12) return false;
  if (PIECE_NOISE_RE.test(t)) return false;
  if (PIECE_BAD_CHARS_RE.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return true;
}

function validateDisplayTitle(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 20) return false;
  if (PIECE_NOISE_RE.test(t)) return false;
  // Allow spaces inside song names (e.g. "Never Gonna Give You Up") but
  // reject any structural separator that almost certainly indicates a
  // mis-parse (dash, underscore, slashes, brackets, dots).
  if (/[-—–_/▶（）()【】《》\.]/.test(t)) return false;
  // If the title contains whitespace, every word must be ≥2 chars. This
  // catches CJK trailing-fragment leaks like "陶喆 带" (where "带" is a
  // single dangling character that the tail-noise stripper missed).
  if (/\s/.test(t)) {
    for (const w of t.split(/\s+/)) {
      if (w.length < 2) return false;
    }
  }
  return true;
}

function validateExtraction(h: Heuristic): boolean {
  if (!h.displayTitle || !h.authors || h.authors.length === 0) return false;
  if (!validateDisplayTitle(h.displayTitle)) return false;
  for (const a of h.authors) {
    if (!validatePiece(a)) return false;
  }
  return true;
}

function detectMode(text: string): FavoriteMode | undefined {
  const isInstr = /伴奏|无原声|无人声|无主音|off[\s_]?vocal|inst(?:rumental)?(?:\s*ver\.?)?\b/i.test(text);
  const isVocal = /原唱|on[\s_]?vocal\b|原版|有原声/i.test(text);
  if (isInstr && !isVocal) return "instr";
  if (isVocal && !isInstr) return "vocal";
  if (isInstr && isVocal) {
    // Both markers; the LAST one near the tail of the string usually wins.
    const lastInstr = Math.max(
      text.lastIndexOf("伴奏"),
      text.toLowerCase().lastIndexOf("off vocal"),
      text.toLowerCase().lastIndexOf("off_vocal"),
    );
    const lastVocal = Math.max(
      text.lastIndexOf("原唱"),
      text.toLowerCase().lastIndexOf("on vocal"),
      text.toLowerCase().lastIndexOf("on_vocal"),
    );
    if (lastInstr > lastVocal) return "instr";
    if (lastVocal > lastInstr) return "vocal";
  }
  return undefined;
}

/**
 * Strip a few common "noise containers" from the title — leading 【...】 and
 * (bracketed) prefixes that typically carry metadata about the upload itself
 * (KTV投屏自用, 纯K, etc.) rather than the song.
 */
function stripContainers(s: string): string {
  let out = s;
  // Repeated leading bracket groups
  for (let i = 0; i < 6; i++) {
    const next = out.replace(/^【[^】]*】+\s*/, "")
      .replace(/^[（(][^)）]*[)）]\s*/, "");
    if (next === out) break;
    out = next;
  }
  // Embedded brackets in the middle — drop them
  out = out
    .replace(/【[^】]*】/g, " ")
    .replace(/[（(][^)）]*[)）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

/** Strip trailing tail noise tokens (... 伴奏 / KTV / 字幕 / 无水印 / 高品质 / ...). */
function stripTailNoise(s: string): string {
  let out = s;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(
      /\s*(?:伴奏|原唱|字幕版?|无水印|高品质|带和声|带字幕|主旋律.*|无原声|国语|粤语|MV|和声|卡拉OK|KTV|off[ _]?vocal|on[ _]?vocal|inst(?:rumental)?(?:\s*ver\.?)?\b)\s*$/gi,
      "",
    ).trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

function analyzeTitle(rawTitle: string, page: number): Heuristic {
  let mode: FavoriteMode | undefined;

  // Multi-page Bilibili rows often end with " - P{n} <subtitle>". Try the
  // page-scoped subtitle first since it's the most authoritative for the
  // specific page.
  let pageScope: string | undefined;
  if (page > 0) {
    const m = rawTitle.match(new RegExp(`P${page}\\s+(.+?)$`));
    if (m) pageScope = m[1];
  }
  if (pageScope) mode = detectMode(pageScope);
  if (!mode) mode = detectMode(rawTitle);

  // Pattern B: page-suffix "P{n} SONG_ARTIST[_LANG]"
  if (page > 0 && pageScope) {
    const m = pageScope.match(/^([^_\s][^_]*?)_([^_\s][^_]+?)(?:_[^_]+)?\s*(?:【[^】]*】)?\s*$/);
    if (m) {
      const [, song, artist] = m;
      // Bail out when the second token is clearly a mode/lang label rather
      // than an artist name. Without this check titles like
      // "白鸟过河滩_off_vocal" become {song: 白鸟过河滩, artist: off} which is
      // dead wrong.
      const artistIsModeLabel =
        /^(?:off|on|inst(?:rumental)?|vocal|original|orig|ver\.?|国语|粤语|英文|日语)$/i.test(
          artist!.trim(),
        );
      if (!looksLikeNoise(song!) && !looksLikeNoise(artist!) && !artistIsModeLabel) {
        return { mode, displayTitle: song!.trim(), authors: [artist!.trim()], pattern: "B-page-underscore" };
      }
    }
    // Pattern B': "P{n} ARTIST - SONG"
    const stripped = stripTailNoise(stripContainers(pageScope));
    const dash = stripped.match(/^([^\-—–]+?)\s*[-—–]\s*(.+)$/);
    if (dash) {
      const a = dash[1]!.trim(), b = dash[2]!.trim();
      if (!looksLikeNoise(a) && !looksLikeNoise(b)) {
        return { mode, displayTitle: b, authors: [a], pattern: "B-page-dash" };
      }
    }
  }

  // Pattern A: ARTIST-SONG (most common Chinese title shape).
  // First strip ALL multi-page suffixes "- P{n} <...>" so they don't leak in.
  let s = rawTitle.replace(/\s*[-—–]\s*P\d+\s+.*$/i, "");
  s = stripContainers(s);
  s = stripTailNoise(s);
  const dash = s.match(/^([^\-—–]+?)\s*[-—–]\s*(.+)$/);
  if (dash) {
    const a = dash[1]!.trim(), b = dash[2]!.trim();
    if (!looksLikeNoise(a) && !looksLikeNoise(b)) {
      return { mode, displayTitle: b, authors: [a], pattern: "A-dash" };
    }
  }

  // Pattern C: 《SONG》 in the title with names listed before/after.
  const c = rawTitle.match(/《([^》]+)》/);
  if (c) {
    const song = c[1]!.trim();
    if (!looksLikeNoise(song)) {
      // Strip the 《》 segment + containers + multi-page suffix; what's left
      // is the artist zone.
      let zone = rawTitle.replace(/《[^》]+》/g, " ");
      zone = zone.replace(/\s*[-—–]\s*P\d+\s+.*$/i, "");
      zone = stripContainers(zone);
      zone = stripTailNoise(zone);
      // Drop ARTIST-SONG style noise too in case there was a "ARTIST-" prefix
      zone = zone.replace(/[　\s]+/g, " ").trim();
      // Authors: split on whitespace or comma. Filter noise.
      const candidates = zone
        .split(/[\s,，、/]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !looksLikeNoise(t));
      if (candidates.length >= 1 && candidates.length <= 4) {
        return { mode, displayTitle: song, authors: candidates, pattern: "C-bookquotes" };
      }
    }
  }

  return { mode };
}

interface ScanRow {
  fav: Favorite;
  result: Heuristic;
  ready: boolean;
  reason: string;
}

function classify(fav: Favorite): ScanRow {
  // Skip if any manual field is already set — never overwrite curated rows.
  const hasManual = !!fav.displayTitle || (fav.authors && fav.authors.length > 0) || !!fav.mode;
  if (hasManual) {
    return {
      fav,
      result: {},
      ready: false,
      reason: "skip-already-curated",
    };
  }
  const r = analyzeTitle(fav.title, fav.page);
  if (r.mode && r.displayTitle && r.authors && r.authors.length > 0) {
    if (validateExtraction(r)) {
      return { fav, result: r, ready: true, reason: r.pattern || "ok" };
    }
    return {
      fav,
      result: r,
      ready: false,
      reason: `rejected:validate-failed(displayTitle="${r.displayTitle}", authors=[${r.authors.join(",")}])`,
    };
  }
  // Partial — note what's missing
  const missing: string[] = [];
  if (!r.mode) missing.push("mode");
  if (!r.displayTitle) missing.push("displayTitle");
  if (!r.authors || r.authors.length === 0) missing.push("authors");
  return { fav, result: r, ready: false, reason: `partial:missing=${missing.join(",")}` };
}

async function main() {
  const apply = process.argv.includes("--apply");
  initDb();
  const favs = listFavorites();
  const rows = favs.map(classify);

  const ready = rows.filter((r) => r.ready);
  const skipCurated = rows.filter((r) => r.reason === "skip-already-curated");
  const partial = rows.filter((r) => !r.ready && r.reason !== "skip-already-curated");

  console.log(`# total favorites: ${favs.length}`);
  console.log(`# already curated, skipping: ${skipCurated.length}`);
  console.log(`# auto-fillable (all 3 derived): ${ready.length}`);
  console.log(`# unsure, skipping: ${partial.length}`);
  console.log("");

  if (ready.length > 0) {
    console.log("# proposed updates:");
    for (const r of ready) {
      console.log(
        `  ${r.fav.source} ${r.fav.videoId} p${r.fav.page}  [${r.reason}]`,
      );
      console.log(`    title : "${r.fav.title}"`);
      console.log(`    →     mode=${r.result.mode}, displayTitle="${r.result.displayTitle}", authors=[${(r.result.authors || []).map((a) => `"${a}"`).join(", ")}]`);
    }
    console.log("");
  }
  if (partial.length > 0) {
    console.log("# rows the scanner could NOT confidently parse (left untouched):");
    for (const r of partial) {
      const detected: string[] = [];
      if (r.result.mode) detected.push(`mode=${r.result.mode}`);
      if (r.result.displayTitle) detected.push(`displayTitle=${r.result.displayTitle}`);
      if (r.result.authors) detected.push(`authors=[${r.result.authors.join(",")}]`);
      console.log(
        `  ${r.fav.source} ${r.fav.videoId} p${r.fav.page}  partial(${detected.join(", ") || "none"})  ::  "${r.fav.title}"`,
      );
    }
    console.log("");
  }

  if (!apply) {
    console.log("dry-run only — re-run with --apply to commit");
    return;
  }
  if (ready.length === 0) {
    console.log("nothing to apply");
    return;
  }
  let applied = 0;
  for (const r of ready) {
    const result = applyMetaPatch(
      r.fav.source,
      r.fav.videoId,
      r.fav.page,
      {
        displayTitle: r.result.displayTitle,
        authors: r.result.authors,
        mode: r.result.mode,
      },
      "cli-auto-meta-scan",
    );
    if (result.before && result.after) applied++;
  }
  console.log(`applied: ${applied} update(s) (audit rows recorded with actor=cli-auto-meta-scan)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
