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
function IconBtn({ glyph, title, onClick, color, disabled }) {
  return <button title={title} disabled={disabled} onClick={onClick} className={`icon-btn icon-${color || "ink"}`}>{glyph}</button>;
}

const Glyph = {
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
};

function AddSongInput({ onAdd, me }) {
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
        <NeonButton accent="pink" size="md" onClick={submit} disabled={busy || !val.trim()}>{busy ? "PARSING…" : "QUEUE +"}</NeonButton>
      </div>
      {err ? <div className="add-err">{err}</div> : null}
    </div>
  );
}

function QueueRow({ song, idx, isCurrent, onTop, onDelete }) {
  const askDelete = () => {
    const ok = window.confirm(`Remove “${song.title}” from the queue?`);
    if (ok) onDelete(song.id);
  };
  return (
    <div className={`q-row ${isCurrent ? "q-row-active" : ""}`}>
      <div className="q-meta">
        <div className="q-title" title={song.title}>{song.title}</div>
        <div className="q-sub">
          <span className="q-emoji">{song.addedBy.emoji}</span>
          <span className="q-by">{song.addedBy.name}</span>
          <span className="q-dot">·</span>
          <span className="q-time">{__UI_ago(song.addedAt)}</span>
          {isCurrent ? <span className="q-now">▶ NOW PLAYING</span> : null}
        </div>
      </div>
      <div className="q-actions">
        {!isCurrent && (
          <>
            <IconBtn glyph={Glyph.top} title="Move to top" onClick={() => onTop(song.id)} color="cyan" disabled={idx === 0} />
            <IconBtn glyph={Glyph.trash} title="Remove" onClick={askDelete} color="pink" />
          </>
        )}
      </div>
    </div>
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

window.KTV.UI = { NeonButton, IconBtn, Glyph, AddSongInput, QueueRow, ProfileSheet, Onboarding,
  fmtTime: __UI_fmtTime, ago: __UI_ago, EMOJI_POOL, uid: __UI_uid };
