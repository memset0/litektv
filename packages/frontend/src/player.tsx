// player.tsx — YouTube IFrame API + Bilibili iframe player + fullscreen + danmaku overlay.
// No playback-progress sync — each client plays independently. Only song-id
// changes are observed; everyone restarts from 0 when the room moves to a
// new track.

import { useEffect, useRef, useState } from "react";
import type { DanmakuMsg, Song } from "@litektv/types";
import { embedUrl, fetchMeta, type MetaResult } from "./urlparse";

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeApi {
  Player: new (elementId: string, config: YouTubePlayerConfig) => YouTubePlayer;
}

interface YouTubePlayerConfig {
  videoId: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: { onReady?: (ev: { target: YouTubePlayer }) => void };
}

interface YouTubePlayer {
  playVideo: () => void;
  destroy: () => void;
}

let ytReady: Promise<YouTubeApi> | null = null;
function loadYT(): Promise<YouTubeApi> {
  if (ytReady) return ytReady;
  ytReady = new Promise<YouTubeApi>((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) {
        try { prev(); } catch {}
      }
      if (window.YT) resolve(window.YT);
    };
  });
  return ytReady;
}

interface InnerDanmakuTrack extends DanmakuMsg {
  lane: number;
  expiresAt: number;
}

function InnerDanmaku({ items }: { items: DanmakuMsg[] | undefined }) {
  const [tracks, setTracks] = useState<InnerDanmakuTrack[]>([]);
  const seenRef = useRef(new Set<string>());
  const trackPtrRef = useRef(0);
  const TRACKS = 4;
  useEffect(() => {
    if (!items) return;
    const fresh = items.filter(
      (d) => !seenRef.current.has("inner:" + d.id) && Date.now() - d.ts < 14000,
    );
    fresh.forEach((d) => seenRef.current.add("inner:" + d.id));
    if (!fresh.length) return;
    setTracks((prev) => {
      const next: InnerDanmakuTrack[] = [...prev];
      fresh.forEach((d) => {
        const lane = trackPtrRef.current % TRACKS;
        trackPtrRef.current += 1;
        next.push({ ...d, lane, expiresAt: Date.now() + 12000 });
      });
      return next.filter((d) => d.expiresAt > Date.now());
    });
  }, [items?.length, items?.[items.length - 1]?.id]);
  useEffect(() => {
    const t = setInterval(
      () => setTracks((prev) => prev.filter((d) => d.expiresAt > Date.now())),
      1500,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="dm-inner" aria-hidden>
      {tracks.map((d) => (
        <div
          key={d.id}
          className="dm-inner-item"
          style={{ top: `calc(${d.lane * 22 + 8}% )` }}
        >
          {d.text}
        </div>
      ))}
    </div>
  );
}

export interface PlayerProps {
  song: Song | null;
  onMeta?: (m: MetaResult) => void;
  danmakuItems: DanmakuMsg[] | undefined;
}

export function Player({ song, onMeta, danmakuItems }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fsRootRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === fsRootRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    const el = fsRootRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      if (document.exitFullscreen) void document.exitFullscreen();
    } else {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    }
  };

  // YouTube — recreate player from 0 on every song change.
  useEffect(() => {
    if (!song || song.source !== "yt") {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      return;
    }
    let cancelled = false;
    void loadYT().then((YT) => {
      if (cancelled || !containerRef.current) return;
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      const div = document.createElement("div");
      div.id = "ytp-" + Math.random().toString(36).slice(2);
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(div);
      ytPlayerRef.current = new YT.Player(div.id, {
        videoId: song.videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: 0,
          controls: 1,
          fs: 0,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            try { ev.target.playVideo(); } catch {}
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [song?.id]);

  // Bilibili — reload iframe from 0 on every song change.
  useEffect(() => {
    if (!song || song.source !== "bili") return;
    const url = embedUrl(song, {
      startSec: 0,
      autoplay: true,
      mute: false,
      hideChrome: false,
    });
    if (containerRef.current) {
      containerRef.current.innerHTML = `<iframe
          src="${url}"
          allowfullscreen="true"
          scrolling="no"
          frameborder="0"
          referrerpolicy="no-referrer"
          allow="autoplay; encrypted-media; fullscreen"
          style="width:100%;height:100%;border:0;display:block"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
        ></iframe>`;
    }
  }, [song?.id, song?.source]);

  // Metadata fetch
  useEffect(() => {
    if (!song) return;
    const looksFallback =
      !song.title || (song.title.includes && song.title.includes(song.videoId));
    if (!looksFallback) return;
    void fetchMeta(song).then((m) => {
      if (m && (m.title || m.thumb)) onMeta && onMeta(m);
    });
  }, [song?.id]);

  return (
    <div className={`fs-host ${isFullscreen ? "is-fs" : ""}`} ref={fsRootRef}>
      {!song ? (
        <div className="player-empty">
          <div className="player-empty-glow" />
          <div className="player-empty-inner">
            <div className="player-empty-mono">[ no signal ]</div>
            <div className="player-empty-cta">
              Paste a Bilibili / YouTube link on the right to start the night
            </div>
          </div>
        </div>
      ) : (
        <div className="player-wrap">
          <div className="player-frame" ref={containerRef} />
          <div className="player-scanlines" />
        </div>
      )}

      <InnerDanmaku items={danmakuItems} />

      {song && (
        <button
          className="fs-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
