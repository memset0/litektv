import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type { Account, Favorite, OwnerKey, RoomState, Session, Source } from "./types.js";

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

    CREATE TABLE IF NOT EXISTS accounts (
      account_id    TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      emoji         TEXT NOT NULL DEFAULT '🎤',
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token        TEXT PRIMARY KEY,
      account_id   TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL,
      last_seen    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_links (
      user_id      TEXT PRIMARY KEY,
      account_id   TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
      linked_at    INTEGER NOT NULL
    );

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

// ── Accounts ───────────────────────────────────────────────────────────────

interface AccountRow {
  account_id: string;
  name: string;
  emoji: string;
  password_hash: string;
  created_at: number;
  last_seen: number;
}

function rowToAccount(r: AccountRow): Account {
  return {
    accountId: r.account_id,
    name: r.name,
    emoji: r.emoji,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
  };
}

export function insertAccount(args: {
  accountId: string;
  name: string;
  emoji: string;
  passwordHash: string;
  createdAt: number;
}): void {
  requireDb()
    .prepare(
      `INSERT INTO accounts (account_id, name, emoji, password_hash, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(args.accountId, args.name, args.emoji, args.passwordHash, args.createdAt, args.createdAt);
}

export function findAccountByName(
  name: string,
): (Account & { passwordHash: string }) | null {
  const row = requireDb()
    .prepare(
      `SELECT account_id, name, emoji, password_hash, created_at, last_seen
       FROM accounts WHERE name = ? COLLATE NOCASE`,
    )
    .get(name) as AccountRow | undefined;
  if (!row) return null;
  return { ...rowToAccount(row), passwordHash: row.password_hash };
}

export function getAccountById(accountId: string): Account | null {
  const row = requireDb()
    .prepare(
      `SELECT account_id, name, emoji, password_hash, created_at, last_seen
       FROM accounts WHERE account_id = ?`,
    )
    .get(accountId) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function updateAccount(
  accountId: string,
  patch: { name?: string; emoji?: string; passwordHash?: string },
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name);
  }
  if (patch.emoji !== undefined) {
    sets.push("emoji = ?");
    vals.push(patch.emoji);
  }
  if (patch.passwordHash !== undefined) {
    sets.push("password_hash = ?");
    vals.push(patch.passwordHash);
  }
  if (sets.length === 0) return;
  vals.push(accountId);
  requireDb()
    .prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE account_id = ?`)
    .run(...vals);
}

export function touchAccount(accountId: string, ts: number): void {
  requireDb()
    .prepare(`UPDATE accounts SET last_seen = ? WHERE account_id = ?`)
    .run(ts, accountId);
}

// ── Sessions ───────────────────────────────────────────────────────────────

interface SessionRow {
  token: string;
  account_id: string;
  created_at: number;
  last_seen: number;
}

export function createSession(args: {
  token: string;
  accountId: string;
  createdAt: number;
}): void {
  requireDb()
    .prepare(
      `INSERT INTO sessions (token, account_id, created_at, last_seen) VALUES (?, ?, ?, ?)`,
    )
    .run(args.token, args.accountId, args.createdAt, args.createdAt);
}

export function findSessionByToken(token: string): Session | null {
  const row = requireDb()
    .prepare(`SELECT token, account_id, created_at, last_seen FROM sessions WHERE token = ?`)
    .get(token) as SessionRow | undefined;
  if (!row) return null;
  return {
    token: row.token,
    accountId: row.account_id,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
  };
}

export function touchSession(token: string, ts: number): void {
  requireDb().prepare(`UPDATE sessions SET last_seen = ? WHERE token = ?`).run(ts, token);
}

export function deleteSession(token: string): void {
  requireDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

// ── User links (anonymous userId ↔ account) ───────────────────────────────

export function getUserLink(userId: string): { userId: string; accountId: string | null } | null {
  const row = requireDb()
    .prepare(`SELECT user_id, account_id FROM user_links WHERE user_id = ?`)
    .get(userId) as { user_id: string; account_id: string | null } | undefined;
  if (!row) return null;
  return { userId: row.user_id, accountId: row.account_id };
}

export function linkUserToAccount(userId: string, accountId: string, ts: number): void {
  requireDb()
    .prepare(
      `INSERT INTO user_links (user_id, account_id, linked_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET account_id = excluded.account_id, linked_at = excluded.linked_at`,
    )
    .run(userId, accountId, ts);
}

export function unlinkUser(userId: string, ts: number): void {
  requireDb()
    .prepare(
      `INSERT INTO user_links (user_id, account_id, linked_at) VALUES (?, NULL, ?)
       ON CONFLICT(user_id) DO UPDATE SET account_id = NULL, linked_at = excluded.linked_at`,
    )
    .run(userId, ts);
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

/**
 * Move every `anon:<userId>` favorite into `acct:<accountId>` and link the
 * user. Runs in a single transaction; on conflict the existing account row
 * wins (preserves its `added_at`).
 */
export function mergeAnonFavoritesIntoAccount(
  userId: string,
  accountId: string,
  ts: number,
): void {
  const anonKey: OwnerKey = `anon:${userId}`;
  const acctKey: OwnerKey = `acct:${accountId}`;
  const d = requireDb();
  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO favorites (owner_key, source, video_id, page, title, thumb, duration, added_at)
       SELECT ?, source, video_id, page, title, thumb, duration, added_at
       FROM favorites WHERE owner_key = ?
       ON CONFLICT(owner_key, source, video_id, page) DO NOTHING`,
    ).run(acctKey, anonKey);
    d.prepare(`DELETE FROM favorites WHERE owner_key = ?`).run(anonKey);
    d.prepare(
      `INSERT INTO user_links (user_id, account_id, linked_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET account_id = excluded.account_id, linked_at = excluded.linked_at`,
    ).run(userId, accountId, ts);
  });
  tx();
}
