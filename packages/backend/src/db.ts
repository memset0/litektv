import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Favorite, RoomState, Source } from "./types.js";

let db: Database.Database | null = null;

export function initDb(): void {
  const dbPath = path.resolve(config.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      slug          TEXT PRIMARY KEY,
      state         TEXT NOT NULL,
      last_activity INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity);

    -- Favorites are GLOBAL (site-wide). PK is the canonical
    -- (source, video_id, page) triple — first starrer wins; subsequent
    -- favorite.add for the same triple is a no-op.
    CREATE TABLE IF NOT EXISTS favorites (
      source         TEXT NOT NULL,
      video_id       TEXT NOT NULL,
      page           INTEGER NOT NULL DEFAULT 0,
      title          TEXT NOT NULL,
      thumb          TEXT,
      duration       INTEGER,
      added_by_id    TEXT,
      added_by_name  TEXT,
      added_by_emoji TEXT,
      added_at       INTEGER NOT NULL,
      PRIMARY KEY (source, video_id, page)
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);
  `);
}

function requireDb(): Database.Database {
  if (!db) throw new Error("db not initialized");
  return db;
}

interface RoomRow {
  slug: string;
  state: string;
  last_activity: number;
}

export interface PersistedRoom {
  slug: string;
  state: RoomState;
  lastActivity: number;
}

export function loadAllRooms(): PersistedRoom[] {
  const rows = requireDb()
    .prepare("SELECT slug, state, last_activity FROM rooms")
    .all() as RoomRow[];
  const out: PersistedRoom[] = [];
  for (const r of rows) {
    try {
      out.push({ slug: r.slug, state: JSON.parse(r.state) as RoomState, lastActivity: r.last_activity });
    } catch {
      // corrupted row — drop it
    }
  }
  return out;
}

export function saveRoom(slug: string, state: RoomState, lastActivity: number): void {
  requireDb()
    .prepare(
      `INSERT INTO rooms (slug, state, last_activity) VALUES (?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET state = excluded.state, last_activity = excluded.last_activity`,
    )
    .run(slug, JSON.stringify(state), lastActivity);
}

export function deleteRoom(slug: string): void {
  requireDb().prepare("DELETE FROM rooms WHERE slug = ?").run(slug);
}

// ── Favorites (GLOBAL — site-wide; not scoped per user) ───────────────────

interface FavoriteRow {
  source: string;
  video_id: string;
  page: number;
  title: string;
  thumb: string | null;
  duration: number | null;
  added_by_id: string | null;
  added_by_name: string | null;
  added_by_emoji: string | null;
  added_at: number;
}

function rowToFavorite(r: FavoriteRow): Favorite {
  const addedBy =
    r.added_by_name || r.added_by_emoji || r.added_by_id
      ? {
          id: r.added_by_id ?? undefined,
          name: r.added_by_name ?? "未命名",
          emoji: r.added_by_emoji ?? "🎤",
        }
      : null;
  return {
    source: r.source as Source,
    videoId: r.video_id,
    page: r.page,
    title: r.title,
    thumb: r.thumb,
    duration: r.duration ?? undefined,
    addedBy,
    addedAt: r.added_at,
  };
}

const FAV_SELECT = `SELECT source, video_id, page, title, thumb, duration,
                          added_by_id, added_by_name, added_by_emoji, added_at`;

export function listFavorites(): Favorite[] {
  const rows = requireDb()
    .prepare(`${FAV_SELECT} FROM favorites ORDER BY added_at DESC`)
    .all() as FavoriteRow[];
  return rows.map(rowToFavorite);
}

export function findFavorite(
  source: Source,
  videoId: string,
  page: number,
): Favorite | null {
  const row = requireDb()
    .prepare(
      `${FAV_SELECT} FROM favorites WHERE source = ? AND video_id = ? AND page = ?`,
    )
    .get(source, videoId, page) as FavoriteRow | undefined;
  return row ? rowToFavorite(row) : null;
}

export function addFavorite(fav: Favorite): { inserted: boolean } {
  const result = requireDb()
    .prepare(
      `INSERT INTO favorites
         (source, video_id, page, title, thumb, duration,
          added_by_id, added_by_name, added_by_emoji, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, video_id, page) DO NOTHING`,
    )
    .run(
      fav.source,
      fav.videoId,
      fav.page,
      fav.title,
      fav.thumb ?? null,
      fav.duration ?? null,
      fav.addedBy?.id ?? null,
      fav.addedBy?.name ?? null,
      fav.addedBy?.emoji ?? null,
      fav.addedAt,
    );
  return { inserted: result.changes > 0 };
}
