// state.jsx — shared room state via localStorage + BroadcastChannel
// Multi-tab in one browser simulates multi-user. Storage events sync across tabs.

(function () {
  const SLUG_KEY = "ktv:slug";
  const ME_KEY = "ktv:me";

  function getSlug() {
    const url = new URL(window.location.href);
    let slug = url.searchParams.get("room") || (url.hash.match(/room=([^&]+)/) || [])[1];
    if (!slug) {
      const adj = ["neon", "midnight", "velvet", "echo", "moon", "tiger", "comet", "lotus", "ghost", "fox"];
      const noun = ["lounge", "alley", "wave", "drive", "static", "river", "tape", "den", "loop", "bay"];
      slug = adj[Math.floor(Math.random()*adj.length)] + "-" + noun[Math.floor(Math.random()*noun.length)] + "-" + Math.floor(Math.random()*900+100);
      url.searchParams.set("room", slug);
      window.history.replaceState({}, "", url.toString());
    }
    localStorage.setItem(SLUG_KEY, slug);
    return slug;
  }

  const SLUG = getSlug();
  const ROOM_KEY = `ktv:room:${SLUG}`;
  const CHAN_NAME = `ktv:${SLUG}`;

  // ── Initial room state ──────────────────────────────────────
  const blankRoom = () => ({
    queue: [],         // [{id, source, videoId, originalUrl, title, thumb, addedBy, addedAt, durationGuess}]
    history: [],       // [{...song, finishedAt}]
    current: null,     // currently playing song (drained from queue head)
    playback: {
      playing: false,
      // anchor: at wallTime ms, position is at this many seconds
      wallTime: Date.now(),
      position: 0,
      volume: 80,
      muted: false,
      // monotonic counter so each tab can detect remote vs self updates
      seq: 0,
      writer: null,
    },
    users: {},         // {clientId: {name, emoji, anonymous, lastSeen}}
    danmaku: [],       // [{id, text, ts}]  rolling buffer (last 50)
    version: 0,
  });

  function loadRoom() {
    try {
      const raw = localStorage.getItem(ROOM_KEY);
      if (!raw) return blankRoom();
      return { ...blankRoom(), ...JSON.parse(raw) };
    } catch (e) { return blankRoom(); }
  }

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

  // ── Hook: shared room ───────────────────────────────────────
  function useRoom() {
    const [room, setRoom] = React.useState(loadRoom);
    const channelRef = React.useRef(null);
    const lastWriteRef = React.useRef(0);

    React.useEffect(() => {
      const chan = ("BroadcastChannel" in window) ? new BroadcastChannel(CHAN_NAME) : null;
      channelRef.current = chan;
      const onMsg = (ev) => {
        if (ev.data && ev.data.type === "room") {
          setRoom(ev.data.state);
        }
      };
      if (chan) chan.addEventListener("message", onMsg);
      const onStorage = (ev) => {
        if (ev.key === ROOM_KEY && ev.newValue) {
          try { setRoom(JSON.parse(ev.newValue)); } catch (e) {}
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        if (chan) { chan.removeEventListener("message", onMsg); chan.close(); }
        window.removeEventListener("storage", onStorage);
      };
    }, []);

    // Mutator: pass a function (room) => newRoom
    const update = React.useCallback((mutator) => {
      setRoom((prev) => {
        const next = typeof mutator === "function" ? mutator(prev) : mutator;
        next.version = (prev.version || 0) + 1;
        try { localStorage.setItem(ROOM_KEY, JSON.stringify(next)); } catch (e) {}
        if (channelRef.current) {
          channelRef.current.postMessage({ type: "room", state: next });
        }
        lastWriteRef.current = Date.now();
        return next;
      });
    }, []);

    return [room, update];
  }

  // ── Hook: me (with rename/avatar) ────────────────────────────
  function useMe() {
    const [me, setMe] = React.useState(loadMe);
    const update = React.useCallback((patch) => {
      setMe((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
        localStorage.setItem(ME_KEY, JSON.stringify(next));
        return next;
      });
    }, []);
    return [me, update];
  }

  // ── Heartbeat: register me in room.users every few seconds ───
  function useHeartbeat(me, room, updateRoom) {
    React.useEffect(() => {
      if (!me) return;
      const beat = () => {
        updateRoom((prev) => {
          const display = me.anonymous ? { name: "匿名", emoji: "👤", anonymous: true } : { name: me.name || "未命名", emoji: me.emoji || "🎤", anonymous: false };
          return {
            ...prev,
            users: {
              ...prev.users,
              [me.id]: { ...display, lastSeen: Date.now() },
            },
          };
        });
      };
      beat();
      const t = setInterval(beat, 6000);
      return () => clearInterval(t);
    }, [me && me.id, me && me.name, me && me.emoji, me && me.anonymous]);
  }

  window.KTV = window.KTV || {};
  Object.assign(window.KTV, {
    SLUG, ROOM_KEY, CHAN_NAME,
    useRoom, useMe, useHeartbeat,
    blankRoom,
  });
})();
