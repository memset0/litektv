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
