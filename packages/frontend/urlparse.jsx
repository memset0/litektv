// urlparse.jsx — parse Bilibili / YouTube URLs (incl. short links)

(function () {
  // Returns { source: 'yt'|'bili', videoId } or null if no match.
  // NOTE: privacy — only canonical fields. The original URL is intentionally
  // dropped so it never flows downstream into a queue/favorite payload.
  function extractFromText(text) {
    text = (text || "").trim();
    // ── YouTube patterns ────────────────────────────────────
    // youtu.be/<id>
    let m = text.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
    if (m) return { source: "yt", videoId: m[1].slice(0, 11) };
    // youtube.com/watch?v=<id>
    m = text.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (m) return { source: "yt", videoId: m[1].slice(0, 11) };
    // youtube.com/shorts/<id>  or /embed/<id>  or /live/<id>
    m = text.match(/youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/i);
    if (m) return { source: "yt", videoId: m[1].slice(0, 11) };

    // ── Bilibili patterns ───────────────────────────────────
    // bilibili.com/video/BVxxxx  or BVxxxx
    m = text.match(/(BV[0-9A-Za-z]{6,})/);
    if (m) return { source: "bili", videoId: m[1] };
    // av number: bilibili.com/video/av12345
    m = text.match(/\/video\/av(\d+)/i);
    if (m) return { source: "bili", videoId: "av" + m[1] };
    return null;
  }

  async function resolveShortLink(url) {
    // Try a CORS proxy to follow the redirect and grab the final URL/HTML.
    const candidates = [
      "https://api.allorigins.win/raw?url=",
      "https://corsproxy.io/?",
    ];
    let lastErr = null;
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
    throw new Error("无法解析短链：" + (lastErr ? lastErr.message : "代理不可用") + "（请尝试粘贴完整链接）");
  }

  // Ask the backend to parse + fetch metadata. Same-origin so no CORS hassle
  // when the page is served by the backend (the production deploy does so).
  async function parseViaBackend(text) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res;
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
      try { const j = await res.json(); if (j && j.error) detail = j.error; } catch (e) {}
      throw new Error(detail);
    }
    const j = await res.json();
    return {
      source: j.source, videoId: j.videoId, page: j.page,
      title: j.title || null, thumb: j.thumb || null, duration: j.duration,
    };
  }

  async function parseAddSong(text) {
    text = (text || "").trim();
    if (!text) throw new Error("请输入链接");
    // Bilibili share strings come with prefixes like
    // "【某某 - 哔哩哔哩】 https://b23.tv/xxxx" — pull the URL out first.
    const urlMatch = text.match(/https?:\/\/[^\s)\]）】"'<>]+/i);
    const candidate = urlMatch ? urlMatch[0] : text;
    // Backend is authoritative (follows b23.tv redirects, fetches titles + thumbs).
    try { return await parseViaBackend(candidate); }
    catch (e) {
      const direct = extractFromText(candidate);
      if (direct) return direct;
      if (/b23\.tv\//i.test(candidate) || /^https?:\/\/(www\.)?bili2233\.cn/i.test(candidate)) {
        return resolveShortLink(candidate);
      }
      throw new Error(e.message ? "解析失败：" + e.message : "无法识别该链接（仅支持 Bilibili / YouTube）");
    }
  }

  // Generate iframe-ready src for a song
  function embedUrl(song, opts = {}) {
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
      const params = [
        idParam,
        `page=${song.page || 1}`,
        `autoplay=${autoplay ? 1 : 0}`,
        `t=${Math.floor(startSec || 0)}`,
        `high_quality=1`,
        `danmaku=0`,
        `as_wide=1`,
      ].join("&");
      return `https://player.bilibili.com/player.html?${params}`;
    }
    return "about:blank";
  }

  // Display title best-effort. Without backend metadata we use a label.
  function fallbackTitle(song) {
    if (song.source === "yt") return `YouTube · ${song.videoId}`;
    return `Bilibili · ${song.videoId}`;
  }

  // Best-effort thumbnail (no fetch needed for YT).
  function thumbUrl(song) {
    if (song.source === "yt") return `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`;
    return null; // Bilibili thumbs need API (CORS), fall back to placeholder.
  }

  // Best-effort metadata fetch (oEmbed YouTube; Bilibili metadata needs CORS proxy)
  async function fetchMeta(song) {
    try {
      if (song.source === "yt") {
        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${song.videoId}`);
        if (res.ok) {
          const j = await res.json();
          return { title: j.title || null, thumb: j.thumbnail_url || thumbUrl(song) };
        }
      } else if (song.source === "bili") {
        // Try via proxy to bilibili x/web-interface/view
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
          } catch (e) {}
        }
      }
    } catch (e) {}
    return { title: null, thumb: thumbUrl(song) };
  }

  window.KTV = window.KTV || {};
  Object.assign(window.KTV, { extractFromText, parseAddSong, embedUrl, fallbackTitle, thumbUrl, fetchMeta });
})();
