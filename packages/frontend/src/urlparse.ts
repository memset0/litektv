// urlparse.ts — parse Bilibili / YouTube URLs (incl. short links).
//
// Privacy: only canonical fields flow downstream. The original URL is
// intentionally dropped so it never lands in a queue/favorite payload.

import type { Source } from "@litektv/types";

export interface ExtractedRef {
  source: Source;
  videoId: string;
}

export interface ParsedSong {
  source: Source;
  videoId: string;
  page?: number;
  /** Bilibili per-page content-id (see `Song.cid` in @litektv/types). */
  cid?: number;
  title?: string | null;
  thumb?: string | null;
  duration?: number;
}

export function extractFromText(text: string): ExtractedRef | null {
  const t = (text || "").trim();
  // ── YouTube ────────────────────────────────────────────────
  let m = t.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (m && m[1]) return { source: "yt", videoId: m[1].slice(0, 11) };
  m = t.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m && m[1]) return { source: "yt", videoId: m[1].slice(0, 11) };
  m = t.match(/youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/i);
  if (m && m[1]) return { source: "yt", videoId: m[1].slice(0, 11) };

  // ── Bilibili ───────────────────────────────────────────────
  m = t.match(/(BV[0-9A-Za-z]{6,})/);
  if (m && m[1]) return { source: "bili", videoId: m[1] };
  m = t.match(/\/video\/av(\d+)/i);
  if (m && m[1]) return { source: "bili", videoId: "av" + m[1] };
  return null;
}

async function resolveShortLink(url: string): Promise<ExtractedRef> {
  const candidates = [
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?",
  ];
  let lastErr: unknown = null;
  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(base + encodeURIComponent(url), { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const txt = await res.text();
      const found = extractFromText(txt);
      if (found) return found;
    } catch (e) { lastErr = e; }
  }
  const detail = lastErr instanceof Error ? lastErr.message : "代理不可用";
  throw new Error("无法解析短链：" + detail + "（请尝试粘贴完整链接）");
}

async function parseViaBackend(text: string): Promise<ParsedSong> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch("/api/parse-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: text }),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
  if (!res.ok) {
    let detail = "HTTP " + res.status;
    try {
      const j = await res.json();
      if (j && typeof j.error === "string") detail = j.error;
    } catch {}
    throw new Error(detail);
  }
  const j = await res.json();
  return {
    source: j.source as Source,
    videoId: j.videoId as string,
    page: j.page,
    cid: j.cid,
    title: j.title || null,
    thumb: j.thumb || null,
    duration: j.duration,
  };
}

export async function parseAddSong(text: string): Promise<ParsedSong | ExtractedRef> {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("请输入链接");
  const urlMatch = trimmed.match(/https?:\/\/[^\s)\]）】"'<>]+/i);
  const candidate = urlMatch ? urlMatch[0] : trimmed;
  try { return await parseViaBackend(candidate); }
  catch (e) {
    const direct = extractFromText(candidate);
    if (direct) return direct;
    if (/b23\.tv\//i.test(candidate) || /^https?:\/\/(www\.)?bili2233\.cn/i.test(candidate)) {
      return resolveShortLink(candidate);
    }
    const msg = e instanceof Error && e.message ? "解析失败：" + e.message : "无法识别该链接（仅支持 Bilibili / YouTube）";
    throw new Error(msg);
  }
}

export interface EmbedOpts {
  startSec?: number;
  autoplay?: boolean;
  mute?: boolean;
  hideChrome?: boolean;
}

export function embedUrl(
  song: { source: Source; videoId: string; page?: number; cid?: number },
  opts: EmbedOpts = {},
): string {
  const { startSec = 0, autoplay = true, mute = false, hideChrome = false } = opts;
  if (song.source === "yt") {
    const params = new URLSearchParams({
      enablejsapi: "1",
      autoplay: autoplay ? "1" : "0",
      rel: "0",
      modestbranding: "1",
      start: String(Math.floor(startSec || 0)),
      playsinline: "1",
      origin: window.location.origin,
    });
    if (mute) params.set("mute", "1");
    if (hideChrome) params.set("controls", "0");
    return `https://www.youtube.com/embed/${song.videoId}?${params.toString()}`;
  }
  if (song.source === "bili") {
    const isBV = String(song.videoId).startsWith("BV");
    const idParam = isBV ? `bvid=${song.videoId}` : `aid=${song.videoId.replace(/^av/, "")}`;
    // Page selector — emit BOTH `cid=N` AND `p=N`, because the two players
    // we ride on have different ideas about which one to honor:
    //
    //   * Desktop UA → player.html (the URL we hit) keeps loading itself
    //     and uses `cid=N` reliably.
    //   * Mobile UA  → player.html's inline JS detects the UA, redirects
    //     to www.bilibili.com/blackboard/webplayer/mbplayer.html with the
    //     same querystring, and that mobile player ignores `cid=` and
    //     selects the page from `p=N` instead. (Verified May 2026 by
    //     reading player.html's UA-branch source.)
    //
    // Sending both keeps the URL self-describing and works on both. The
    // legacy `page=N` parameter is dropped — desktop honors cid, mobile
    // honors p, neither needs page anymore.
    const params: string[] = [idParam];
    if (song.cid) params.push(`cid=${song.cid}`);
    params.push(`p=${song.page || 1}`);
    params.push(
      `autoplay=${autoplay ? 1 : 0}`,
      `t=${Math.floor(startSec || 0)}`,
      `high_quality=1`,
      `danmaku=0`,
      `as_wide=1`,
    );
    return `https://player.bilibili.com/player.html?${params.join("&")}`;
  }
  return "about:blank";
}

export function fallbackTitle(song: { source: Source; videoId: string }): string {
  if (song.source === "yt") return `YouTube · ${song.videoId}`;
  return `Bilibili · ${song.videoId}`;
}

export function thumbUrl(song: { source: Source; videoId: string }): string | null {
  if (song.source === "yt") return `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`;
  return null;
}

export interface MetaResult {
  title: string | null;
  thumb: string | null;
}

export async function fetchMeta(song: { source: Source; videoId: string }): Promise<MetaResult> {
  try {
    if (song.source === "yt") {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${song.videoId}`);
      if (res.ok) {
        const j = await res.json();
        return { title: j.title || null, thumb: j.thumbnail_url || thumbUrl(song) };
      }
    } else if (song.source === "bili") {
      const proxies = ["https://api.allorigins.win/raw?url=", "https://corsproxy.io/?"];
      for (const p of proxies) {
        try {
          const u = `https://api.bilibili.com/x/web-interface/view?bvid=${song.videoId}`;
          const res = await fetch(p + encodeURIComponent(u));
          if (!res.ok) continue;
          const j = await res.json();
          if (j.code === 0 && j.data) {
            return { title: j.data.title, thumb: j.data.pic };
          }
        } catch {}
      }
    }
  } catch {}
  return { title: null, thumb: thumbUrl(song) };
}
