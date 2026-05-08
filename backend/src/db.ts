import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { RoomState } from "./types.js";

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
