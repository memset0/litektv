// display.ts — single helper that decides between the structured form and
// the raw imported title for any rendered song.
//
// Rendering rule (per the favorites capability):
//
//   - If the song is in the global favorites snapshot AND that favorite has
//     `displayTitle` non-empty AND `authors.length ≥ 1`, render the
//     **structured form**:
//       - `mode` absent / "instr"  → `<authors> - <displayTitle>`
//         (伴奏 is the default for KTV use; no explicit suffix.)
//       - `mode === "vocal"`        → `<authors> - <displayTitle>（原唱）`
//     Multiple authors join with `, `.
//   - Otherwise (not favorited, or missing displayTitle / authors) → render
//     the raw `song.title` unchanged.
//
// The helper is a pure render-time function. It does not mutate any record.

import type { Favorite } from "@litektv/types";

interface SongLike {
  source?: string;
  videoId?: string;
  page?: number;
  title?: string;
}

/** Build a Map<key, Favorite> for O(1) lookups during a render pass. */
export function favoritesByKey(favorites: Favorite[]): Map<string, Favorite> {
  const m = new Map<string, Favorite>();
  for (const f of favorites) {
    m.set(`${f.source}|${f.videoId}|${f.page}`, f);
  }
  return m;
}

function keyOf(song: SongLike): string | null {
  if (!song?.source || !song.videoId) return null;
  const page = song.source === "bili" ? (song.page ?? 1) : 0;
  return `${song.source}|${song.videoId}|${page}`;
}

export function formatSongTitle(
  song: SongLike,
  favs: Map<string, Favorite>,
): string {
  const raw = typeof song.title === "string" ? song.title : "";
  const k = keyOf(song);
  if (!k) return raw;
  const fav = favs.get(k);
  if (!fav) return raw;
  const dt = typeof fav.displayTitle === "string" ? fav.displayTitle.trim() : "";
  const authors = Array.isArray(fav.authors)
    ? fav.authors.filter((a) => !!a && a.length > 0)
    : [];
  // displayTitle + authors are required for the structured form. mode is
  // optional: only "vocal" adds the （原唱）suffix; "instr" / null / undefined
  // are the implicit default and render with no suffix.
  if (!dt || authors.length === 0) return raw;
  const base = `${authors.join(", ")} - ${dt}`;
  return fav.mode === "vocal" ? `${base}（原唱）` : base;
}
