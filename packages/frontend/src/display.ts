// display.ts — single helper that decides between the structured form and
// the raw imported title for any rendered song. Per the favorites capability:
//
//   - If the song is in the global favorites snapshot AND that favorite has
//     ALL THREE manual-metadata fields populated (`displayTitle` non-empty,
//     `authors` length ≥ 1, `mode` ∈ {"instr","vocal"}) → render
//     `[伴奏|原唱] · [displayTitle] · [author1, author2, ...]`.
//   - Otherwise → render the raw `song.title` exactly as today.
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

const MODE_LABEL: Record<"instr" | "vocal", string> = {
  instr: "伴奏",
  vocal: "原唱",
};

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
  const authors = Array.isArray(fav.authors) ? fav.authors.filter((a) => !!a && a.length > 0) : [];
  const mode = fav.mode === "instr" || fav.mode === "vocal" ? fav.mode : null;
  // ALL THREE must be populated. Any missing piece falls through to raw.
  if (!dt || authors.length === 0 || !mode) return raw;
  return `${MODE_LABEL[mode]} · ${dt} · ${authors.join(", ")}`;
}
