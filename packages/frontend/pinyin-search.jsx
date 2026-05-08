// pinyin-search.jsx — search index helpers for the catalog modal.
//
// We compute three indexes per song title and match a query if it is a
// contiguous lowercase substring of any of them:
//   - full  : full pinyin, no separators (e.g. "小镇姑娘" -> "xiaozhenguniang")
//   - first : pinyin initials (e.g. "小镇姑娘" -> "xzgn")
//   - lower : the original title lowercased (so English titles work too)
//
// Backed by `pinyin-pro` (UMD bundle pulled in from KTV.html). When that
// library hasn't loaded for some reason we still match on `lower` so the
// drawer remains usable.

(function () {
  function safePinyin(text, opts) {
    try {
      const lib = window.pinyinPro;
      if (lib && typeof lib.pinyin === "function") {
        return lib.pinyin(text, opts);
      }
    } catch {}
    return null;
  }

  function buildIndex(title) {
    const t = String(title || "");
    const lower = t.toLowerCase();
    const full = safePinyin(t, { toneType: "none", type: "string", v: true, nonZh: "consecutive" });
    const first = safePinyin(t, { pattern: "first", toneType: "none", type: "string", v: true, nonZh: "consecutive" });
    return {
      lower,
      full: (full || lower).replace(/\s+/g, "").toLowerCase(),
      first: (first || lower).replace(/\s+/g, "").toLowerCase(),
    };
  }

  // Per-(source,videoId,page) memo so re-renders don't recompute pinyin.
  const indexCache = new Map();
  function indexFor(fav) {
    const key = `${fav.source}:${fav.videoId}:${fav.page ?? 0}:${fav.title || ""}`;
    let v = indexCache.get(key);
    if (!v) {
      v = buildIndex(fav.title);
      indexCache.set(key, v);
    }
    return v;
  }

  function matchQuery(query, idx) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return idx.lower.includes(q) || idx.full.includes(q) || idx.first.includes(q);
  }

  /** Filter and return favorites whose computed indexes match `query`. The
   *  input order (added_at desc, server-side) is preserved for matches. */
  function filterFavorites(favorites, query) {
    if (!query || !query.trim()) return favorites;
    const out = [];
    for (const f of favorites) {
      if (matchQuery(query, indexFor(f))) out.push(f);
    }
    return out;
  }

  window.KTV = window.KTV || {};
  window.KTV.search = { buildIndex, indexFor, matchQuery, filterFavorites };
})();
