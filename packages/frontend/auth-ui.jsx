// auth-ui.jsx — minimal login / signup / profile-edit modal.

(function () {
  const __UI = window.KTV.UI;
  const EMOJIS = __UI.EMOJI_POOL;

  function AuthModal({ open, mode = "login", onClose, onModeChange }) {
    const auth = window.KTV.useAuth();
    const [name, setName] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [emoji, setEmoji] = React.useState("🎤");
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
      if (!open) return;
      auth.clearError();
      setName(""); setPassword(""); setEmoji("🎤"); setBusy(false);
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, mode]);

    React.useEffect(() => {
      // close once we have an account
      if (open && auth.account && busy) {
        setBusy(false);
        onClose();
      }
      // surface errors by exiting busy state
      if (busy && auth.error) setBusy(false);
    }, [auth.account, auth.error]);

    if (!open) return null;
    const submit = () => {
      if (!name.trim() || password.length < 8) return;
      setBusy(true);
      if (mode === "signup") auth.signup({ name: name.trim(), password, emoji });
      else auth.login({ name: name.trim(), password });
    };

    return (
      <div className="sheet-overlay" onClick={onClose}>
        <div className="sheet auth-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <h3 className="neon-text" style={{ color: "var(--neon-pink)" }}>
              {mode === "signup" ? "REGISTER" : "LOGIN"}
            </h3>
            <button className="sheet-x" onClick={onClose}>×</button>
          </div>
          <div className="sheet-body">
            <label className="form-row">
              <span className="form-label">USERNAME</span>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="3–24 chars" autoFocus />
            </label>
            <label className="form-row">
              <span className="form-label">PASSWORD</span>
              <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} placeholder="≥ 8 chars" onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            </label>
            {mode === "signup" ? (
              <div className="form-row">
                <span className="form-label">AVATAR EMOJI</span>
                <div className="emoji-grid">
                  {EMOJIS.slice(0, 24).map((e) => (
                    <button key={e} className={`emoji-cell ${emoji === e ? "is-on" : ""}`} onClick={() => setEmoji(e)}>{e}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {auth.error ? <div className="add-err">{auth.error}</div> : null}
            <div className="sheet-actions">
              <__UI.NeonButton accent="pink" onClick={submit} disabled={busy || !name.trim() || password.length < 8}>
                {busy ? "…" : (mode === "signup" ? "CREATE ACCOUNT" : "LOG IN")}
              </__UI.NeonButton>
              <button className="ghost-btn" onClick={() => onModeChange(mode === "signup" ? "login" : "signup")}>
                {mode === "signup" ? "已有账号 · 去登录" : "还没账号 · 去注册"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.KTV.UI = window.KTV.UI || {};
  window.KTV.UI.AuthModal = AuthModal;
})();
