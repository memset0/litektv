// app-ui.tsx — UI atoms (English).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Favorite, Source } from "@litektv/types";
import { fallbackTitle, parseAddSong } from "./urlparse";
import type { FavoritePatch, Me } from "./state";

const __UI_uid = (): string =>
  "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

const __UI_fmtTime = (sec: number): string => {
  let s = sec;
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

const __UI_ago = (ts: number): string => {
  if (!ts) return "";
  const d = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
};

export const fmtTime = __UI_fmtTime;
export const ago = __UI_ago;
export const uid = __UI_uid;

export const EMOJI_POOL: string[] = [
  "🎤","🎸","🎷","🥁","🎹","🎺","🎻","🪗","🪕","🎼","🎧",
  "🦄","🐯","🐲","🐶","🐱","🦊","🐻","🐼","🐨","🐸","🦁","🐵","🐰","🐺",
  "👻","🤖","👽","💀","🤡","🧚","🧛","🧜","🧞","🥷",
  "🌟","🔥","⚡","🌈","💎","🍑","🍓","🍕","🍜","🍣","🍷","🍺","🎲","🎮","🕹️","🛸",
];

interface NeonButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  accent?: "pink" | "cyan" | "purple" | "yellow";
  size?: "sm" | "md" | "lg";
  title?: string;
  disabled?: boolean;
}

export function NeonButton({
  children,
  onClick,
  accent = "pink",
  size = "md",
  title,
  disabled,
}: NeonButtonProps) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`nbtn nbtn-${accent} nbtn-${size}`}
    >
      <span>{children}</span>
    </button>
  );
}

interface IconBtnProps {
  glyph: ReactNode;
  title?: string;
  onClick?: () => void;
  color?: "pink" | "cyan" | "ink";
  disabled?: boolean;
  className?: string | null;
}

export function IconBtn({
  glyph,
  title,
  onClick,
  color,
  disabled,
  className,
}: IconBtnProps) {
  const cls = [
    "icon-btn",
    color ? `icon-${color}` : "icon-ink",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={cls}>
      {glyph}
    </button>
  );
}

export const Glyph = {
  plus: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  catalog: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  starOutline: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.9 6.1 6.7.7-5 4.6 1.5 6.6L12 17.7 5.9 21l1.5-6.6-5-4.6 6.7-.7L12 3z" />
    </svg>
  ),
  starFilled: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M12 3l2.9 6.1 6.7.7-5 4.6 1.5 6.6L12 17.7 5.9 21l1.5-6.6-5-4.6 6.7-.7L12 3z" />
    </svg>
  ),
  up: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 14l6-6 6 6" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10l6 6 6-6" />
    </svg>
  ),
  top: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h14M12 20V10M7 14l5-5 5 5" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />
    </svg>
  ),
  shuffle: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5M21 3l-7 7M4 20l7-7M16 21h5v-5M4 4l5 5" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M7 5v14l12-7z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M6 5l10 7-10 7zM18 5h2v14h-2z" />
    </svg>
  ),
  prev: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18 5l-10 7 10 7zM4 5h2v14H4z" />
    </svg>
  ),
  vol: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 010 8M19 5a9 9 0 010 14" />
    </svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12L21 4l-3 17-7-5-5 2z" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
    </svg>
  ),
  replay: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  ),
  plusSm: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  // Karaoke handheld mic — ball-grille up-left + tapered handle down-right,
  // held diagonally for the "stage" feel. NOT a studio/podcast mic with
  // a U-shaped yoke + stand — that's a different device and reads wrong
  // for a KTV app.
  mic: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* grille ball, rotated so the handle drops to the lower-right */}
      <ellipse cx="9" cy="8" rx="3.6" ry="4.6" transform="rotate(-35 9 8)" fill="currentColor" stroke="none" />
      {/* grille mesh lines for the "ball" feel */}
      <line x1="6.5" y1="6.2" x2="11" y2="9.4" opacity="0.55" stroke="rgba(7,6,15,0.5)" />
      <line x1="7.5" y1="4.6" x2="12.2" y2="7.5" opacity="0.45" stroke="rgba(7,6,15,0.45)" />
      {/* neck collar between head and handle */}
      <rect x="11" y="10.6" width="3.4" height="2.2" transform="rotate(-35 11 10.6)" rx="0.6" fill="currentColor" stroke="none" />
      {/* tapered handle going down to the lower-right */}
      <path d="M13.4 13.2 L20.2 20.6" strokeWidth="3.2" />
      {/* handle end-cap */}
      <circle cx="20.4" cy="20.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
};

