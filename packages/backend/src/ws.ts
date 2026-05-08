import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { config } from "./config.js";
import {
  addFavorite,
  appendFavoriteAudit,
  findFavorite,
  listFavorites,
  removeFavorite,
  updateFavorite,
  type FavoritePatch,
} from "./db.js";
import { parseRef } from "./parser.js";
import { RateLimiter } from "./rateLimit.js";
import {
  getOrCreateRoom,
  pushDanmaku,
  queueAdd,
  queueClear,
  queueMove,
  queueRemove,
  queueReorder,
  queueShuffle,
  queueTop,
  setUser,
  touchUser,
  trackMeta,
  trackNext,
  trackPrev,
  type Room,
} from "./rooms.js";
import type { Favorite, Song } from "./types.js";
import { clampString, now, uuid } from "./util.js";

const queueAddLimiter = new RateLimiter(config.rateLimits["queue.add"].perMinute);
const danmakuLimiter = new RateLimiter(config.rateLimits.danmaku.perMinute);
const favoriteLimiter = new RateLimiter(config.rateLimits.favorite.perMinute);

const songSchema = z.object({
  id: z.string().optional(),
  source: z.enum(["yt", "bili"]),
  videoId: z.string().min(1).max(64),
  page: z.number().int().min(1).optional(),
  cid: z.number().int().nonnegative().optional(),
  title: z.string().max(300),
  thumb: z.string().max(1024).nullable().optional(),
  duration: z.number().nonnegative().optional(),
  addedBy: z.object({
    id: z.string().optional(),
    name: z.string().max(32),
    emoji: z.string().max(8),
    anonymous: z.boolean(),
  }),
});

const helloSchema = z.object({
  type: z.literal("hello"),
  userId: z.string().min(4).max(64),
  name: z.string().max(16).default(""),
  emoji: z.string().max(8).default("🎤"),
  anonymous: z.boolean().default(false),
});

const songRefSchema = z.object({
  source: z.enum(["yt", "bili"]),
  videoId: z.string().min(1).max(64),
  page: z.number().int().min(1).optional(),
  cid: z.number().int().nonnegative().optional(),
});

// Strict — unknown keys cause validation to fail so the server can return
// `{type:"error", error:"unknown field"}` rather than silently storing
// whatever extra fields the client sent.
const favoriteAddSongSchema = z
  .object({
    source: z.enum(["yt", "bili"]),
    videoId: z.string().min(1).max(64),
    page: z.number().int().min(1).optional(),
    cid: z.number().int().nonnegative().optional(),
    title: z.string().max(300).optional(),
    thumb: z.string().max(1024).nullable().optional(),
    duration: z.number().nonnegative().optional(),
  })
  .strict();

const incoming = z.discriminatedUnion("type", [
  helloSchema,
  z.object({ type: z.literal("heartbeat") }),
  z.object({
    type: z.literal("queue.add"),
    song: songSchema.optional(),
    ref: songRefSchema.optional(),
  }),
  z.object({ type: z.literal("queue.move"), id: z.string(), delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ type: z.literal("queue.reorder"), id: z.string(), toIndex: z.number().int().nonnegative() }),
  z.object({ type: z.literal("queue.top"), id: z.string() }),
  z.object({ type: z.literal("queue.remove"), id: z.string() }),
  z.object({ type: z.literal("queue.shuffle") }),
  z.object({ type: z.literal("queue.clear") }),
  z.object({ type: z.literal("track.next") }),
  z.object({ type: z.literal("track.prev") }),
  z.object({
    type: z.literal("track.meta"),
    id: z.string(),
    patch: z.object({
      title: z.string().max(300).optional(),
      thumb: z.string().max(1024).nullable().optional(),
      duration: z.number().nonnegative().optional(),
    }),
  }),
  z.object({ type: z.literal("danmaku"), text: z.string().min(1).max(80) }),
  z.object({
    type: z.literal("profile.update"),
    name: z.string().max(16).optional(),
    emoji: z.string().max(8).optional(),
    anonymous: z.boolean().optional(),
  }),
  z.object({ type: z.literal("favorite.add"), song: favoriteAddSongSchema }),
  z.object({ type: z.literal("favorite.list") }),
  z.object({
    type: z.literal("favorite.update"),
    source: z.enum(["yt", "bili"]),
    videoId: z.string().min(1).max(64),
    page: z.number().int().min(0).max(99999),
    displayTitle: z.string().max(300).nullable().optional(),
    authors: z.array(z.string().min(1).max(100)).max(20).nullable().optional(),
    mode: z.enum(["instr", "vocal"]).nullable().optional(),
  }),
  z.object({
    type: z.literal("favorite.remove"),
    source: z.enum(["yt", "bili"]),
    videoId: z.string().min(1).max(64),
    page: z.number().int().min(0).max(99999),
  }),
]);

