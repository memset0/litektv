import { type CachedThumb, getThumb, putThumb } from "./db.js";
import type { Source } from "./types.js";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_TIMEOUT_MS = 8000;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

interface FetchedImage {
  mime: string;
  bytes: Buffer;
}

async function fetchImage(url: string, headers: Record<string, string> = {}): Promise<FetchedImage> {
  const res = await fetch(url, {
    headers: { "user-agent": BROWSER_UA, ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const ct = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ct.startsWith("image/")) throw new Error(`upstream non-image content-type: ${ct || "(missing)"}`);
  const ab = await res.arrayBuffer();
  return { mime: ct, bytes: Buffer.from(ab) };
}

async function fetchYouTubeThumb(videoId: string): Promise<FetchedImage> {
  return fetchImage(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
}

async function fetchBilibiliThumb(videoId: string): Promise<FetchedImage> {
  // Resolve the upstream pic URL via the same view API the parser uses,
  // independently — keeps the cache module decoupled from the parser.
  const isAv = /^av/i.test(videoId);
  const qs = isAv ? `aid=${videoId.slice(2)}` : `bvid=${videoId}`;
  const apiRes = await fetch(`https://api.bilibili.com/x/web-interface/view?${qs}`, {
    headers: { "user-agent": BROWSER_UA, referer: "https://www.bilibili.com/" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!apiRes.ok) throw new Error(`bili view api ${apiRes.status}`);
  const j = (await apiRes.json()) as { code: number; data?: { pic?: string } };
  if (j.code !== 0 || !j.data?.pic) throw new Error(`bili view api code=${j.code}`);
  // Bilibili returns http://; the same path works fine over https://.
  const picUrl = j.data.pic.replace(/^http:\/\//i, "https://");
  return fetchImage(picUrl, { referer: "https://www.bilibili.com/" });
}

/**
 * Read a cover from cache, or fetch + cache it on miss.
 * Throws on upstream failure; the caller decides the HTTP response status.
 */
export async function getOrFetchThumb(
  source: Source,
  videoId: string,
): Promise<CachedThumb> {
  const now = Date.now();
  const cached = getThumb(source, videoId);
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached;
  }
  let fetched: FetchedImage;
  try {
    fetched = source === "yt"
      ? await fetchYouTubeThumb(videoId)
      : await fetchBilibiliThumb(videoId);
  } catch (e) {
    // On error, keep any stale row we have rather than poisoning the cache.
    if (cached) return cached;
    throw e;
  }
  putThumb(source, videoId, fetched.mime, fetched.bytes, now);
  return { mime: fetched.mime, bytes: fetched.bytes, fetchedAt: now };
}
