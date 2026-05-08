// app.tsx — main App orchestrator (English-only, fixed orbitron / cyber / comfy).

import { useCallback, useEffect, useRef, useState } from "react";
import type { DanmakuMsg, Song, SongRef } from "@litektv/types";
import { SLUG, useFavorites, useMe, useRoom } from "./state";
import {
  AddSongInput,
  CoverThumb,
  Glyph,
  IconBtn,
  NeonButton,
  Onboarding,
  ProfileSheet,
  QueueRow,
  SongCard,
  StarBtn,
  uid,
  type MetaBit,
} from "./app-ui";
import { CatalogModal } from "./catalog";
import { Player } from "./player";

interface DanmakuTrack extends DanmakuMsg {
  lane: number;
  expiresAt: number;
}

function DanmakuLayer({ items }: { items: DanmakuMsg[] | undefined }) {
  const [tracks, setTracks] = useState<DanmakuTrack[]>([]);
  const seenRef = useRef(new Set<string>());
  const trackPtrRef = useRef(0);
  const TRACKS = 5;
  useEffect(() => {
    if (!items) return;
    const fresh = items.filter(
      (d) => !seenRef.current.has(d.id) && Date.now() - d.ts < 14000,
    );
    fresh.forEach((d) => seenRef.current.add(d.id));
    if (!fresh.length) return;
    setTracks((prev) => {
      const next: DanmakuTrack[] = [...prev];
      fresh.forEach((d) => {
        const lane = trackPtrRef.current % TRACKS;
        trackPtrRef.current += 1;
        next.push({ ...d, lane, expiresAt: Date.now() + 12000 });
      });
      return next.filter((d) => d.expiresAt > Date.now());
    });
  }, [items?.length, items?.[items.length - 1]?.id]);
  useEffect(() => {
    const t = setInterval(
      () => setTracks((p) => p.filter((d) => d.expiresAt > Date.now())),
      1500,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="dm-layer" aria-hidden>
      {tracks.map((d) => (
        <div
          key={d.id}
          className="dm-item"
          style={{
            top: `calc(${d.lane * 18 + 6}%)`,
            animationDuration: "11s",
          }}
        >
          {d.text}
        </div>
      ))}
    </div>
  );
}

function DanmakuComposer({ onSend }: { onSend: (text: string) => void }) {
  const [val, setVal] = useState("");
  const fire = () => {
    const v = val.trim();
    if (!v) return;
    onSend(v.slice(0, 80));
    setVal("");
  };
  return (
    <div className="dm-input">
      <input
        className="dm-field"
        placeholder="Send a danmaku — fly it across the room…"
        value={val}
        maxLength={80}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") fire();
        }}
      />
      <button className="dm-send" onClick={fire} title="Fire">
        {Glyph.send}
        <span style={{ marginLeft: 6 }}>FIRE</span>
      </button>
    </div>
  );
}

interface NowPlayingBarProps {
  current: Song | null;
  hasPrev: boolean;
  hasNext: boolean;
  onNext: () => void;
  onPrev: () => void;
}

function NowPlayingBar({ current, hasPrev, hasNext, onNext, onPrev }: NowPlayingBarProps) {
  const isLive = !!current;
  const titleRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    if (!titleRef.current || !wrapRef.current) {
      setOverflow(false);
      return;
    }
    const t = titleRef.current;
    const w = wrapRef.current;
    setOverflow(t.scrollWidth - w.clientWidth > 4);
  }, [current?.id, current?.title]);
  const titleText = current ? current.title : "— Awaiting Signal —";
  return (
    <div className="np-bar">
      <IconBtn
        glyph={Glyph.prev}
        title="Previous track (replay)"
        color="ink"
        onClick={onPrev}
        disabled={!hasPrev}
      />
      <IconBtn
        glyph={Glyph.next}
        title="Next track"
        color="pink"
        onClick={onNext}
        disabled={!hasNext && !isLive}
      />
      <div className="np-title-wrap" ref={wrapRef}>
        <div
          className={`np-title ${overflow ? "is-marquee" : ""} ${isLive ? "" : "is-dim"}`}
          ref={titleRef}
        >
          <span className="np-title-text">{titleText}</span>
          {overflow ? (
            <span className="np-title-text np-title-clone" aria-hidden>
              &nbsp; · · · &nbsp; {titleText}
            </span>
          ) : null}
        </div>
      </div>
      <div className="np-meta">
        {current ? (
          <>
            <span className="src-tag" data-src={current.source}>
              {current.source === "yt" ? "YouTube" : "Bilibili"}
            </span>
            <span className="np-by">
              {current.addedBy.emoji} {current.addedBy.name}
            </span>
          </>
        ) : (
          <span className="np-by np-dim">paste a link → queue → sing</span>
        )}
      </div>
    </div>
  );
}

