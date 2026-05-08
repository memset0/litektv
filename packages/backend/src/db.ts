import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import type {
  Favorite,
  FavoriteAuditActor,
  FavoriteAuditEntry,
  FavoriteAuditOp,
  FavoriteMode,
  RoomState,
  Source,
} from "./types.js";

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
      display_title  TEXT,
      authors        TEXT,
      mode           TEXT CHECK (mode IS NULL OR mode IN ('instr','vocal')),
      PRIMARY KEY (source, video_id, page)
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);

    -- Append-only audit log of every favorite mutation (add/update/remove)
    -- plus point-in-time rollback events. Rolling back the favorites table
    -- to a prior timestamp is implemented by replaying these rows; see
    -- packages/backend/src/rollbackFavorites.ts.
    CREATE TABLE IF NOT EXISTS favorite_audit (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      op          TEXT NOT NULL CHECK (op IN ('add','update','remove','rollback')),
      source      TEXT,
      video_id    TEXT,
      page        INTEGER,
      user_id     TEXT,
      user_name   TEXT,
      user_emoji  TEXT,
      before_json TEXT,
      after_json  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_favorite_audit_ts ON favorite_audit(ts);
    CREATE INDEX IF NOT EXISTS idx_favorite_audit_key ON favorite_audit(source, video_id, page, ts);

    -- Thumbnail cache. Bytes stored as a BLOB so the whole cache survives
    -- alongside room state in a single backup unit. Cache key is
    -- (source, video_id); Bilibili's multipart "page" doesn't vary the cover.
    CREATE TABLE IF NOT EXISTS thumbnails (
      source     TEXT NOT NULL,
      video_id   TEXT NOT NULL,
      mime       TEXT NOT NULL,
      bytes      BLOB NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (source, video_id)
    );
  `);
  // Idempotent migration: add display_title / authors / mode columns to a
  // favorites table that predates them. CREATE TABLE IF NOT EXISTS above
  // is a no-op for existing installs, so we ALTER manually here, swallowing
  // "duplicate column name" so the boot is idempotent across restarts.
  for (const column of [
    "display_title TEXT",
    "authors TEXT",
    "mode TEXT", // CHECK constraint only applies to fresh installs; for upgrades the validation lives at the WS handler level
  ]) {
    try {
      db.exec(`ALTER TABLE favorites ADD COLUMN ${column}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  }
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
  display_title: string | null;
  authors: string | null;
  mode: string | null;
}

function parseAuthors(raw: string | null): string[] | undefined {
  if (raw == null) return undefined;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return undefined;
    const cleaned = v.filter((x): x is string => typeof x === "string" && x.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  } catch {
    return undefined;
  }
}

function parseMode(raw: string | null): FavoriteMode | undefined {
  if (raw === "instr" || raw === "vocal") return raw;
  return undefined;
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
    displayTitle: r.display_title ?? undefined,
    authors: parseAuthors(r.authors),
    mode: parseMode(r.mode),
  };
}

const FAV_SELECT = `SELECT source, video_id, page, title, thumb, duration,
                          added_by_id, added_by_name, added_by_emoji, added_at,
                          display_title, authors, mode`;

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

/**
 * Partial update of a favorite's manual-metadata columns. Fields whose key is
 * absent from `patch` SHALL NOT be touched. Fields with explicit `null` SHALL
 * clear the column. Returns `{ before, after }` pair (both null if no row
 * matched the identity). Wraps the SELECT-then-UPDATE in a transaction so
 * the snapshots are coherent under concurrent writes.
 */
export interface FavoritePatch {
  displayTitle?: string | null;
  authors?: string[] | null;
  mode?: FavoriteMode | null;
}
export function updateFavorite(
  source: Source,
  videoId: string,
  page: number,
  patch: FavoritePatch,
): { before: Favorite | null; after: Favorite | null } {
  const d = requireDb();
  const txn = d.transaction((): { before: Favorite | null; after: Favorite | null } => {
    const before = findFavorite(source, videoId, page);
    if (!before) return { before: null, after: null };
    const sets: string[] = [];
    const args: (string | null)[] = [];
    if ("displayTitle" in patch) {
      sets.push("display_title = ?");
      args.push(patch.displayTitle ?? null);
    }
    if ("authors" in patch) {
      sets.push("authors = ?");
      args.push(
        patch.authors == null
          ? null
          : JSON.stringify(patch.authors.filter((a) => a.length > 0)),
      );
    }
    if ("mode" in patch) {
      sets.push("mode = ?");
      args.push(patch.mode ?? null);
    }
    if (sets.length === 0) {
      return { before, after: before };
    }
    args.push(source, videoId, String(page));
    d.prepare(
      `UPDATE favorites SET ${sets.join(", ")}
       WHERE source = ? AND video_id = ? AND page = ?`,
    ).run(...args);
    const after = findFavorite(source, videoId, page);
    return { before, after };
  });
  return txn();
}

