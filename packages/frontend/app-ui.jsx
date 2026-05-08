// app-ui.jsx — UI atoms (English)

const __UI_uid = () => "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
const __UI_fmtTime = (sec) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
const __UI_ago = (ts) => {
  if (!ts) return "";
  const d = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
};

const EMOJI_POOL = ["🎤","🎸","🎷","🥁","🎹","🎺","🎻","🪗","🪕","🎼","🎧","🦄","🐯","🐲","🐶","🐱","🦊","🐻","🐼","🐨","🐸","🦁","🐵","🐰","🐺","👻","🤖","👽","💀","🤡","🧚","🧛","🧜","🧞","🥷","🌟","🔥","⚡","🌈","💎","🍑","🍓","🍕","🍜","🍣","🍷","🍺","🎲","🎮","🕹️","🛸"];

function NeonButton({ children, onClick, accent = "pink", size = "md", title, disabled }) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={`nbtn nbtn-${accent} nbtn-${size}`}>
      <span>{children}</span>
    </button>
  );
}
function IconBtn({ glyph, title, onClick, color, disabled, className }) {
  const cls = ["icon-btn", color ? `icon-${color}` : "icon-ink", className].filter(Boolean).join(" ");
  return <button title={title} disabled={disabled} onClick={onClick} className={cls}>{glyph}</button>;
}

const Glyph = {
  plus: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  catalog: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  starOutline: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.9 6.1 6.7.7-5 4.6 1.5 6.6L12 17.7 5.9 21l1.5-6.6-5-4.6 6.7-.7L12 3z"/></svg>,
  starFilled: <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3l2.9 6.1 6.7.7-5 4.6 1.5 6.6L12 17.7 5.9 21l1.5-6.6-5-4.6 6.7-.7L12 3z"/></svg>,
  up: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14l6-6 6 6"/></svg>,
  down: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10l6 6 6-6"/></svg>,
  top: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h14M12 20V10M7 14l5-5 5 5"/></svg>,
  trash: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>,
  shuffle: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M21 3l-7 7M4 20l7-7M16 21h5v-5M4 4l5 5"/></svg>,
  play: <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>,
  pause: <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>,
  next: <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5l10 7-10 7zM18 5h2v14h-2z"/></svg>,
  prev: <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 5l-10 7 10 7zM4 5h2v14H4z"/></svg>,
  vol: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 010 8M19 5a9 9 0 010 14"/></svg>,
  mute: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/></svg>,
  send: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L21 4l-3 17-7-5-5 2z"/></svg>,
  link: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>,
  replay: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 8 16 8"/></svg>,
  check: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>,
  plusSm: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
};

