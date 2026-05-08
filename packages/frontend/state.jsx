// state.jsx — shared room state via WebSocket to the backend.
// The backend (with SQLite persistence) is authoritative; we send commands and
// receive `state` snapshots. NO room state is cached in localStorage.
// localStorage is used ONLY for the user's own identity (a stable userId so
// reloads keep the same handle in the room). Everything else comes from the
// server.

(function () {
  // Identity-only. NOT used for room state.
  const ME_KEY = "ktv:me";

  // Reserved single-segment paths that must NOT be treated as a room slug
  // (kept in sync with the backend's catch-all in src/index.ts).
  const RESERVED_PATHS = new Set([
    "", "api", "ws", "favicon.ico", "robots.txt", "sitemap.xml",
    "KTV.html", "index.html", "state.jsx", "app.jsx", "app-ui.jsx",
    "player.jsx", "urlparse.jsx", "tweaks-panel.jsx",
    "ktv.css", "ktv-extras.css", "LICENSE",
  ]);
  const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function randomSlug() {
    // 6-digit number — easy to read out loud / type. Collisions are fine: the
    // server lazily creates the room on first connect, so two parties picking
    // the same digits just end up in the same room.
    return String(100000 + Math.floor(Math.random() * 900000));
  }

  function getSlug() {
    // 1) /<slug> in the pathname (preferred, pretty URL)
    const path = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (path && !path.includes("/") && !path.includes(".") &&
        !RESERVED_PATHS.has(path) && SLUG_RE.test(path)) {
      return path;
    }
    // 2) ?room=<slug> or #room=<slug> — legacy. Migrate to pretty URL.
    const url = new URL(window.location.href);
    const legacy = url.searchParams.get("room") || (url.hash.match(/room=([^&]+)/) || [])[1];
    if (legacy && SLUG_RE.test(legacy)) {
      window.history.replaceState({}, "", "/" + legacy);
      return legacy;
    }
    // 3) freshly generated random numeric slug
    const fresh = randomSlug();
    window.history.replaceState({}, "", "/" + fresh);
    return fresh;
  }

  const SLUG = getSlug();

  // One-time cleanup: earlier builds cached room state under "ktv:room:<slug>"
  // and the slug under "ktv:slug". The backend is now the only source of truth,
  // so wipe any leftovers to avoid confusion when debugging.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k === "ktv:slug" || k.startsWith("ktv:room:") || k === "ktv:layout")) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  // ── Initial blank room (only used until the first server snapshot arrives) ──
  const blankRoom = () => ({
    slug: SLUG,
    queue: [], history: [], current: null,
    users: {}, danmaku: [],
    rev: 0,
    // legacy fields some UI bits still read; harmless to keep
    playback: { seq: 0 },
  });

  // ── Me ──────────────────────────────────────────────────────
  function loadMe() {
    try {
      const raw = localStorage.getItem(ME_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const id = "u_" + Math.random().toString(36).slice(2, 9);
    const me = { id, name: "", emoji: "🎤", anonymous: false, configured: false };
    localStorage.setItem(ME_KEY, JSON.stringify(me));
    return me;
  }

  // ── Connection singleton ────────────────────────────────────
  // One WebSocket per page, multiplexed across hooks via subscribers.
  function makeConnection(slug) {
    let ws = null;
    let state = blankRoom();
    let me = null;
    let helloed = false;
    let pending = [];
    let reconnectTimer = null;
    const subs = new Set();
    const favSubs = new Set();
    let favorites = [];

    function notify() { for (const fn of subs) { try { fn(state); } catch {} } }
    function notifyFav() { for (const fn of favSubs) { try { fn(favorites); } catch {} } }

    function buildHello() {
      if (!me) return null;
      const display = me.anonymous
        ? { name: "匿名", emoji: "👤", anonymous: true }
        : { name: (me.name || "未命名").slice(0, 16), emoji: me.emoji || "🎤", anonymous: false };
      return { type: "hello", userId: me.id, ...display };
    }

    function connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(slug)}`;
      try { ws = new WebSocket(url); } catch (e) { scheduleReconnect(); return; }

      ws.addEventListener("open", () => {
        helloed = false;
        const hello = buildHello();
        if (hello) {
          ws.send(JSON.stringify(hello));
          helloed = true;
          for (const m of pending) ws.send(JSON.stringify(m));
          pending = [];
        }
      });
      ws.addEventListener("message", (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "state" && msg.state) {
          state = { ...blankRoom(), ...msg.state };
          notify();
        } else if (msg.type === "favorites" && Array.isArray(msg.favorites)) {
          favorites = msg.favorites;
          notifyFav();
        }
      });
      ws.addEventListener("close", () => { ws = null; helloed = false; scheduleReconnect(); });
      ws.addEventListener("error", () => { try { ws && ws.close(); } catch {} });
    }
    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 1500);
    }

    function send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN && helloed) {
        ws.send(JSON.stringify(msg));
      } else {
        pending.push(msg);
        connect();
      }
    }

    function setMe(next) {
      const prev = me;
      me = next;
      if (!prev || !ws || ws.readyState !== WebSocket.OPEN) {
        // first time or not connected yet — let connect()/open send hello with the current me
        if (!ws) connect();
        return;
      }
      if (prev.id !== next.id) {
        // userId changed — reconnect so the server gets a fresh hello
        try { ws.close(); } catch {}
        return;
      }
      // same user, profile patch
      const display = next.anonymous
        ? { name: "匿名", emoji: "👤", anonymous: true }
        : { name: (next.name || "未命名").slice(0, 16), emoji: next.emoji || "🎤", anonymous: false };
      try {
        ws.send(JSON.stringify({ type: "profile.update", ...display }));
      } catch {}
    }

    function subscribe(fn) {
      subs.add(fn);
      // push the current snapshot synchronously so React state lines up
      try { fn(state); } catch {}
      return () => subs.delete(fn);
    }

    // Heartbeat (keeps presence fresh; spec calls for 20–30s).
    setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && helloed) {
        try { ws.send(JSON.stringify({ type: "heartbeat" })); } catch {}
      }
    }, 25000);

    function subscribeFavorites(fn) {
      favSubs.add(fn);
      try { fn(favorites); } catch {}
      return () => favSubs.delete(fn);
    }

    return {
      send, setMe, subscribe, getState: () => state,
      subscribeFavorites, getFavorites: () => favorites,
    };
  }

  const conn = makeConnection(SLUG);

  // ── Hook: shared room ───────────────────────────────────────
  function useRoom() {
    const [room, setRoom] = React.useState(() => conn.getState());
    React.useEffect(() => conn.subscribe(setRoom), []);
    return [room, conn.send];
  }

  // ── Hook: me ────────────────────────────────────────────────
  function useMe() {
    const [me, setMe] = React.useState(loadMe);
    // push the latest me into the connection so hello/profile.update use it
    React.useEffect(() => { conn.setMe(me); }, [me.id, me.name, me.emoji, me.anonymous]);
    const update = React.useCallback((patch) => {
      setMe((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
        try { localStorage.setItem(ME_KEY, JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }, []);
    return [me, update];
  }

  // ── Hook: favorites ─────────────────────────────────────────
  // Returns [favorites[], { addFavorite, removeFavorite, isFavorited }].
  function useFavorites() {
    const [favs, setFavs] = React.useState(() => conn.getFavorites());
    React.useEffect(() => conn.subscribeFavorites(setFavs), []);
    const isFavorited = React.useCallback((song) => {
      if (!song || !song.source || !song.videoId) return false;
      const page = song.source === "bili" ? (song.page ?? 1) : 0;
      return favs.some((f) => f.source === song.source && f.videoId === song.videoId && f.page === page);
    }, [favs]);
    const addFavorite = React.useCallback((song) => {
      conn.send({
        type: "favorite.add",
        song: {
          source: song.source,
          videoId: song.videoId,
          page: song.source === "bili" ? (song.page ?? 1) : undefined,
          title: song.title,
          thumb: song.thumb ?? null,
          duration: song.duration,
        },
      });
    }, []);
    const removeFavorite = React.useCallback((song) => {
      conn.send({
        type: "favorite.remove",
        source: song.source,
        videoId: song.videoId,
        page: song.source === "bili" ? (song.page ?? 1) : undefined,
      });
    }, []);
    return [favs, { addFavorite, removeFavorite, isFavorited }];
  }

  // Heartbeat is now run inside the connection — keep this no-op so existing
  // call sites (App.jsx) don't break.
  function useHeartbeat() { /* no-op: handled by connection */ }

  // One-time cleanup of any stale ktv:session token from the prior account
  // experiment. We don't have an account system anymore.
  try { localStorage.removeItem("ktv:session"); } catch {}

  window.KTV = window.KTV || {};
  Object.assign(window.KTV, {
    SLUG, useRoom, useMe, useFavorites, useHeartbeat, blankRoom,
    _conn: conn,
  });
})();