/**
 * Delete a favorite row; returns the deleted row's full state (or null if no
 * match). The DELETE is wrapped in a transaction with the SELECT so the
 * before-snapshot is coherent.
 */
export function removeFavorite(
  source: Source,
  videoId: string,
  page: number,
): Favorite | null {
  const d = requireDb();
  const txn = d.transaction((): Favorite | null => {
    const before = findFavorite(source, videoId, page);
    if (!before) return null;
    d.prepare(
      "DELETE FROM favorites WHERE source = ? AND video_id = ? AND page = ?",
    ).run(source, videoId, page);
    return before;
  });
  return txn();
}

// ── Favorite audit log ────────────────────────────────────────────────────

interface FavoriteAuditRow {
  id: number;
  ts: number;
  op: string;
  source: string | null;
  video_id: string | null;
  page: number | null;
  user_id: string | null;
  user_name: string | null;
  user_emoji: string | null;
  before_json: string | null;
  after_json: string | null;
}

function parseAuditPayload(raw: string | null): Favorite | Favorite[] | null {
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw);
    return v ?? null;
  } catch {
    return null;
  }
}

function rowToAuditEntry(r: FavoriteAuditRow): FavoriteAuditEntry {
  const user: FavoriteAuditActor | null =
    r.user_id || r.user_name || r.user_emoji
      ? {
          id: r.user_id ?? undefined,
          name: r.user_name ?? undefined,
          emoji: r.user_emoji ?? undefined,
        }
      : null;
  return {
    id: r.id,
    ts: r.ts,
    op: r.op as FavoriteAuditOp,
    source: (r.source as Source | null) ?? null,
    videoId: r.video_id,
    page: r.page,
    user,
    before: parseAuditPayload(r.before_json),
    after: parseAuditPayload(r.after_json),
  };
}

const AUDIT_SELECT = `SELECT id, ts, op, source, video_id, page,
                            user_id, user_name, user_emoji,
                            before_json, after_json`;

export interface AppendAuditArgs {
  ts: number;
  op: FavoriteAuditOp;
  source?: Source | null;
  videoId?: string | null;
  page?: number | null;
  user?: FavoriteAuditActor | null;
  before?: Favorite | Favorite[] | null;
  after?: Favorite | Favorite[] | null;
}

export function appendFavoriteAudit(args: AppendAuditArgs): void {
  requireDb()
    .prepare(
      `INSERT INTO favorite_audit
         (ts, op, source, video_id, page,
          user_id, user_name, user_emoji,
          before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.ts,
      args.op,
      args.source ?? null,
      args.videoId ?? null,
      args.page ?? null,
      args.user?.id ?? null,
      args.user?.name ?? null,
      args.user?.emoji ?? null,
      args.before == null ? null : JSON.stringify(args.before),
      args.after == null ? null : JSON.stringify(args.after),
    );
}

export function listFavoriteAudit(
  opts: { sinceTs?: number; untilTs?: number; limit?: number } = {},
): FavoriteAuditEntry[] {
  const where: string[] = [];
  const args: (number | string)[] = [];
  if (opts.sinceTs != null) {
    where.push("ts >= ?");
    args.push(opts.sinceTs);
  }
  if (opts.untilTs != null) {
    where.push("ts <= ?");
    args.push(opts.untilTs);
  }
  const sql =
    `${AUDIT_SELECT} FROM favorite_audit` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY ts ASC, id ASC` +
    (opts.limit != null ? ` LIMIT ${Math.max(0, Math.floor(opts.limit))}` : "");
  const rows = requireDb().prepare(sql).all(...args) as FavoriteAuditRow[];
  return rows.map(rowToAuditEntry);
}

// ── Thumbnail cache ───────────────────────────────────────────────────────

export interface CachedThumb {
  mime: string;
  bytes: Buffer;
  fetchedAt: number;
}

interface ThumbRow {
  mime: string;
  bytes: Buffer;
  fetched_at: number;
}

export function getThumb(source: Source, videoId: string): CachedThumb | null {
  const row = requireDb()
    .prepare("SELECT mime, bytes, fetched_at FROM thumbnails WHERE source = ? AND video_id = ?")
    .get(source, videoId) as ThumbRow | undefined;
  if (!row) return null;
  return { mime: row.mime, bytes: row.bytes, fetchedAt: row.fetched_at };
}

export function putThumb(
  source: Source,
  videoId: string,
  mime: string,
  bytes: Buffer,
  fetchedAt: number,
): void {
  requireDb()
    .prepare(
      `INSERT INTO thumbnails (source, video_id, mime, bytes, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source, video_id) DO UPDATE SET
         mime = excluded.mime,
         bytes = excluded.bytes,
         fetched_at = excluded.fetched_at`,
    )
    .run(source, videoId, mime, bytes, fetchedAt);
}
