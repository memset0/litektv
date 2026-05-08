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
  title: string;
  thumb?: string | null;
  duration?: number;
}

// ── Accounts / sessions / favorites ────────────────────────────────────────

export interface Account {
  accountId: string;
  name: string;
  emoji: string;
  createdAt: number;
  lastSeen: number;
}

export interface Session {
  token: string;
  accountId: string;
  createdAt: number;
  lastSeen: number;
}

export interface Favorite {
  source: Source;
  videoId: string;
  page: number; // 0 means "no page"
  title: string;
  thumb?: string | null;
  duration?: number;
  addedAt: number;
}

export type OwnerKey = `acct:${string}` | `anon:${string}`;

/** Canonical reference to a video, sufficient to re-fetch metadata. */
export interface SongRef {
  source: Source;
  videoId: string;
  page?: number;
}
