import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { config } from "./config.js";
import { RateLimiter } from "./rateLimit.js";
import {
  getOrCreateRoom,
  pushDanmaku,
  queueAdd,
  queueClear,
  queueMove,
  queueRemove,
  queueShuffle,
  queueTop,
  setUser,
  touchUser,
  trackMeta,
  trackNext,
  trackPrev,
  type Room,
} from "./rooms.js";
import type { Song } from "./types.js";
import { clampString, now, uuid } from "./util.js";

const queueAddLimiter = new RateLimiter(config.rateLimits["queue.add"].perMinute);
const danmakuLimiter = new RateLimiter(config.rateLimits.danmaku.perMinute);

const songSchema = z.object({
  id: z.string().optional(),
  source: z.enum(["yt", "bili"]),
  videoId: z.string().min(1).max(64),
  page: z.number().int().min(1).optional(),
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

const incoming = z.discriminatedUnion("type", [
  helloSchema,
  z.object({ type: z.literal("heartbeat") }),
  z.object({ type: z.literal("queue.add"), song: songSchema }),
  z.object({ type: z.literal("queue.move"), id: z.string(), delta: z.union([z.literal(-1), z.literal(1)]) }),
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
]);

interface ClientCtx {
  ws: WebSocket;
  room: Room;
  userId: string;
  unsubscribe: () => void;
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export function attachWs(server: import("node:http").Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
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

function onConnection(ws: WebSocket, slug: string) {
  const room = getOrCreateRoom(slug);
  let userId: string | null = null;

  const sendState = (state: import("./types.js").RoomState) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "state", state }));
    }
  };
  room.subscribers.add(sendState);

  send(ws, { type: "state", state: room.state });

  const heartbeat = setInterval(() => {
    if (userId) touchUser(room, userId);
  }, 20_000);

  ws.on("message", (raw) => {
    let parsed: z.infer<typeof incoming>;
    try {
      const obj = JSON.parse(raw.toString());
      parsed = incoming.parse(obj);
    } catch {
      send(ws, { type: "error", error: "bad message" });
      return;
    }

    if (parsed.type === "hello") {
      userId = parsed.userId;
      const display = parsed.anonymous
        ? { name: "匿名", emoji: "👤", anonymous: true }
        : {
            name: clampString(parsed.name, 16) || "未命名",
            emoji: parsed.emoji || "🎤",
            anonymous: false,
          };
      setUser(room, userId, display);
      return;
    }

    if (!userId) {
      send(ws, { type: "error", error: "hello first" });
      return;
    }

    switch (parsed.type) {
      case "heartbeat":
        touchUser(room, userId);
        return;

      case "queue.add": {
        if (!queueAddLimiter.allow(userId)) {
          send(ws, { type: "error", error: "rate limited (queue.add)" });
          return;
        }
        const s = parsed.song;
        const song: Omit<Song, "id" | "addedAt"> = {
          source: s.source,
          videoId: s.videoId,
          page: s.page,
          title: clampString(s.title, 300) || `${s.source} ${s.videoId}`,
          thumb: s.thumb ?? null,
          duration: s.duration,
          addedBy: {
            id: s.addedBy.id ?? userId,
            name: clampString(s.addedBy.name, 32),
            emoji: s.addedBy.emoji,
            anonymous: s.addedBy.anonymous,
          },
        };
        queueAdd(room, song);
        return;
      }

      case "queue.move":
        queueMove(room, parsed.id, parsed.delta);
        return;
      case "queue.top":
        queueTop(room, parsed.id);
        return;
      case "queue.remove":
        queueRemove(room, parsed.id);
        return;
      case "queue.shuffle":
        queueShuffle(room);
        return;
      case "queue.clear":
        queueClear(room);
        return;

      case "track.next":
        trackNext(room);
        return;
      case "track.prev":
        trackPrev(room);
        return;
      case "track.meta":
        trackMeta(room, parsed.id, parsed.patch);
        return;

      case "danmaku": {
        if (!danmakuLimiter.allow(userId)) {
          send(ws, { type: "error", error: "rate limited (danmaku)" });
          return;
        }
        const msg = {
          id: uuid(),
          ts: now(),
          text: clampString(parsed.text, 80),
          authorId: userId,
        };
        pushDanmaku(room, msg);
        return;
      }

      case "profile.update": {
        const cur = room.state.users[userId] ?? {
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
        setUser(room, userId, next);
        return;
      }
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    room.subscribers.delete(sendState);
  });

  ws.on("error", () => {
    clearInterval(heartbeat);
    room.subscribers.delete(sendState);
  });
}

