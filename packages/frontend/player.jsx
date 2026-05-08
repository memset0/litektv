// player.jsx — YouTube IFrame API + Bilibili iframe player + fullscreen + danmaku overlay
// No playback-progress sync — each client plays independently. Only song-id changes
// are observed; everyone restarts from 0 when the room moves to a new track.

(function () {
  let ytReady = null;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} ; resolve(window.YT); };
    });
    return ytReady;
  }

  function InnerDanmaku({ items }) {
    const [tracks, setTracks] = React.useState([]);
    const seenRef = React.useRef(new Set());
    const trackPtrRef = React.useRef(0);
    const TRACKS = 4;
    React.useEffect(() => {
      if (!items) return;
      const fresh = items.filter((d) => !seenRef.current.has("inner:" + d.id) && Date.now() - d.ts < 14000);
      fresh.forEach((d) => seenRef.current.add("inner:" + d.id));
      if (!fresh.length) return;
      setTracks((prev) => {
        let next = [...prev];
        fresh.forEach((d) => {
          const lane = trackPtrRef.current % TRACKS;
          trackPtrRef.current += 1;
          next.push({ ...d, lane, expiresAt: Date.now() + 12000 });
        });
        return next.filter((d) => d.expiresAt > Date.now());
      });
    }, [items && items.length, items && items[items.length - 1] && items[items.length - 1].id]);
    React.useEffect(() => {
      const t = setInterval(() => setTracks((prev) => prev.filter((d) => d.expiresAt > Date.now())), 1500);
      return () => clearInterval(t);
    }, []);
    return (
      <div className="dm-inner" aria-hidden>
        {tracks.map((d) => (
          <div key={d.id} className="dm-inner-item" style={{ top: `calc(${(d.lane * 22) + 8}% )` }}>
            {d.text}
          </div>
        ))}
      </div>
    );
  }

  function Player({ song, onMeta, danmakuItems }) {
    const containerRef = React.useRef(null);
    const fsRootRef = React.useRef(null);
    const ytPlayerRef = React.useRef(null);
    const [isFullscreen, setIsFullscreen] = React.useState(false);

    React.useEffect(() => {
      const onFs = () => setIsFullscreen(document.fullscreenElement === fsRootRef.current);
      document.addEventListener("fullscreenchange", onFs);
      return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);
    const toggleFullscreen = () => {
      const el = fsRootRef.current;
      if (!el) return;
      if (document.fullscreenElement === el) {
        document.exitFullscreen && document.exitFullscreen();
      } else {
        el.requestFullscreen && el.requestFullscreen().catch(() => {});
      }
    };

    // YouTube — recreate player from 0 on every song change.
    React.useEffect(() => {
      if (!song || song.source !== "yt") {
        if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy(); } catch (e) {}
          ytPlayerRef.current = null;
        }
        return;
      }
      let cancelled = false;
      loadYT().then((YT) => {
        if (cancelled || !containerRef.current) return;
        if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy(); } catch (e) {}
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
            autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1,
            start: 0, controls: 1, fs: 0, iv_load_policy: 3,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev) => { try { ev.target.playVideo(); } catch (e) {} },
          },
        });
      });
      return () => { cancelled = true; };
    }, [song && song.id]);

    // Bilibili — reload iframe from 0 on every song change.
    React.useEffect(() => {
      if (!song || song.source !== "bili") return;
      const url = window.KTV.embedUrl(song, { startSec: 0, autoplay: true, mute: false, hideChrome: false });
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
    }, [song && song.id, song && song.source]);

    // Metadata fetch
    React.useEffect(() => {
      if (!song) return;
      const looksFallback = !song.title || (song.title.includes && song.title.includes(song.videoId));
      if (!looksFallback) return;
      window.KTV.fetchMeta(song).then((m) => {
        if (m && (m.title || m.thumb)) onMeta && onMeta(m);
      });
    }, [song && song.id]);

    return (
      <div className={`fs-host ${isFullscreen ? "is-fs" : ""}`} ref={fsRootRef}>
        {!song ? (
          <div className="player-empty">
            <div className="player-empty-glow" />
            <div className="player-empty-inner">
              <div className="player-empty-mono">[ no signal ]</div>
              <div className="player-empty-cta">Paste a Bilibili / YouTube link on the right to start the night</div>
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
          <button className="fs-btn" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
            )}
          </button>
        )}
      </div>
    );
  }

  window.KTV = window.KTV || {};
  Object.assign(window.KTV, { Player, loadYT });
})();
