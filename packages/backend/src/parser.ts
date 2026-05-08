import type { ParsedSongMeta, Source, SongRef } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY-LOAD-BEARING ALLOWLIST
//
// `parseLink` and `parseRef` MUST only ever read these query params from a
// user-supplied URL:
//   - YouTube: `v` (the video id)
//   - Bilibili: `p` (the multipart page index)
//
// Every other query param (`spm_id_from`, `vd_source`, `share_source`,
// `from_spmid`, `is_story_h5`, `si`, `pp`, `t`, ...) is tracking / session
// data and MUST NOT be persisted, broadcast, logged, or echoed back. The
// returned ParsedSongMeta therefore only carries `{source, videoId, page?,
// title, thumb?, duration?}` — never the raw URL or any unrecognized param.
//
// See specs/link-parser/spec.md and specs/favorites/spec.md.
// ─────────────────────────────────────────────────────────────────────────────

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const BILI_HOSTS = new Set([
  "bilibili.com",
  "www.bilibili.com",
  "m.bilibili.com",
  "b23.tv",
]);

interface NormalizedRef {
  source: Source;
  videoId: string;
  page?: number;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/** Resolve b23.tv-style short links by following HTTP redirects up to 5 hops. */
async function resolveRedirects(url: string, max = 5): Promise<string> {
  let current = url;
  for (let i = 0; i < max; i++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": BROWSER_UA, "accept": "*/*" },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      return current;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return current;
      current = new URL(loc, current).toString();
      continue;
    }
    return current;
  }
  return current;
}

/** Pull the first http(s) URL out of a string — tolerates messy share text
 * like "【某某 - 哔哩哔哩】 https://b23.tv/abc". */
function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)\]）】"'<>]+/i);
  return m ? m[0] : null;
}

function parseYouTube(u: URL): NormalizedRef | null {
  const host = u.hostname.toLowerCase();
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\/+/, "").split("/")[0];
    if (id) return { source: "yt", videoId: id };
    return null;
  }
  if (u.pathname.startsWith("/watch")) {
    const v = u.searchParams.get("v");
    if (v) return { source: "yt", videoId: v };
  }
  const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
  if (m) return { source: "yt", videoId: m[2]! };
  return null;
}

function parseBilibili(u: URL): NormalizedRef | null {
  const m = u.pathname.match(/\/video\/(BV[0-9A-Za-z]+|av\d+)/i);
  if (!m) return null;
  const videoId = m[1]!;
  const pageRaw = u.searchParams.get("p");
  const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : undefined;
  return { source: "bili", videoId, page };
}

async function fetchYouTubeMeta(videoId: string): Promise<Partial<ParsedSongMeta>> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { headers: { "user-agent": "litektv-backend/0.1" } },
    );
    if (!r.ok) return {};
    const j = (await r.json()) as { title?: string; thumbnail_url?: string };
    return {
      title: j.title,
      thumb: j.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return { thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
  }
}