interface ConnState {
  ws: WebSocket;
  room: Room;
  userId: string | null;
}

/** Every active WebSocket. Favorites are global (site-wide), so any
 *  favorite mutation fans out to every connected client regardless of room. */
const allConnections = new Set<ConnState>();

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendFavoritesSnapshot(s: ConnState) {
  const list = listFavorites();
  send(s.ws, { type: "favorites", favorites: list });
}

/** Broadcast a fresh `favorites` snapshot to every connected client.
 *  Favorites are site-wide, so everyone sees the same list. */
export function broadcastFavorites() {
  const list = listFavorites();
  for (const conn of allConnections) {
    send(conn.ws, { type: "favorites", favorites: list });
  }
}

export interface AttachWsOptions {
  /**
   * When true, upgrade requests on paths other than `/ws` are left alone
   * (no `socket.destroy()`) so a co-resident upgrade listener can claim
   * them. Set this in dev mode where Vite registers its own HMR upgrade
   * listener on the same HTTP server via `hmr.server: server`. In prod
   * (no other listener) leave it false so unknown upgrades are cleanly
   * rejected instead of dangling.
   */
  fallthroughForeignPaths?: boolean;
}

export function attachWs(
  server: import("node:http").Server,
  opts: AttachWsOptions = {},
) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      if (!opts.fallthroughForeignPaths) socket.destroy();
      return;
    }
    const slug = url.searchParams.get("room");
    if (!slug || !/^[A-Za-z0-9_-]{1,64}$/.test(slug)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, slug));
  });
}

function dropConnection(state: ConnState) {
  allConnections.delete(state);
}

function onConnection(ws: WebSocket, slug: string) {
  const room = getOrCreateRoom(slug);
  const state: ConnState = {
    ws,
    room,
    userId: null,
  };
  allConnections.add(state);

  const sendState = (st: import("./types.js").RoomState) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "state", state: st }));
    }
  };
  room.subscribers.add(sendState);
  send(ws, { type: "state", state: room.state });

  const heartbeat = setInterval(() => {
    if (state.userId) touchUser(room, state.userId);
  }, 20_000);

  ws.on("message", (raw) => {
    let parsed: z.infer<typeof incoming>;
    let rawType: unknown = null;
    try {
      const obj = JSON.parse(raw.toString()) as { type?: unknown };
      rawType = obj?.type;
      parsed = incoming.parse(obj);
    } catch (e) {
      const msg =
        e instanceof z.ZodError &&
        rawType === "favorite.add" &&
        e.errors.some((x) => x.code === "unrecognized_keys")
          ? "unknown field"
          : "bad message";
      send(ws, { type: "error", error: msg });
      return;
    }
    void handleMessage(state, parsed);
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    room.subscribers.delete(sendState);
    dropConnection(state);
  });
  ws.on("error", () => {
    clearInterval(heartbeat);
    room.subscribers.delete(sendState);
    dropConnection(state);
  });
}

