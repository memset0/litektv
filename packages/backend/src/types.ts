export type Source = "yt" | "bili";

export interface AddedBy {
  id?: string;
  name: string;
  emoji: string;
  anonymous: boolean;
}

export interface Song {
  id: string;
  source: Source;
  videoId: string;
  page?: number;
  /**
   * Bilibili content-id of the specific page. Optional; when present the
   * frontend uses it as the most precise selector for the embed iframe
   * (Bilibili's player.html honours `&cid=N` more reliably than `&page=N`
   * across devices). Set by the parser from the upstream
   * `/x/web-interface/view` `pages[]` array. Always undefined for YouTube.
   */
  cid?: number;
  title: string;
  thumb?: string | null;
  duration?: number;
  addedBy: AddedBy;
  addedAt: number;
  finishedAt?: number;
}

export interface UserPresence {
  name: string;
  emoji: string;
  anonymous: boolean;
  lastSeen: number;
}

export interface DanmakuMsg {
  id: string;
  ts: number;
  text: string;
  authorId?: string;
}

export interface RoomState {
  slug: string;
  current: Song | null;
  queue: Song[];
  history: Song[];
  users: Record<string, UserPresence>;
  danmaku: DanmakuMsg[];
  rev: number;
}

export interface ParsedSongMeta {
  source: Source;
  videoId: string;
  page?: number;
  /** Bilibili-only per-page content-id. See Song.cid for the rationale. */
  cid?: number;
  title: string;
  thumb?: string | null;
  duration?: number;
}

// ── Favorites (GLOBAL — site-wide list, not per-user) ─────────────────────

export interface FavoriteAddedBy {
  id?: string;
  name: string;
  emoji: string;
}

export type FavoriteMode = "instr" | "vocal";

export interface Favorite {
  source: Source;
  videoId: string;
  page: number; // 0 means "no page"
  title: string;
  thumb?: string | null;
  duration?: number;
  /** Who first starred this song (set on insert; not overwritten). */
  addedBy: FavoriteAddedBy | null;
  addedAt: number;
  /** Operator-curated canonical name (simplified Chinese for CN parts). */
  displayTitle?: string;
  /** Operator-curated author list (singer / composer / lyricist / ...). */
  authors?: string[];
  /** Operator-curated mode: "instr" = 伴奏, "vocal" = 原唱. */
  mode?: FavoriteMode;
  /**
   * Bilibili per-page content-id. Persisted so the catalog can ship it in
   * `queue.add` refs without an extra upstream API call. Always undefined
   * for YouTube favorites; may be undefined for legacy Bilibili rows that
   * pre-date the cid column (those get backfilled lazily on next add).
   */
  cid?: number;
}

export type FavoriteAuditOp = "add" | "update" | "remove" | "rollback";

export interface FavoriteAuditActor {
  id?: string;
  name?: string;
  emoji?: string;
}

export interface FavoriteAuditEntry {
  id: number;
  ts: number;
  op: FavoriteAuditOp;
  source: Source | null;
  videoId: string | null;
  page: number | null;
  user: FavoriteAuditActor | null;
  /** Snapshot of the row before the op (null for `add` and `rollback` row-level entries). */
  before: Favorite | Favorite[] | null;
  /** Snapshot of the row after the op (null for `remove`). */
  after: Favorite | Favorite[] | null;
}

/** Canonical reference to a video, sufficient to re-fetch metadata. */
export interface SongRef {
  source: Source;
  videoId: string;
  page?: number;
  /** Bilibili per-page content-id; when supplied, callers may skip a
   *  parseRef round-trip and use this value directly. See `Song.cid`. */
  cid?: number;
}
