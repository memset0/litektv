const env = process.env;

export const config = {
  port: Number(env.PORT ?? 38117),
  host: env.HOST ?? "127.0.0.1",
  staticDir: env.STATIC_DIR ?? null,
  dbPath: env.DB_PATH ?? "./data/litektv.db",
  roomTtlMs: Number(env.ROOM_TTL_MS ?? 24 * 60 * 60 * 1000),
  presenceOnlineMs: 60_000,
  danmakuRingSize: 50,
  // When true, embed Vite middleware (SPA + HMR) on the same HTTP server
  // as REST + /ws. Toggled via NODE_ENV so a misconfigured prod box never
  // accidentally loads vite at runtime.
  devMode: env.NODE_ENV === "development",
  rateLimits: {
    "queue.add": { perMinute: 30 },
    "danmaku": { perMinute: 60 },
    "parse": { perMinute: 20 },
    "favorite": { perMinute: 60 },
  },
} as const;
