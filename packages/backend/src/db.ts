import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Favorite, OwnerKey, RoomState, Source } from "./types.js";

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

    CREATE TABLE IF NOT EXISTS favorites (
      owner_key    TEXT NOT NULL,
      source       TEXT NOT NULL,
      video_id     TEXT NOT NULL,
      page         INTEGER NOT NULL DEFAULT 0,
      title        TEXT NOT NULL,
      thumb        TEXT,
      duration     INTEGER,
      added_at     INTEGER NOT NULL,
      PRIMARY KEY (owner_key, source, video_id, page)
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_owner_added ON favorites(owner_key, added_at DESC);
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

// ── Favorites ──────────────────────────────────────────────────────────────

interface FavoriteRow {
  source: string;
  video_id: string;
  page: number;
  title: string;
  thumb: string | null;
  duration: number | null;
  added_at: number;
}

function rowToFavorite(r: FavoriteRow): Favorite {
  return {
    source: r.source as Source,
    videoId: r.video_id,
    page: r.page,
    title: r.title,
    thumb: r.thumb,
    duration: r.duration ?? undefined,
    addedAt: r.added_at,
  };
}

export function listFavorites(ownerKey: OwnerKey): Favorite[] {
  const rows = requireDb()
    .prepare(
      `SELECT source, video_id, page, title, thumb, duration, added_at
       FROM favorites WHERE owner_key = ? ORDER BY added_at DESC`,
    )
    .all(ownerKey) as FavoriteRow[];
  return rows.map(rowToFavorite);
}

export function findFavorite(
  ownerKey: OwnerKey,
  source: Source,
  videoId: string,
  page: number,
): Favorite | null {
  const row = requireDb()
    .prepare(
      `SELECT source, video_id, page, title, thumb, duration, added_at
       FROM favorites WHERE owner_key = ? AND source = ? AND video_id = ? AND page = ?`,
    )
    .get(ownerKey, source, videoId, page) as FavoriteRow | undefined;
  return row ? rowToFavorite(row) : null;
}

export function addFavorite(
  ownerKey: OwnerKey,
  fav: Favorite,
): { inserted: boolean } {
  const result = requireDb()
    .prepare(
      `INSERT INTO favorites (owner_key, source, video_id, page, title, thumb, duration, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_key, source, video_id, page) DO NOTHING`,
    )
    .run(
      ownerKey,
      fav.source,
      fav.videoId,
      fav.page,
      fav.title,
      fav.thumb ?? null,
      fav.duration ?? null,
      fav.addedAt,
    );
  return { inserted: result.changes > 0 };
}

export function removeFavorite(
  ownerKey: OwnerKey,
  source: Source,
  videoId: string,
  page: number,
): { removed: boolean } {
  const result = requireDb()
    .prepare(
      `DELETE FROM favorites WHERE owner_key = ? AND source = ? AND video_id = ? AND page = ?`,
    )
    .run(ownerKey, source, videoId, page);
  return { removed: result.changes > 0 };
}