// NowPlayingPlate — replaces <CoverThumb> in the queue's pinned current
// row. Same outer dimensions as a CoverThumb so the row chrome matches.
// Visual: a dark scrim over --card-hi, with a centered pink mic glyph.
export function NowPlayingPlate() {
  return (
    <div className="song-card-cover-now-playing" aria-hidden="true">
      {Glyph.mic}
    </div>
  );
}

interface AddedBy {
  id?: string;
  name: string;
  emoji: string;
  anonymous: boolean;
}

interface QueueSong {
  id: string;
  source: Source;
  videoId: string;
  page?: number;
  /** Bilibili per-page content-id (see `Song.cid` in @litektv/types). */
  cid?: number;
  title: string;
  thumb?: string | null;
  duration?: number;
  addedBy: AddedBy;
  addedAt: number;
}

interface AddSongInputProps {
  onAdd: (song: QueueSong) => void;
  me: Me;
  onOpenCatalog: () => void;
}

export function AddSongInput({ onAdd, me, onOpenCatalog }: AddSongInputProps) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const parsed = await parseAddSong(val);
      const ytThumb =
        parsed.source === "yt"
          ? `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`
          : null;
      const parsedTitle = "title" in parsed ? parsed.title : null;
      const parsedThumb = "thumb" in parsed ? parsed.thumb : null;
      const parsedDuration = "duration" in parsed ? parsed.duration : undefined;
      const parsedPage = "page" in parsed ? parsed.page : undefined;
      const parsedCid = "cid" in parsed ? parsed.cid : undefined;
      const song: QueueSong = {
        id: __UI_uid(),
        source: parsed.source,
        videoId: parsed.videoId,
        page: parsedPage,
        cid: parsedCid,
        title: parsedTitle || fallbackTitle({ source: parsed.source, videoId: parsed.videoId }),
        thumb: parsedThumb || ytThumb,
        duration: parsedDuration,
        addedBy: me.anonymous
          ? { name: "Anonymous", emoji: "👤", anonymous: true }
          : {
              id: me.id,
              name: me.name || "Unnamed",
              emoji: me.emoji || "🎤",
              anonymous: false,
            },
        addedAt: Date.now(),
      };
      onAdd(song);
      setVal("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="add-input">
      <div className="add-row">
        <span className="add-icon">{Glyph.link}</span>
        <input
          className="add-field"
          placeholder="Paste a Bilibili / YouTube link (b23.tv / youtu.be ok)"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        <button
          className={`side-action add-plus ${busy ? "is-busy" : ""}`}
          title={busy ? "Parsing…" : "Add link to queue"}
          onClick={() => void submit()}
          disabled={busy || !val.trim()}
        >
          {Glyph.plus}
        </button>
        <button
          className="side-action open-catalog"
          title="Open my favorites (歌单)"
          onClick={onOpenCatalog}
        >
          {Glyph.catalog}
        </button>
      </div>
      {err ? <div className="add-err">{err}</div> : null}
    </div>
  );
}

interface StarBtnProps {
  filled: boolean;
  onClick?: () => void;
  title?: string;
}

export function StarBtn({ filled, onClick, title }: StarBtnProps) {
  return (
    <button
      className={`icon-btn ${filled ? "is-on" : ""}`}
      title={title || (filled ? "已收藏" : "Add to favorites")}
      onClick={filled ? undefined : onClick}
      disabled={filled}
      aria-pressed={filled}
    >
      {filled ? Glyph.starFilled : Glyph.starOutline}
    </button>
  );
}

interface CoverThumbProps {
  source?: Source;
  videoId?: string;
}

