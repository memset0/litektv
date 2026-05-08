// state.tsx — shared room state via WebSocket to the backend.
//
// The backend (with SQLite persistence) is authoritative; we send commands
// and receive `state` snapshots. NO room state is cached in localStorage.
// localStorage is used ONLY for the user's own identity (a stable userId so
// reloads keep the same handle in the room). Everything else comes from the
// server.

import { useCallback, useEffect, useState } from "react";
import type { Favorite, RoomState, Song, SongRef } from "@litektv/types";

const ME_KEY = "ktv:me";

// Reserved single-segment paths that must NOT be treated as a room slug
// (kept in sync with the backend's catch-all in src/index.ts and the spec
// in openspec/specs/room-routing). After the Vite migration the only real
// asset names visible at the root are `index.html` and the hashed bundle
// directory `assets/`.
const RESERVED_PATHS = new Set<string>([
  "",
  "api",
  "ws",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "index.html",
  "assets",
  "LICENSE",
]);
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function randomSlug(): string {
  // 6-digit number — easy to read out loud / type. Collisions are fine: the
  // server lazily creates the room on first connect, so two parties picking
  // the same digits just end up in the same room.
  return String(100000 + Math.floor(Math.random() * 900000));
}

function getSlug(): string {
  const path = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (
    path &&
    !path.includes("/") &&
    !path.includes(".") &&
    !RESERVED_PATHS.has(path) &&
    SLUG_RE.test(path)
  ) {
    return path;
  }
  // Legacy ?room=<slug> or #room=<slug> — migrate to pretty URL.
  const url = new URL(window.location.href);
  const legacy =
    url.searchParams.get("room") ||
    (url.hash.match(/room=([^&]+)/) || [])[1];
  if (legacy && SLUG_RE.test(legacy)) {
    window.history.replaceState({}, "", "/" + legacy);
    return legacy;
  }
  const fresh = randomSlug();
  window.history.replaceState({}, "", "/" + fresh);
  return fresh;
}

export const SLUG = getSlug();

// One-time cleanup: earlier builds cached room state under "ktv:room:<slug>"
// and the slug under "ktv:slug". The backend is now the only source of
// truth, so wipe any leftovers to avoid confusion when debugging.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k === "ktv:slug" || k.startsWith("ktv:room:") || k === "ktv:layout")) {
      localStorage.removeItem(k);
    }
  }
} catch {}

// One-time cleanup of any stale ktv:session token from the prior account
// experiment. We don't have an account system anymore.
try { localStorage.removeItem("ktv:session"); } catch {}

export interface Me {
  id: string;
  name: string;
  emoji: string;
  anonymous: boolean;
  configured: boolean;
}

const blankRoom = (): RoomState => ({
  slug: SLUG,
  queue: [],
  history: [],
  current: null,
  users: {},
  danmaku: [],
  rev: 0,
});

function loadMe(): Me {
  try {
    const raw = localStorage.getItem(ME_KEY);
    if (raw) return JSON.parse(raw) as Me;
  } catch {}
  const id = "u_" + Math.random().toString(36).slice(2, 9);
  const me: Me = {
    id,
    name: "",
    emoji: "🎤",
    anonymous: false,
    configured: false,
  };
  localStorage.setItem(ME_KEY, JSON.stringify(me));
  return me;
}

export type WsMessage =
  | { type: "queue.add"; song?: Song; ref?: SongRef }
  | { type: "queue.remove"; id: string }
  | { type: "queue.reorder"; id: string; toIndex: number }
  | { type: "queue.top"; id: string }
  | { type: "queue.shuffle" }
  | { type: "track.next" }
  | { type: "track.prev" }
  | { type: "track.meta"; id: string; patch: Record<string, unknown> }
  | { type: "danmaku"; text: string }
  | { type: "favorite.add"; song: Record<string, unknown> }
  | {
      type: "favorite.update";
      source: "yt" | "bili";
      videoId: string;
      page: number;
      displayTitle?: string | null;
      authors?: string[] | null;
      mode?: "instr" | "vocal" | null;
    }
  | {
      type: "favorite.remove";
      source: "yt" | "bili";
      videoId: string;
      page: number;
    }
  | { type: "heartbeat" }
  | { type: "hello"; userId: string; name: string; emoji: string; anonymous: boolean }
  | { type: "profile.update"; name: string; emoji: string; anonymous: boolean };