async function fetchBilibiliMeta(
  videoId: string,
  page: number,
): Promise<Partial<ParsedSongMeta>> {
  const isAv = /^av/i.test(videoId);
  const qs = isAv ? `aid=${videoId.slice(2)}` : `bvid=${videoId}`;
  try {
    const r = await fetch(`https://api.bilibili.com/x/web-interface/view?${qs}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; litektv-backend/0.1; +https://github.com/memset0/litektv)",
        referer: "https://www.bilibili.com/",
      },
    });
    if (!r.ok) return {};
    const j = (await r.json()) as {
      code: number;
      data?: {
        title?: string;
        pic?: string;
        duration?: number;
        cid?: number;
        pages?: { page: number; part: string; duration: number; cid?: number }[];
      };
    };
    if (j.code !== 0 || !j.data) return {};
    const d = j.data;
    let title = d.title;
    let duration = d.duration;
    // Pick the cid for the requested page; fall back to the first page's
    // cid, then to the top-level data.cid (single-part videos sometimes
    // report `cid` only at the top level).
    let cid: number | undefined;
    if (d.pages && d.pages.length > 0) {
      const pg = d.pages.find((p) => p.page === page) ?? d.pages[0];
      if (pg) {
        cid = pg.cid;
        // Multi-page: also fold `- P{n} {part}` into the title and use
        // the per-page duration. Single-page videos skip this — their
        // top-level title already reads naturally.
        if (d.pages.length > 1 && page >= 1 && pg.page === page) {
          title = `${d.title} - P${pg.page} ${pg.part}`;
          duration = pg.duration;
        }
      }
    }
    if (cid === undefined) cid = d.cid;
    return { title, thumb: d.pic, duration, cid };
  } catch {
    return {};
  }
}

export async function parseLink(rawInput: string): Promise<ParsedSongMeta> {
  const trimmed = (rawInput ?? "").trim();
  // Accept inputs like "【title - 哔哩哔哩】 https://b23.tv/xyz" — pull the
  // URL out before parsing so callers don't have to scrub share text.
  let resolved = extractUrl(trimmed);
  let u: URL | null = null;
  if (resolved) {
    try { u = new URL(resolved); } catch { u = null; }
  }
  if (u && (u.hostname.toLowerCase() === "b23.tv" || u.hostname.toLowerCase().endsWith(".b23.tv"))) {
    resolved = await resolveRedirects(resolved!);
    try { u = new URL(resolved); } catch { /* keep previous u */ }
  }
  let ref: NormalizedRef | null = null;
  if (u) {
    const host = u.hostname.toLowerCase();
    if (YT_HOSTS.has(host)) ref = parseYouTube(u);
    else if (BILI_HOSTS.has(host) || host.endsWith(".bilibili.com")) ref = parseBilibili(u);
  }
  // Last-resort fallbacks scan the raw input for ID patterns. Order matters:
  // BV / av (bilibili) before naked YouTube IDs since YT's pattern is broader.
  if (!ref) {
    const bv = trimmed.match(/(BV[0-9A-Za-z]{10})/);
    if (bv) ref = { source: "bili", videoId: bv[1]! };
  }
  if (!ref) {
    const av = trimmed.match(/\bav(\d{1,12})\b/i);
    if (av) ref = { source: "bili", videoId: "av" + av[1]! };
  }
  if (!ref) throw new Error("unsupported url");

  return finalizeMeta(ref);
}

/**
 * Re-fetch metadata for an already-canonical reference. Skips URL
 * extraction, redirect resolution, and ID pattern scanning. Useful when the
 * ref came from a stored favorite or a client that already canonicalized.
 */
export async function parseRef(ref: SongRef): Promise<ParsedSongMeta> {
  if (ref.source !== "yt" && ref.source !== "bili") {
    throw new Error("unsupported source");
  }
  if (!ref.videoId || ref.videoId.length > 64) {
    throw new Error("bad videoId");
  }
  const page = ref.source === "bili" ? Math.max(1, ref.page ?? 1) : undefined;
  return finalizeMeta({ source: ref.source, videoId: ref.videoId, page });
}

async function finalizeMeta(ref: NormalizedRef): Promise<ParsedSongMeta> {
  const meta =
    ref.source === "yt"
      ? await fetchYouTubeMeta(ref.videoId)
      : await fetchBilibiliMeta(ref.videoId, ref.page ?? 1);

  return {
    source: ref.source,
    videoId: ref.videoId,
    page: ref.source === "bili" ? ref.page ?? 1 : undefined,
    cid: ref.source === "bili" ? meta.cid : undefined,
    title: meta.title ?? `${ref.source === "yt" ? "YouTube" : "Bilibili"} ${ref.videoId}`,
    // Always return a same-origin proxy URL (handled by the thumbnail-cache
    // capability at /api/thumb). The upstream metadata fetch may also return a
    // raw CDN URL; we ignore it in favor of the proxy so callers never have to
    // think about CDN quirks (Bilibili http://, hot-link policies, etc.).
    thumb: `/api/thumb?source=${ref.source}&id=${encodeURIComponent(ref.videoId)}`,
    duration: meta.duration,
  };
}
