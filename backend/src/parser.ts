import type { ParsedSongMeta, Source } from "./types.js";

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

/** Resolve b23.tv-style short links by following HTTP redirects up to 5 hops. */
async function resolveRedirects(url: string, max = 5): Promise<string> {
  let current = url;
  for (let i = 0; i < max; i++) {
    let res: Response;
    try {
      res = await fetch(current, { method: "HEAD", redirect: "manual" });
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
        pages?: { page: number; part: string; duration: number }[];
      };
    };
    if (j.code !== 0 || !j.data) return {};
    const d = j.data;
    let title = d.title;
    let duration = d.duration;
    if (d.pages && d.pages.length > 1 && page >= 1) {
      const pg = d.pages.find((p) => p.page === page);
      if (pg) {
        title = `${d.title} - P${pg.page} ${pg.part}`;
        duration = pg.duration;
      }
    }
    return { title, thumb: d.pic, duration };
  } catch {
    return {};
  }
}

export async function parseLink(rawUrl: string): Promise<ParsedSongMeta> {
  let resolved = rawUrl.trim();
  let u: URL;
  try {
    u = new URL(resolved);
  } catch {
    throw new Error("invalid url");
  }
  if (u.hostname.toLowerCase() === "b23.tv") {
    resolved = await resolveRedirects(resolved);
    u = new URL(resolved);
  }
  const host = u.hostname.toLowerCase();
  let ref: NormalizedRef | null = null;
  if (YT_HOSTS.has(host)) ref = parseYouTube(u);
  else if (BILI_HOSTS.has(host)) ref = parseBilibili(u);
  if (!ref) throw new Error("unsupported url");

  const meta =
    ref.source === "yt"
      ? await fetchYouTubeMeta(ref.videoId)
      : await fetchBilibiliMeta(ref.videoId, ref.page ?? 1);

  return {
    source: ref.source,
    videoId: ref.videoId,
    page: ref.source === "bili" ? ref.page ?? 1 : undefined,
    title: meta.title ?? `${ref.source === "yt" ? "YouTube" : "Bilibili"} ${ref.videoId}`,
    thumb: meta.thumb ?? null,
    duration: meta.duration,
  };
}

export function thumbUrlFor(source: Source, id: string): string | null {
  if (source === "yt") return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return null;
}