export function CoverThumb({ source, videoId }: CoverThumbProps) {
  const [failed, setFailed] = useState(false);
  const src = useMemo<string | null>(() => {
    if (!source || !videoId) return null;
    if (source === "yt") return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (source === "bili") return `/api/thumb?source=bili&id=${encodeURIComponent(videoId)}`;
    return null;
  }, [source, videoId]);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return <div className="song-card-cover-placeholder" aria-hidden="true" />;
  }
  return (
    <img
      className="song-card-cover-img"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export type MetaBit =
  | { kind: "src"; source: Source }
  | { kind: "by"; name: string; emoji: string }
  | { kind: "time"; ts: number }
  | { kind: "now" };

interface SongCardProps {
  songKey?: string;
  cover?: ReactNode;
  title: string;
  meta?: MetaBit[];
  actions?: ReactNode;
  active?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
}

export function SongCard({
  songKey,
  cover,
  title,
  meta,
  actions,
  active,
  dragging,
  dropTarget,
}: SongCardProps) {
  const cls = [
    "song-card",
    cover ? "has-cover" : "",
    active ? "is-active" : "",
    dragging ? "is-dragging" : "",
    dropTarget ? "is-drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bits: MetaBit[] = Array.isArray(meta) ? meta : [];
  const byBit = bits.find((b): b is Extract<MetaBit, { kind: "by" }> => b.kind === "by");
  const srcBit = bits.find((b): b is Extract<MetaBit, { kind: "src" }> => b.kind === "src");
  const timeBit = bits.find((b): b is Extract<MetaBit, { kind: "time" }> => b.kind === "time");
  const nowBit = bits.find((b): b is Extract<MetaBit, { kind: "now" }> => b.kind === "now");
  const showDot = byBit && timeBit;

  return (
    <div className={cls} data-song-key={songKey || undefined}>
      {cover ? <div className="song-card-cover">{cover}</div> : null}
      <div className="song-card-body">
        <div className="song-card-title" title={title}>
          {title}
        </div>
        <div className="song-card-sub">
          {srcBit ? (
            <span className="song-card-src src-tag" data-src={srcBit.source}>
              {srcBit.source === "yt" ? "YT" : "Bili"}
            </span>
          ) : null}
          {byBit ? (
            <span className="song-card-by">
              <span className="song-card-by-emoji">{byBit.emoji}</span>
              <span className="song-card-by-name">{byBit.name}</span>
            </span>
          ) : null}
          {showDot ? <span className="song-card-dot">·</span> : null}
          {timeBit ? <span className="song-card-time">{__UI_ago(timeBit.ts)}</span> : null}
          {nowBit ? <span className="song-card-now">▶ NOW PLAYING</span> : null}
        </div>
      </div>
      {actions ? <div className="song-card-actions">{actions}</div> : null}
    </div>
  );
}

interface QueueRowProps {
  song: QueueSong;
  idx: number;
  isCurrent: boolean;
  onTop: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite?: (song: QueueSong) => void;
  isFavorited?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  /**
   * Disable just the `top` action (independent of `isCurrent`). Used by
   * the parent to grey-out the topmost pending row's top icon — it would
   * be a no-op (the row is already at the top of the pending tail) and
   * an unintentional click should not look identical to a meaningful one.
   */
  disableTop?: boolean;
  /**
   * Override the rendered title. Parent computes via formatSongTitle so
   * favorited songs with full manual metadata get the structured form. If
   * omitted, fall back to the song's raw imported title.
   */
  displayTitle?: string;
}

export function QueueRow({
  song,
  idx,
  isCurrent,
  onTop,
  onDelete,
  onToggleFavorite,
  isFavorited,
  dragging,
  dropTarget,
  disableTop,
  displayTitle,
}: QueueRowProps) {
  void idx; // Reserved for future use; parent already drives disableTop.
  const renderedTitle = displayTitle ?? song.title;
  const askDelete = () => {
    const ok = window.confirm(`Remove "${renderedTitle}" from the queue?`);
    if (ok) onDelete(song.id);
  };
  // The pinned current row collapses its meta to a single NOW PLAYING tag
  // — the cover plate already signals "this is what's playing", so the
  // adder name + time are redundant noise. Pending rows still carry the
  // full src + by + time triplet.
  const meta: MetaBit[] = isCurrent
    ? [{ kind: "now" }]
    : [
        { kind: "src", source: song.source },
        { kind: "by", name: song.addedBy.name, emoji: song.addedBy.emoji },
        { kind: "time", ts: song.addedAt },
      ];
  const cover = isCurrent ? <NowPlayingPlate /> : <CoverThumb source={song.source} videoId={song.videoId} />;
  return (
    <SongCard
      songKey={song.id}
      cover={cover}
      title={song.title}
      meta={meta}
      // Don't pass `active` — the pinned current row should look like any
      // other row in chrome (no pink border, no glow). The plate + the
      // NOW PLAYING tag carry all the "this is current" signal we need.
      dragging={!!dragging}
      dropTarget={!!dropTarget}
      actions={
        <>
          {onToggleFavorite ? (
            <StarBtn filled={!!isFavorited} onClick={() => onToggleFavorite(song)} />
          ) : null}
          <IconBtn
            glyph={Glyph.top}
            title={isCurrent ? "Already playing" : disableTop ? "Already at top" : "Move to top"}
            onClick={() => onTop(song.id)}
            disabled={isCurrent || !!disableTop}
          />
          <IconBtn
            glyph={Glyph.trash}
            title={isCurrent ? "Use ⏭ to skip" : "Remove"}
            onClick={askDelete}
            disabled={isCurrent}
          />
        </>
      }
    />
  );
}

interface ProfileSheetProps {
  me: Me;
  onUpdate: (patch: Partial<Me>) => void;
  onClose?: () => void;
}

export function ProfileSheet({ me, onUpdate, onClose }: ProfileSheetProps) {
  const [name, setName] = useState(me.name || "");
  const [emoji, setEmoji] = useState(me.emoji || "🎤");
  const [anon, setAnon] = useState(!!me.anonymous);
  const save = () => {
    onUpdate({
      name: name.trim() || "Unnamed",
      emoji,
      anonymous: anon,
      configured: true,
    });
    onClose && onClose();
  };
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3 className="neon-text" style={{ color: "var(--neon-pink)" }}>YOUR ID</h3>
          <button className="sheet-x" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          <div className="profile-preview">
            <div className="profile-avatar">{anon ? "👤" : emoji}</div>
            <div>
              <div className="profile-name">{anon ? "Anonymous" : (name || "Unnamed")}</div>
              <div className="profile-id">@{me.id.slice(2, 8)}</div>
            </div>
          </div>
          <label className="form-row">
            <span className="form-label">DISPLAY NAME</span>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stardust / DJ Comet"
              disabled={anon}
              maxLength={16}
            />
          </label>
          <div className="form-row">
            <span className="form-label">AVATAR EMOJI</span>
            <div className={`emoji-grid ${anon ? "is-disabled" : ""}`}>
              {EMOJI_POOL.map((e) => (
                <button
                  key={e}
                  className={`emoji-cell ${emoji === e ? "is-on" : ""}`}
                  onClick={() => !anon && setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <label className="form-row form-row-h">
            <span className="form-label">QUEUE AS ANONYMOUS</span>
            <button
              className={`switch ${anon ? "is-on" : ""}`}
              onClick={() => setAnon(!anon)}
            >
              <span className="switch-knob" />
            </button>
          </label>
          <div className="sheet-actions">
            <NeonButton onClick={save} accent="pink">SAVE</NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Favorite metadata edit sheet ─────────────────────────────────────────
//
// Surfaced from three entry points:
//   1. Catalog row's ✏️ button.
//   2. Filled ★ on a queue row.
//   3. Filled ★ on a history row.
// All three open the same sheet, scoped to the favorite identified by
// (source, videoId, page). Save sends `favorite.update`; Delete sends
// `favorite.remove` after a window.confirm; Cancel/Esc/backdrop closes.

interface FavoriteEditSheetProps {
  favorite: Favorite;
  onSave: (patch: FavoritePatch) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FavoriteEditSheet({
  favorite,
  onSave,
  onDelete,
  onClose,
}: FavoriteEditSheetProps) {
  const initialAuthors = (favorite.authors ?? []).join(", ");
  const initialMode: "instr" | "vocal" | "" = favorite.mode ?? "";
  const [displayTitle, setDisplayTitle] = useState(favorite.displayTitle ?? "");
  const [authorsText, setAuthorsText] = useState(initialAuthors);
  const [mode, setMode] = useState<"instr" | "vocal" | "">(initialMode);

  const save = () => {
    const patch: FavoritePatch = {};
    const dt = displayTitle.trim();
    patch.displayTitle = dt.length > 0 ? dt : null;
    const authors = authorsText
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    patch.authors = authors.length > 0 ? authors : null;
    patch.mode = mode === "instr" || mode === "vocal" ? mode : null;
    onSave(patch);
    onClose();
  };

  const askDelete = () => {
    const ok = window.confirm(
      `从收藏中删除「${favorite.displayTitle || favorite.title}」？`,
    );
    if (ok) {
      onDelete();
      onClose();
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3 className="neon-text" style={{ color: "var(--neon-pink)" }}>EDIT FAVORITE</h3>
          <button className="sheet-x" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          <div className="form-row">
            <span className="form-label">原始标题</span>
            <code className="form-readonly">{favorite.title}</code>
          </div>
          <label className="form-row">
            <span className="form-label">曲名（简体）</span>
            <input
              className="form-input"
              value={displayTitle}
              onChange={(e) => setDisplayTitle(e.target.value)}
              placeholder="例如 小镇姑娘"
              maxLength={120}
            />
          </label>
          <label className="form-row">
            <span className="form-label">作者（用 , 分隔多人）</span>
            <input
              className="form-input"
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              placeholder="例如 陶喆, 蔡依林"
              maxLength={300}
            />
          </label>
          <div className="form-row">
            <span className="form-label">模式</span>
            <div className="fav-mode-group">
              {(
                [
                  ["", "未指定"],
                  ["instr", "伴奏"],
                  ["vocal", "原唱"],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className={`fav-mode-pill ${mode === val ? "is-on" : ""}`}>
                  <input
                    type="radio"
                    name="fav-mode"
                    value={val}
                    checked={mode === val}
                    onChange={() => setMode(val)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="sheet-actions" style={{ justifyContent: "space-between" }}>
            <button className="ghost-btn" onClick={askDelete} title="从收藏中删除">
              🗑 删除
            </button>
            <NeonButton onClick={save} accent="pink">保存</NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OnboardingProps {
  onDone: (p: { name: string; emoji: string; anonymous: boolean }) => void;
  onAnonymous: () => void;
}

export function Onboarding({ onDone, onAnonymous }: OnboardingProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎤");
  return (
    <div className="onboard">
      <div className="onboard-card neon-edge">
        <div className="onboard-tag" style={{ color: "var(--neon-cyan)" }}>
          welcome // signal acquired
        </div>
        <h1 className="onboard-h1 neon-text">NEON KTV</h1>
        <p className="onboard-sub">Forge your stage persona, then step into the room.</p>
        <div className="onboard-preview">
          <div className="onboard-avatar">{emoji}</div>
          <div className="onboard-name">{name || "Unnamed"}</div>
        </div>
        <input
          autoFocus
          className="onboard-input"
          placeholder="pick your stage name…"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              onDone({ name: name.trim(), emoji, anonymous: false });
            }
          }}
        />
        <div className="onboard-emojis">
          {EMOJI_POOL.slice(0, 24).map((e) => (
            <button
              key={e}
              className={`emoji-cell ${emoji === e ? "is-on" : ""}`}
              onClick={() => setEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="onboard-cta">
          <NeonButton
            accent="pink"
            size="lg"
            disabled={!name.trim()}
            onClick={() => onDone({ name: name.trim(), emoji, anonymous: false })}
          >
            ENTER ROOM →
          </NeonButton>
          <button className="ghost-btn" onClick={onAnonymous}>
            continue anonymously
          </button>
        </div>
      </div>
    </div>
  );
}

export type { QueueSong };
