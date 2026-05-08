// catalog.jsx — favorites modal.
//
// Centered popup over the app. Search input pinned at the top. List ordered
// by added_at DESC (server-side; we just render the order we received).
// Esc / backdrop click closes; row actions are "+ to queue" and "remove
// (un-star)".

(function () {
  const __UI = window.KTV.UI;

  function CatalogModal({ open, onClose, onAddRef }) {
    const [favs, favOps] = window.KTV.useFavorites();
    const [q, setQ] = React.useState("");
    const [recentlyAdded, setRecentlyAdded] = React.useState({});
    const inputRef = React.useRef(null);

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      // Reset and focus on open.
      setQ("");
      setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch {} }, 30);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;
    const filtered = window.KTV.search.filterFavorites(favs, q);

    const flashAdded = (key) => {
      setRecentlyAdded((r) => ({ ...r, [key]: true }));
      setTimeout(() => setRecentlyAdded((r) => { const n = { ...r }; delete n[key]; return n; }), 1300);
    };

    return (
      <div className="sheet-overlay catalog-overlay" onClick={onClose}>
        <div className="sheet catalog-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <h3 className="neon-text" style={{ color: "var(--neon-cyan)" }}>
              MY SONGS <span className="catalog-count">{favs.length}</span>
            </h3>
            <button className="sheet-x" onClick={onClose}>×</button>
          </div>
          <div className="catalog-search-row">
            <input
              ref={inputRef}
              className="catalog-search"
              placeholder="搜索歌单 · pinyin / 首字母 / 部分都行"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="catalog-list scrollbar">
            {favs.length === 0 ? (
              <div className="empty">还没有收藏的歌 · 在队列或历史里点 ★ 加进来</div>
            ) : filtered.length === 0 ? (
              <div className="empty">没有匹配「{q}」的歌</div>
            ) : (
              filtered.map((f) => {
                const key = `${f.source}:${f.videoId}:${f.page ?? 0}`;
                return (
                  <div className="cat-row" key={key}>
                    <div className="cat-meta">
                      <div className="cat-title" title={f.title}>{f.title}</div>
                      <div className="cat-sub">
                        <span className="src-tag" data-src={f.source}>{f.source === "yt" ? "YT" : "Bili"}</span>
                        {f.page && f.page > 1 ? <span className="cat-p">P{f.page}</span> : null}
                        <span className="cat-time">{__UI.ago(f.addedAt)}</span>
                      </div>
                    </div>
                    <div className="cat-actions">
                      <button
                        className={`cat-add ${recentlyAdded[key] ? "is-flash" : ""}`}
                        onClick={() => {
                          onAddRef({
                            source: f.source,
                            videoId: f.videoId,
                            page: f.source === "bili" && f.page ? f.page : undefined,
                          });
                          flashAdded(key);
                        }}
                        title="加入队列"
                      >
                        {recentlyAdded[key] ? "✓ 已加" : "+ 加入"}
                      </button>
                      <button
                        className="cat-unstar"
                        title="移出收藏"
                        onClick={() => favOps.removeFavorite(f)}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  window.KTV.UI = window.KTV.UI || {};
  window.KTV.UI.CatalogModal = CatalogModal;
})();
