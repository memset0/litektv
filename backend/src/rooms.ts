import { config } from "./config.js";
import type { DanmakuMsg, RoomState, Song, UserPresence } from "./types.js";
import { now, uuid } from "./util.js";

export interface Room {
  state: RoomState;
  lastActivity: number;
  subscribers: Set<(state: RoomState) => void>;
}

const rooms = new Map<string, Room>();

function blankState(slug: string): RoomState {
  return {
    slug,
    current: null,
    queue: [],
    history: [],
    users: {},
    danmaku: [],
    rev: 0,
  };
}

export function getOrCreateRoom(slug: string): Room {
  let r = rooms.get(slug);
  if (!r) {
    r = {
      state: blankState(slug),
      lastActivity: now(),
      subscribers: new Set(),
    };
    rooms.set(slug, r);
  }
  return r;
}

function bump(room: Room) {
  room.state.rev += 1;
  room.lastActivity = now();
  for (const fn of room.subscribers) {
    try {
      fn(room.state);
    } catch {
      // ignore
    }
  }
}

export function setUser(room: Room, userId: string, profile: Omit<UserPresence, "lastSeen">) {
  room.state.users[userId] = { ...profile, lastSeen: now() };
  bump(room);
}

export function touchUser(room: Room, userId: string) {
  const u = room.state.users[userId];
  if (u) {
    u.lastSeen = now();
    room.lastActivity = now();
  }
}

export function pruneOfflineUsers(room: Room) {
  const cutoff = now() - config.presenceOnlineMs;
  let changed = false;
  for (const [id, u] of Object.entries(room.state.users)) {
    if (u.lastSeen < cutoff) {
      delete room.state.users[id];
      changed = true;
    }
  }
  if (changed) bump(room);
}

export function queueAdd(room: Room, song: Omit<Song, "id" | "addedAt"> & { id?: string }) {
  const fullSong: Song = {
    ...song,
    id: song.id ?? uuid(),
    addedAt: now(),
  };
  if (!room.state.current) {
    room.state.current = fullSong;
  } else {
    room.state.queue.push(fullSong);
  }
  bump(room);
}

export function queueRemove(room: Room, id: string) {
  const idx = room.state.queue.findIndex((s) => s.id === id);
  if (idx < 0) return;
  room.state.queue.splice(idx, 1);
  bump(room);
}

export function queueMove(room: Room, id: string, delta: -1 | 1) {
  const q = room.state.queue;
  const idx = q.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const target = idx + delta;
  if (target < 0 || target >= q.length) return;
  const [item] = q.splice(idx, 1);
  q.splice(target, 0, item!);
  bump(room);
}

export function queueTop(room: Room, id: string) {
  const q = room.state.queue;
  const idx = q.findIndex((s) => s.id === id);
  if (idx <= 0) return;
  const [item] = q.splice(idx, 1);
  q.unshift(item!);
  bump(room);
}

export function queueShuffle(room: Room) {
  const q = room.state.queue;
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j]!, q[i]!];
  }
  bump(room);
}

export function queueClear(room: Room) {
  room.state.queue = [];
  bump(room);
}

export function trackNext(room: Room) {
  if (room.state.current) {
    const finished: Song = { ...room.state.current, finishedAt: now() };
    room.state.history.push(finished);
  }
  room.state.current = room.state.queue.shift() ?? null;
  bump(room);
}

export function trackPrev(room: Room) {
  const prev = room.state.history.pop();
  if (!prev) return;
  if (room.state.current) {
    const c = { ...room.state.current };
    delete c.finishedAt;
    room.state.queue.unshift(c);
  }
  delete prev.finishedAt;
  room.state.current = prev;
  bump(room);
}

export function trackMeta(
  room: Room,
  id: string,
  patch: Partial<Pick<Song, "title" | "thumb" | "duration">>,
) {
  const apply = (s: Song) => {
    if (patch.title !== undefined) s.title = patch.title;
    if (patch.thumb !== undefined) s.thumb = patch.thumb;
    if (patch.duration !== undefined) s.duration = patch.duration;
  };
  if (room.state.current?.id === id) apply(room.state.current);
  for (const s of room.state.queue) if (s.id === id) apply(s);
  for (const s of room.state.history) if (s.id === id) apply(s);
  bump(room);
}

export function pushDanmaku(room: Room, msg: DanmakuMsg) {
  room.state.danmaku.push(msg);
  if (room.state.danmaku.length > config.danmakuRingSize) {
    room.state.danmaku.splice(0, room.state.danmaku.length - config.danmakuRingSize);
  }
  bump(room);
}

export function gcRooms() {
  const cutoff = now() - config.roomTtlMs;
  for (const [slug, room] of rooms) {
    if (room.lastActivity < cutoff && room.subscribers.size === 0) {
      rooms.delete(slug);
    }
  }
}

export function listRooms(): string[] {
  return [...rooms.keys()];
}