function AddSongInput({ onAdd, me, onOpenCatalog }) {
  const [val, setVal] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const parsed = await window.KTV.parseAddSong(val);
      const ytThumb = parsed.source === "yt" ? `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg` : null;
      const song = {
        id: __UI_uid(),
        source: parsed.source,
        videoId: parsed.videoId,
        page: parsed.page,
        title: parsed.title || window.KTV.fallbackTitle(parsed),
        thumb: parsed.thumb || ytThumb,
        duration: parsed.duration,
        addedBy: me.anonymous
          ? { name: "Anonymous", emoji: "👤", anonymous: true }
          : { id: me.id, name: me.name || "Unnamed", emoji: me.emoji || "🎤", anonymous: false },
        addedAt: Date.now(),
      };
      onAdd(song); setVal("");
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="add-input">
      <div className="add-row">
        <span className="add-icon">{Glyph.link}</span>
        <input className="add-field" placeholder="Paste a Bilibili / YouTube link (b23.tv / youtu.be ok)" value={val}
          onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <button
          className={`side-action add-plus ${busy ? "is-busy" : ""}`}
          title={busy ? "Parsing…" : "Add link to queue"}
          onClick={submit}
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

function StarBtn({ filled, onClick, title }) {
  // Add-only in v1: once a song is starred, the button stays filled and
  // becomes non-interactive. Renders through the .icon-btn chrome so it
  // matches top + trash visually; the inner glyph is the only difference.
  // Filled glyph uses var(--ink) (white) — see .icon-btn.is-on.
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

// ── CoverThumb — cover image with generic placeholder fallback ────────────
// Renders an <img> for the song's cover. On load failure (network, CORS,
// 4xx, decode), or when no cover URL is computable, swaps in a quiet
// card-toned placeholder of identical dimensions. NO inner number / badge
// — the placeholder is intentionally informationless.
function CoverThumb({ source, videoId }) {
  const [failed, setFailed] = React.useState(false);
  const src = React.useMemo(() => {
    if (!source || !videoId) return null;
    if (source === "yt") return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (source === "bili") return `/api/thumb?source=bili&id=${encodeURIComponent(videoId)}`;
    return null;
  }, [source, videoId]);
  React.useEffect(() => { setFailed(false); }, [src]);
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

// ── SongCard — the unified row primitive used by Queue / History / Catalog ─
// Slots: cover (left, optional), title (string), meta (typed bits, fixed
// order), actions (opaque ReactNode, right). Visual states via boolean
// flags. See specs/song-card/spec.md for the contract.
function SongCard({
  songKey,
  cover,
  title,
  meta,
  actions,
  active,
  dragging,
  dropTarget,
}) {
  const cls = [
    "song-card",
    cover ? "has-cover" : "",
    active ? "is-active" : "",
    dragging ? "is-dragging" : "",
    dropTarget ? "is-drop-target" : "",
  ].filter(Boolean).join(" ");

  // Normalize meta into canonical order: src → by → time → now. We pluck
  // each kind out of the input array and render in the fixed order; the
  // dot separator between `by` and `time` is auto-inserted when both
  // exist. There is no `page` bit — Bilibili multi-p titles already carry
  // P{n} in the title text.
  const bits = Array.isArray(meta) ? meta : [];
  const byBit = bits.find((b) => b && b.kind === "by");
  const srcBit = bits.find((b) => b && b.kind === "src");
  const timeBit = bits.find((b) => b && b.kind === "time");
  const nowBit = bits.find((b) => b && b.kind === "now");
  const showDot = byBit && timeBit;

  return (
    <div className={cls} data-song-key={songKey || undefined}>
      {cover ? <div className="song-card-cover">{cover}</div> : null}
      <div className="song-card-body">
        <div className="song-card-title" title={title}>{title}</div>
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
          {timeBit ? (
            <span className="song-card-time">{__UI_ago(timeBit.ts)}</span>
          ) : null}
          {nowBit && active ? (
            <span className="song-card-now">▶ NOW PLAYING</span>
          ) : null}
        </div>
      </div>
      {actions ? <div className="song-card-actions">{actions}</div> : null}
    </div>
  );
}

function QueueRow({
  song, idx, isCurrent, onTop, onDelete, onToggleFavorite, isFavorited,
  dragging, dropTarget,
}) {
  const askDelete = () => {
    const ok = window.confirm(`Remove “${song.title}” from the queue?`);
    if (ok) onDelete(song.id);
  };
  const meta = [
    { kind: "src", source: song.source },
    { kind: "by", name: song.addedBy.name, emoji: song.addedBy.emoji },
    { kind: "time", ts: song.addedAt },
  ];
  if (isCurrent) meta.push({ kind: "now" });
  return (
    <SongCard
      songKey={song.id}
      cover={null}
      title={song.title}
      meta={meta}
      active={!!isCurrent}
      dragging={!!dragging}
      dropTarget={!!dropTarget}
      actions={
        <>
          {onToggleFavorite ? (
            <StarBtn filled={isFavorited} onClick={() => onToggleFavorite(song)} />
          ) : null}
          {!isCurrent && (
            <>
              <IconBtn glyph={Glyph.top} title="Move to top" onClick={() => onTop(song.id)} disabled={idx === 0} />
              <IconBtn glyph={Glyph.trash} title="Remove" onClick={askDelete} />
            </>
          )}
        </>
      }
    />
  );
}

function ProfileSheet({ me, onUpdate, onClose }) {
  const [name, setName] = React.useState(me.name || "");
  const [emoji, setEmoji] = React.useState(me.emoji || "🎤");
  const [anon, setAnon] = React.useState(!!me.anonymous);
  const save = () => { onUpdate({ name: name.trim() || "Unnamed", emoji, anonymous: anon, configured: true }); onClose && onClose(); };
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
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stardust / DJ Comet" disabled={anon} maxLength={16} />
          </label>
          <div className="form-row">
            <span className="form-label">AVATAR EMOJI</span>
            <div className={`emoji-grid ${anon ? "is-disabled" : ""}`}>
              {EMOJI_POOL.map((e) => (
                <button key={e} className={`emoji-cell ${emoji === e ? "is-on" : ""}`} onClick={() => !anon && setEmoji(e)}>{e}</button>
              ))}
            </div>
          </div>
          <label className="form-row form-row-h">
            <span className="form-label">QUEUE AS ANONYMOUS</span>
            <button className={`switch ${anon ? "is-on" : ""}`} onClick={() => setAnon(!anon)}><span className="switch-knob" /></button>
          </label>
          <div className="sheet-actions">
            <NeonButton onClick={save} accent="pink">SAVE</NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Onboarding({ onDone, onAnonymous }) {
  const [name, setName] = React.useState("");
  const [emoji, setEmoji] = React.useState("🎤");
  return (
    <div className="onboard">
      <div className="onboard-card neon-edge">
        <div className="onboard-tag" style={{ color: "var(--neon-cyan)" }}>welcome // signal acquired</div>
        <h1 className="onboard-h1 neon-text">NEON KTV</h1>
        <p className="onboard-sub">Forge your stage persona, then step into the room.</p>
        <div className="onboard-preview">
          <div className="onboard-avatar">{emoji}</div>
          <div className="onboard-name">{name || "Unnamed"}</div>
        </div>
        <input autoFocus className="onboard-input" placeholder="pick your stage name…"
          value={name} maxLength={16}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onDone({ name: name.trim(), emoji, anonymous: false }); }} />
        <div className="onboard-emojis">
          {EMOJI_POOL.slice(0, 24).map((e) => (
            <button key={e} className={`emoji-cell ${emoji === e ? "is-on" : ""}`} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
        <div className="onboard-cta">
          <NeonButton accent="pink" size="lg" disabled={!name.trim()} onClick={() => onDone({ name: name.trim(), emoji, anonymous: false })}>
            ENTER ROOM →
          </NeonButton>
          <button className="ghost-btn" onClick={onAnonymous}>continue anonymously</button>
        </div>
      </div>
    </div>
  );
}

window.KTV.UI = Object.assign(window.KTV.UI || {}, {
  NeonButton, IconBtn, StarBtn, Glyph, AddSongInput, QueueRow, ProfileSheet, Onboarding,
  SongCard, CoverThumb,
  fmtTime: __UI_fmtTime, ago: __UI_ago, EMOJI_POOL, uid: __UI_uid,
});