type SendFn = (msg: WsMessage) => void;
type Sub = (state: RoomState) => void;
type FavSub = (favs: Favorite[]) => void;

interface Connection {
  send: SendFn;
  setMe: (me: Me) => void;
  subscribe: (fn: Sub) => () => void;
  getState: () => RoomState;
  subscribeFavorites: (fn: FavSub) => () => void;
  getFavorites: () => Favorite[];
}

function makeConnection(slug: string): Connection {
  let ws: WebSocket | null = null;
  let state: RoomState = blankRoom();
  let me: Me | null = null;
  let helloed = false;
  let pending: WsMessage[] = [];
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const subs = new Set<Sub>();
  const favSubs = new Set<FavSub>();
  let favorites: Favorite[] = [];

  const notify = () => { for (const fn of subs) { try { fn(state); } catch {} } };
  const notifyFav = () => { for (const fn of favSubs) { try { fn(favorites); } catch {} } };

  function buildHello(): WsMessage | null {
    if (!me) return null;
    const display = me.anonymous
      ? { name: "匿名", emoji: "👤", anonymous: true }
      : {
          name: (me.name || "未命名").slice(0, 16),
          emoji: me.emoji || "🎤",
          anonymous: false,
        };
    return { type: "hello", userId: me.id, ...display };
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(slug)}`;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener("open", () => {
      helloed = false;
      const hello = buildHello();
      if (hello && ws) {
        ws.send(JSON.stringify(hello));
        helloed = true;
        for (const m of pending) ws.send(JSON.stringify(m));
        pending = [];
      }
    });
    ws.addEventListener("message", (ev) => {
      let msg: { type?: string; state?: RoomState; favorites?: Favorite[] };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === "state" && msg.state) {
        state = { ...blankRoom(), ...msg.state };
        notify();
      } else if (msg.type === "favorites" && Array.isArray(msg.favorites)) {
        favorites = msg.favorites;
        notifyFav();
      }
    });
    ws.addEventListener("close", () => {
      ws = null;
      helloed = false;
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      try { ws && ws.close(); } catch {}
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1500);
  }

  const send: SendFn = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN && helloed) {
      ws.send(JSON.stringify(msg));
    } else {
      pending.push(msg);
      connect();
    }
  };

  function setMe(next: Me) {
    const prev = me;
    me = next;
    if (!prev || !ws || ws.readyState !== WebSocket.OPEN) {
      // first time or not connected yet — let connect()/open send hello
      // with the current me
      if (!ws) connect();
      return;
    }
    if (prev.id !== next.id) {
      // userId changed — reconnect so the server gets a fresh hello
      try { ws.close(); } catch {}
      return;
    }
    const display = next.anonymous
      ? { name: "匿名", emoji: "👤", anonymous: true }
      : {
          name: (next.name || "未命名").slice(0, 16),
          emoji: next.emoji || "🎤",
          anonymous: false,
        };
    try {
      ws.send(JSON.stringify({ type: "profile.update", ...display }));
    } catch {}
  }

  function subscribe(fn: Sub) {
    subs.add(fn);
    try { fn(state); } catch {}
    return () => { subs.delete(fn); };
  }

  // Heartbeat (keeps presence fresh; spec calls for 20–30s).
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && helloed) {
      try { ws.send(JSON.stringify({ type: "heartbeat" })); } catch {}
    }
  }, 25000);

  function subscribeFavorites(fn: FavSub) {
    favSubs.add(fn);
    try { fn(favorites); } catch {}
    return () => { favSubs.delete(fn); };
  }

  return {
    send,
    setMe,
    subscribe,
    getState: () => state,
    subscribeFavorites,
    getFavorites: () => favorites,
  };
}

const conn = makeConnection(SLUG);

export function useRoom(): [RoomState, SendFn] {
  const [room, setRoom] = useState<RoomState>(() => conn.getState());
  useEffect(() => conn.subscribe(setRoom), []);
  return [room, conn.send];
}

type MePatch = Partial<Me> | ((prev: Me) => Me);

export function useMe(): [Me, (patch: MePatch) => void] {
  const [me, setMe] = useState<Me>(loadMe);
  useEffect(() => { conn.setMe(me); }, [me.id, me.name, me.emoji, me.anonymous]);
  const update = useCallback((patch: MePatch) => {
    setMe((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      try { localStorage.setItem(ME_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [me, update];
}

export interface FavoriteInput {
  source: string;
  videoId: string;
  page?: number;
  title?: string;
  thumb?: string | null;
  duration?: number;
}

export interface FavoritePatch {
  displayTitle?: string | null;
  authors?: string[] | null;
  mode?: "instr" | "vocal" | null;
}

export interface FavoriteKey {
  source: "yt" | "bili";
  videoId: string;
  page: number;
}

export interface FavOps {
  addFavorite: (song: FavoriteInput) => void;
  isFavorited: (
    song: { source?: string; videoId?: string; page?: number } | null | undefined,
  ) => boolean;
  /** Look up the favorite row that matches a song record (canonical key). */
  findFavorite: (
    song: { source?: string; videoId?: string; page?: number } | null | undefined,
  ) => Favorite | undefined;
  updateFavorite: (key: FavoriteKey, patch: FavoritePatch) => void;
  removeFavorite: (key: FavoriteKey) => void;
}

function favoriteKeyOf(song: {
  source?: string;
  videoId?: string;
  page?: number;
}): { source: "yt" | "bili"; videoId: string; page: number } | null {
  if (!song?.source || !song.videoId) return null;
  if (song.source !== "yt" && song.source !== "bili") return null;
  const page = song.source === "bili" ? (song.page ?? 1) : 0;
  return { source: song.source, videoId: song.videoId, page };
}

export function useFavorites(): [Favorite[], FavOps] {
  const [favs, setFavs] = useState<Favorite[]>(() => conn.getFavorites());
  useEffect(() => conn.subscribeFavorites(setFavs), []);
  const isFavorited = useCallback<FavOps["isFavorited"]>(
    (song) => {
      const k = favoriteKeyOf(song ?? {});
      if (!k) return false;
      return favs.some((f) => f.source === k.source && f.videoId === k.videoId && f.page === k.page);
    },
    [favs],
  );
  const findFavoriteOp = useCallback<FavOps["findFavorite"]>(
    (song) => {
      const k = favoriteKeyOf(song ?? {});
      if (!k) return undefined;
      return favs.find((f) => f.source === k.source && f.videoId === k.videoId && f.page === k.page);
    },
    [favs],
  );
  const addFavorite = useCallback<FavOps["addFavorite"]>((song) => {
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
  const updateFavoriteOp = useCallback<FavOps["updateFavorite"]>((key, patch) => {
    const msg: WsMessage = {
      type: "favorite.update",
      source: key.source,
      videoId: key.videoId,
      page: key.page,
    };
    if ("displayTitle" in patch) msg.displayTitle = patch.displayTitle;
    if ("authors" in patch) msg.authors = patch.authors;
    if ("mode" in patch) msg.mode = patch.mode;
    conn.send(msg);
  }, []);
  const removeFavoriteOp = useCallback<FavOps["removeFavorite"]>((key) => {
    conn.send({
      type: "favorite.remove",
      source: key.source,
      videoId: key.videoId,
      page: key.page,
    });
  }, []);
  return [
    favs,
    {
      addFavorite,
      isFavorited,
      findFavorite: findFavoriteOp,
      updateFavorite: updateFavoriteOp,
      removeFavorite: removeFavoriteOp,
    },
  ];
}