interface UserPresenceLite {
  name: string;
  emoji: string;
  anonymous: boolean;
  lastSeen: number;
}

interface UsersStripProps {
  users: Record<string, UserPresenceLite> | undefined;
  meId: string;
}

function UsersStrip({ users, meId }: UsersStripProps) {
  const list = Object.entries(users || {})
    .filter(([, u]) => Date.now() - (u.lastSeen || 0) < 60000)
    .sort((a, b) => (a[0] === meId ? -1 : b[0] === meId ? 1 : 0));
  return (
    <div className="users-strip">
      <span className="users-label">ONLINE</span>
      <div className="users-list">
        {list.length === 0 ? (
          <span className="users-empty">— solo session —</span>
        ) : (
          list.map(([id, u]) => (
            <div
              key={id}
              className={`user-chip ${id === meId ? "is-me" : ""}`}
              title={u.name}
            >
              <span className="user-emoji">{u.emoji}</span>
              <span className="user-name">{u.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RoomBadge({ slug }: { slug: string }) {
  const [showQR, setShowQR] = useState(false);
  const url = window.location.href;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&bgcolor=ffffff&color=070016&data=${encodeURIComponent(url)}`;
  return (
    <div className="room-badge">
      <button className="room-btn" onClick={() => setShowQR(true)}>
        <span className="room-slug">{slug}</span>
        <span className="room-qr-icon">⌘</span>
      </button>
      {showQR && (
        <div className="sheet-overlay" onClick={() => setShowQR(false)}>
          <div className="sheet sheet-qr" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3 className="neon-text" style={{ color: "var(--neon-cyan)" }}>SHARE ROOM</h3>
              <button className="sheet-x" onClick={() => setShowQR(false)}>×</button>
            </div>
            <div className="sheet-body sheet-qr-body">
              <p className="qr-hint">Scan or share the link — friends drop into the same room.</p>
              <div className="qr-frame neon-edge">
                <img src={qrSrc} alt="room qr" width="240" height="240" style={{ display: "block", borderRadius: "6px" }} />
              </div>
              <div className="qr-url-row">
                <code className="qr-url">{url}</code>
                <NeonButton
                  accent="cyan"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                  }}
                >
                  COPY
                </NeonButton>
              </div>
              <div className="qr-slug">ROOM · <b>{slug}</b></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface HistoryListProps {
  items: Song[] | undefined;
  onReadd: (s: Song) => void;
  onToggleFavorite?: (s: Song) => void;
  isFavorited: (s: Song) => boolean;
}

function HistoryList({ items, onReadd, onToggleFavorite, isFavorited }: HistoryListProps) {
  if (!items || items.length === 0) return <div className="empty">No songs sung yet ✦</div>;
  return (
    <div className="hist-list">
      {items
        .slice()
        .reverse()
        .map((s) => {
          const key = s.id + ":" + (s.finishedAt || 0);
          const meta: MetaBit[] = [
            { kind: "src", source: s.source },
            { kind: "by", name: s.addedBy.name, emoji: s.addedBy.emoji },
            { kind: "time", ts: s.finishedAt || s.addedAt },
          ];
          return (
            <SongCard
              key={key}
              songKey={key}
              cover={<CoverThumb source={s.source} videoId={s.videoId} />}
              title={s.title}
              meta={meta}
              actions={
                <>
                  {onToggleFavorite ? (
                    <StarBtn filled={isFavorited(s)} onClick={() => onToggleFavorite(s)} />
                  ) : null}
                  <IconBtn
                    glyph={Glyph.replay}
                    title="Sing again"
                    onClick={() => onReadd(s)}
                  />
                </>
              }
            />
          );
        })}
    </div>
  );
}

function FloatingQR({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const url = window.location.href;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&bgcolor=ffffff&color=070016&data=${encodeURIComponent(url)}`;
  return (
    <>
      <button className="fab-qr" title="Show room QR" onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <path d="M14 14h3v3h-3zM20 14v3M14 20h3M17 17h4v4" />
        </svg>
      </button>
      {open && (
        <div className="fab-qr-pop" onClick={() => setOpen(false)}>
          <div className="fab-qr-card" onClick={(e) => e.stopPropagation()}>
            <div className="fab-qr-head">
              <span className="neon-text" style={{ color: "var(--neon-cyan)" }}>SCAN TO JOIN</span>
              <button className="sheet-x" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="fab-qr-body">
              <img src={qrSrc} alt="qr" width="260" height="260" style={{ display: "block", borderRadius: "6px" }} />
              <code className="qr-url">{url}</code>
              <div className="qr-slug">ROOM · <b>{slug}</b></div>
              <NeonButton
                accent="cyan"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(url)}
              >
                COPY LINK
              </NeonButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [room, send] = useRoom();
  const [me, updateMe] = useMe();
  const [, favOps] = useFavorites();
  const [showCatalog, setShowCatalog] = useState(false);
  const toggleFavorite = useCallback(
    (song: Song) => {
      if (!favOps.isFavorited(song)) favOps.addFavorite(song);
    },
    [favOps],
  );

  // Locked aesthetic — orbitron / cyber / comfy
  useEffect(() => {
    document.body.dataset.theme = "cyber";
    document.body.dataset.density = "comfy";
    document.body.dataset.font = "display";
  }, []);

  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboard, setShowOnboard] = useState(!me.configured);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Room ${SLUG} · Neon KTV`;
  }, []);

  const addSong = (song: Song) => {
    // Stamp every queue.add with the CURRENT user as the adder, regardless
    // of what the source object carried. This way replay-from-history and
    // re-add-from-catalog always show the live user's name, not the person
    // who queued it the first time.
    const addedBy = me.anonymous
      ? { name: "Anonymous", emoji: "👤", anonymous: true }
      : {
          id: me.id,
          name: me.name || "Unnamed",
          emoji: me.emoji || "🎤",
          anonymous: false,
        };
    const stamped: Song = { ...song, addedBy };
    send({ type: "queue.add", song: stamped });
    send({
      type: "danmaku",
      text: `★ ${addedBy.emoji} ${addedBy.name} queued « ${stamped.title} »`.slice(0, 80),
    });
  };
  const reorderSong = (id: string, toIndex: number) =>
    send({ type: "queue.reorder", id, toIndex });
  const topSong = (id: string) => send({ type: "queue.top", id });
  const deleteSong = (id: string) => send({ type: "queue.remove", id });
  const shuffle = () => send({ type: "queue.shuffle" });
  const advanceQueue = () => send({ type: "track.next" });
  const replayPrev = () => send({ type: "track.prev" });
  const sendDanmaku = (text: string) => send({ type: "danmaku", text });
  const updateSongMeta = (id: string, patch: Record<string, unknown>) =>
    send({ type: "track.meta", id, patch });

  if (showOnboard) {
    return (
      <Onboarding
        onDone={(p) => {
          updateMe({ ...p, configured: true });
          setShowOnboard(false);
        }}
        onAnonymous={() => {
          updateMe({
            name: "Anonymous",
            emoji: "👤",
            anonymous: true,
            configured: true,
          });
          setShowOnboard(false);
        }}
      />
    );
  }

  const current = room.current;
  const signal = String((room.rev || 0) % 999).padStart(3, "0");

  return (
    <div className={`shell ${sidebarOpen ? "" : "is-sidebar-collapsed"}`}>
      <FloatingQR slug={SLUG} />
      <DanmakuLayer items={room.danmaku} />

      <header className="topbar">
        <div className="brand">
          <div className="brand-logo neon-text">NEON KTV</div>
          <div className="brand-mono">// signal {signal} // room synced</div>
        </div>
        <div className="topbar-right">
          <RoomBadge slug={SLUG} />
          <button className="me-chip" onClick={() => setShowProfile(true)}>
            <span className="me-emoji">{me.anonymous ? "👤" : me.emoji || "🎤"}</span>
            <span className="me-name">{me.anonymous ? "Anonymous" : me.name || "Unnamed"}</span>
          </button>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide queue panel" : "Show queue panel"}
            aria-label="Toggle queue panel"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="15" y1="4" x2="15" y2="20" />
              {sidebarOpen ? (
                <path d="M9 9l-2 3 2 3" />
              ) : (
                <path d="M7 9l2 3-2 3" />
              )}
            </svg>
          </button>
        </div>
      </header>

      <main className="stage">
        <section className="player-col">
          <div className="screen neon-edge">
            <Player
              song={current}
              onMeta={(m) => {
                if (current) updateSongMeta(current.id, { title: m.title, thumb: m.thumb });
              }}
              danmakuItems={room.danmaku}
            />
          </div>
          <NowPlayingBar
            current={current}
            hasPrev={(room.history || []).length > 0}
            hasNext={(room.queue || []).length > 0 || !!current}
            onNext={advanceQueue}
            onPrev={replayPrev}
          />
          <DanmakuComposer onSend={sendDanmaku} />
          <UsersStrip users={room.users} meId={me.id} />
        </section>

        <section className="side-col">
          <AddSongInput
            onAdd={addSong}
            me={me}
            onOpenCatalog={() => setShowCatalog(true)}
          />
          <div className="tabs">
            <button
              className={`tab ${tab === "queue" ? "is-on" : ""}`}
              onClick={() => setTab("queue")}
            >
              QUEUE <span className="tab-count">{room.queue.length}</span>
            </button>
            <button
              className={`tab ${tab === "history" ? "is-on" : ""}`}
              onClick={() => setTab("history")}
            >
              HISTORY <span className="tab-count">{(room.history || []).length}</span>
            </button>
            <div className="tab-tools">
              {tab === "queue" && (
                <IconBtn
                  glyph={Glyph.shuffle}
                  title="Shuffle"
                  color="cyan"
                  onClick={shuffle}
                  disabled={room.queue.length < 2}
                />
              )}
            </div>
          </div>
          <div className="list-scroll scrollbar">
            {tab === "queue" ? (
              !current && room.queue.length === 0 ? (
                <div className="empty">Paste a link to start the night ♪</div>
              ) : (
                <>
                  {current && (
                    <QueueRow
                      song={current}
                      idx={0}
                      isCurrent={true}
                      onTop={topSong}
                      onDelete={deleteSong}
                      onToggleFavorite={toggleFavorite}
                      isFavorited={favOps.isFavorited(current)}
                    />
                  )}
                  {room.queue.length === 0 && current ? (
                    <div className="empty">Queue empty — drop more links ♪</div>
                  ) : (
                    room.queue.map((s, i) => {
                      const isDragging = draggingId === s.id;
                      const isDropTarget =
                        dragOverId === s.id && draggingId !== null && draggingId !== s.id;
                      return (
                        <div
                          key={s.id}
                          className="q-drag-wrap"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            try { e.dataTransfer.setData("text/plain", s.id); } catch {}
                            setDraggingId(s.id);
                          }}
                          onDragOver={(e) => {
                            if (!draggingId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverId !== s.id) setDragOverId(s.id);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggingId && draggingId !== s.id) {
                              reorderSong(draggingId, i);
                            }
                            setDraggingId(null);
                            setDragOverId(null);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverId(null);
                          }}
                        >
                          <QueueRow
                            song={s}
                            idx={i}
                            isCurrent={false}
                            onTop={topSong}
                            onDelete={deleteSong}
                            onToggleFavorite={toggleFavorite}
                            isFavorited={favOps.isFavorited(s)}
                            dragging={isDragging}
                            dropTarget={isDropTarget}
                            disableTop={i === 0}
                          />
                        </div>
                      );
                    })
                  )}
                </>
              )
            ) : (
              <HistoryList
                items={room.history}
                onReadd={(s) => addSong({ ...s, id: uid(), addedAt: Date.now() })}
                onToggleFavorite={toggleFavorite}
                isFavorited={favOps.isFavorited}
              />
            )}
          </div>
        </section>
      </main>

      {showProfile && (
        <ProfileSheet
          me={me}
          onUpdate={updateMe}
          onClose={() => setShowProfile(false)}
        />
      )}
      <CatalogModal
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        onAddRef={(ref: SongRef) => send({ type: "queue.add", ref })}
      />
    </div>
  );
}
