const env = process.env;

export const config = {
  port: Number(env.PORT ?? 38117),
  host: env.HOST ?? "127.0.0.1",
  staticDir: env.STATIC_DIR ?? null,
  roomTtlMs: Number(env.ROOM_TTL_MS ?? 24 * 60 * 60 * 1000),
  presenceOnlineMs: 60_000,
  danmakuRingSize: 50,
  rateLimits: {
    "queue.add": { perMinute: 30 },
    "danmaku": { perMinute: 60 },
    "parse": { perMinute: 20 },
  },
} as const;
