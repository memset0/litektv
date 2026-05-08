// pinyin-search.ts — search index for the catalog modal.
//
// We compute three indexes per song title and match a query if it is a
// contiguous lowercase substring of any of them:
//   - full  : full pinyin, no separators (e.g. "小镇姑娘" -> "xiaozhenguniang")
//   - first : pinyin initials (e.g. "小镇姑娘" -> "xzgn")
//   - lower : the original title lowercased (so English titles work too)

import { pinyin } from "pinyin-pro";
import type { Favorite } from "@litektv/types";

export interface SearchIndex {
  lower: string;
  full: string;
  first: string;
}

export function buildIndex(title: string): SearchIndex {
  const t = String(title || "");
  const lower = t.toLowerCase();
  let full = lower;
  let first = lower;
  try {
    full = pinyin(t, {
      toneType: "none",
      type: "string",
      v: true,
      nonZh: "consecutive",
    });
  } catch {}
  try {
    first = pinyin(t, {
      pattern: "first",
      toneType: "none",
      type: "string",
      v: true,
      nonZh: "consecutive",
    });
  } catch {}
  return {
    lower,
    full: full.replace(/\s+/g, "").toLowerCase(),
    first: first.replace(/\s+/g, "").toLowerCase(),
  };
}

const indexCache = new Map<string, SearchIndex>();

export function indexFor(fav: Favorite): SearchIndex {
  const key = `${fav.source}:${fav.videoId}:${fav.page ?? 0}:${fav.title || ""}`;
  let v = indexCache.get(key);
  if (!v) {
    v = buildIndex(fav.title);
    indexCache.set(key, v);
  }
  return v;
}

export function matchQuery(query: string, idx: SearchIndex): boolean {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return idx.lower.includes(q) || idx.full.includes(q) || idx.first.includes(q);
}

export function filterFavorites(favorites: Favorite[], query: string): Favorite[] {
  if (!query || !query.trim()) return favorites;
  const out: Favorite[] = [];
  for (const f of favorites) {
    if (matchQuery(query, indexFor(f))) out.push(f);
  }
  return out;
}