async function handleMessage(s: ConnState, parsed: z.infer<typeof incoming>) {
  const ws = s.ws;

  if (parsed.type === "hello") {
    s.userId = parsed.userId;
    const display = parsed.anonymous
      ? { name: "匿名", emoji: "👤", anonymous: true }
      : {
          name: clampString(parsed.name, 16) || "未命名",
          emoji: parsed.emoji || "🎤",
          anonymous: false,
        };
    setUser(s.room, s.userId, display);
    sendFavoritesSnapshot(s);
    return;
  }

  if (!s.userId) {
    send(ws, { type: "error", error: "hello first" });
    return;
  }

  switch (parsed.type) {
    case "heartbeat":
      touchUser(s.room, s.userId);
      return;

    case "queue.add": {
      if (!queueAddLimiter.allow(s.userId)) {
        send(ws, { type: "error", error: "rate limited (queue.add)" });
        return;
      }
      if (parsed.song && parsed.ref) {
        send(ws, { type: "error", error: "supply either song or ref, not both" });
        return;
      }
      const presence = s.room.state.users[s.userId];
      const fallbackAddedBy = {
        id: s.userId,
        name: presence?.name ?? "未命名",
        emoji: presence?.emoji ?? "🎤",
        anonymous: presence?.anonymous ?? false,
      };
      let song: Omit<Song, "id" | "addedAt"> | null = null;
      if (parsed.song) {
        const sng = parsed.song;
        song = {
          source: sng.source,
          videoId: sng.videoId,
          page: sng.page,
          cid: sng.cid,
          title: clampString(sng.title, 300) || `${sng.source} ${sng.videoId}`,
          thumb: sng.thumb ?? null,
          duration: sng.duration,
          addedBy: {
            id: sng.addedBy.id ?? s.userId,
            name: clampString(sng.addedBy.name, 32),
            emoji: sng.addedBy.emoji,
            anonymous: sng.addedBy.anonymous,
          },
        };
      } else if (parsed.ref) {
        const ref = parsed.ref;
        const page = ref.source === "bili" ? ref.page ?? 1 : undefined;
        let cid: number | undefined = ref.cid;
        const cached = findFavorite(
          ref.source,
          ref.videoId,
          ref.source === "bili" ? page ?? 0 : 0,
        );
        let title: string | undefined = cached?.title;
        let thumb: string | null | undefined = cached?.thumb ?? null;
        let duration: number | undefined = cached?.duration;
        // Re-parse when (a) we don't have a title yet, OR (b) it's
        // Bilibili and we still don't know cid (the favorites cache
        // does not store cid in v1, so a catalog re-add for an
        // already-known favorite still needs an upstream call to
        // pick up the per-page cid).
        const needsReparse = !title || (ref.source === "bili" && cid === undefined);
        if (needsReparse) {
          try {
            const meta = await parseRef(ref);
            title = title ?? meta.title;
            thumb = thumb ?? meta.thumb ?? null;
            duration = duration ?? meta.duration;
            cid = cid ?? meta.cid;
          } catch {
            title = title ?? `${ref.source === "yt" ? "YouTube" : "Bilibili"} ${ref.videoId}`;
          }
        }
        song = {
          source: ref.source,
          videoId: ref.videoId,
          page,
          cid,
          title: title ?? `${ref.source === "yt" ? "YouTube" : "Bilibili"} ${ref.videoId}`,
          thumb: thumb ?? null,
          duration,
          addedBy: fallbackAddedBy,
        };
      }
      if (!song) {
        send(ws, { type: "error", error: "queue.add needs song or ref" });
        return;
      }
      queueAdd(s.room, song);
      return;
    }

    case "queue.move":
      queueMove(s.room, parsed.id, parsed.delta);
      return;
    case "queue.reorder":
      queueReorder(s.room, parsed.id, parsed.toIndex);
      return;
    case "queue.top":
      queueTop(s.room, parsed.id);
      return;
    case "queue.remove":
      queueRemove(s.room, parsed.id);
      return;
    case "queue.shuffle":
      queueShuffle(s.room);
      return;
    case "queue.clear":
      queueClear(s.room);
      return;

    case "track.next":
      trackNext(s.room);
      return;
    case "track.prev":
      trackPrev(s.room);
      return;
    case "track.meta":
      trackMeta(s.room, parsed.id, parsed.patch);
      return;

    case "danmaku": {
      if (!danmakuLimiter.allow(s.userId)) {
        send(ws, { type: "error", error: "rate limited (danmaku)" });
        return;
      }
      const msg = {
        id: uuid(),
        ts: now(),
        text: clampString(parsed.text, 80),
        authorId: s.userId,
      };
      pushDanmaku(s.room, msg);
      return;
    }

    case "profile.update": {
      const cur = s.room.state.users[s.userId] ?? {
        name: "未命名",
        emoji: "🎤",
        anonymous: false,
        lastSeen: now(),
      };
      const next = {
        name: parsed.name !== undefined ? clampString(parsed.name, 16) || "未命名" : cur.name,
        emoji: parsed.emoji ?? cur.emoji,
        anonymous: parsed.anonymous ?? cur.anonymous,
      };
      if (next.anonymous) {
        next.name = "匿名";
        next.emoji = "👤";
      }
      setUser(s.room, s.userId, next);
      return;
    }

    case "favorite.add": {
      if (!favoriteLimiter.allow(s.userId)) {
        send(ws, { type: "error", error: "rate limited (favorite)" });
        return;
      }
      const fav = parsed.song;
      const page = fav.source === "bili" ? fav.page ?? 1 : 0;
      let title = fav.title;
      let thumb = fav.thumb ?? null;
      let duration = fav.duration;
      let cid: number | undefined = fav.cid;
      // Re-parse if title is missing OR (Bilibili AND we don't yet have
      // cid). The cid is the persistent reason for the round-trip — once
      // we have it, repeat re-adds won't pay this cost again. Failure of
      // the upstream call is non-fatal: title falls back to a synthetic
      // string and cid stays undefined.
      const needsReparse =
        !title || (fav.source === "bili" && cid === undefined);
      if (needsReparse) {
        try {
          const meta = await parseRef({
            source: fav.source,
            videoId: fav.videoId,
            page: fav.source === "bili" ? page : undefined,
          });
          title = title ?? meta.title;
          thumb = thumb ?? meta.thumb ?? null;
          duration = duration ?? meta.duration;
          cid = cid ?? meta.cid;
        } catch {
          title = title ?? `${fav.source === "yt" ? "YouTube" : "Bilibili"} ${fav.videoId}`;
        }
      }
      // Stamp the favoriter — server-side from presence so a client can't
      // claim someone else's identity. First-starrer wins (PK conflict
      // does nothing).
      const presence = s.room.state.users[s.userId];
      const addedBy = {
        id: s.userId,
        name: presence?.name ?? "未命名",
        emoji: presence?.emoji ?? "🎤",
      };
      const row: Favorite = {
        source: fav.source,
        videoId: fav.videoId,
        page,
        title: title ?? `${fav.source === "yt" ? "YouTube" : "Bilibili"} ${fav.videoId}`,
        thumb: thumb ?? null,
        duration,
        addedBy,
        addedAt: now(),
        cid,
      };
      const result = addFavorite(row);
      // Only log when this was a real insert. The "first starrer wins"
      // no-op path is not a state mutation and must NOT pollute the audit.
      if (result.inserted) {
        const after = findFavorite(fav.source, fav.videoId, page);
        appendFavoriteAudit({
          ts: row.addedAt,
          op: "add",
          source: fav.source,
          videoId: fav.videoId,
          page,
          user: addedBy,
          before: null,
          after: after ?? row,
        });
      }
      broadcastFavorites();
      return;
    }

    case "favorite.update": {
      if (!favoriteLimiter.allow(s.userId)) {
        send(ws, { type: "error", error: "rate limited (favorite)" });
        return;
      }
      // Build a patch only from keys that were ACTUALLY present in the
      // wire message (so omitted fields stay untouched, explicit null
      // clears the column).
      const patch: FavoritePatch = {};
      if ("displayTitle" in parsed) patch.displayTitle = parsed.displayTitle ?? null;
      if ("authors" in parsed) patch.authors = parsed.authors ?? null;
      if ("mode" in parsed) patch.mode = parsed.mode ?? null;
      const { before, after } = updateFavorite(
        parsed.source,
        parsed.videoId,
        parsed.page,
        patch,
      );
      if (!before) {
        send(ws, { type: "error", error: "unknown favorite" });
        return;
      }
      const presence = s.room.state.users[s.userId];
      appendFavoriteAudit({
        ts: now(),
        op: "update",
        source: parsed.source,
        videoId: parsed.videoId,
        page: parsed.page,
        user: {
          id: s.userId,
          name: presence?.name,
          emoji: presence?.emoji,
        },
        before,
        after,
      });
      broadcastFavorites();
      return;
    }

    case "favorite.remove": {
      if (!favoriteLimiter.allow(s.userId)) {
        send(ws, { type: "error", error: "rate limited (favorite)" });
        return;
      }
      const before = removeFavorite(parsed.source, parsed.videoId, parsed.page);
      if (!before) {
        send(ws, { type: "error", error: "unknown favorite" });
        return;
      }
      const presence = s.room.state.users[s.userId];
      appendFavoriteAudit({
        ts: now(),
        op: "remove",
        source: parsed.source,
        videoId: parsed.videoId,
        page: parsed.page,
        user: {
          id: s.userId,
          name: presence?.name,
          emoji: presence?.emoji,
        },
        before,
        after: null,
      });
      broadcastFavorites();
      return;
    }

    case "favorite.list": {
      sendFavoritesSnapshot(s);
      return;
    }
  }
}
