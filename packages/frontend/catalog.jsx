// catalog.jsx — favorites modal.
//
// Centered popup over the app. Search input pinned at the top. List ordered
// by added_at DESC (server-side; we just render the order we received).
// Esc / backdrop click closes. Each row has a single "+ to queue" action;
// removing a favorite is intentionally not supported in v1.

(function () {
  const __UI = window.KTV.UI;

  function CatalogModal({ open, onClose, onAddRef }) {
    const [favs] = window.KTV.useFavorites();
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
              <div className="empty">还没有收藏的歌 · 在队列或历史里点 ☆ 加进来</div>
            ) : filtered.length === 0 ? (
              <div className="empty">没有匹配「{q}」的歌</div>
            ) : (
              filtered.map((f) => {
                const key = `${f.source}:${f.videoId}:${f.page ?? 0}`;
                const meta = [{ kind: "src", source: f.source }];
                if (f.addedBy) meta.push({ kind: "by", name: f.addedBy.name, emoji: f.addedBy.emoji });
                meta.push({ kind: "time", ts: f.addedAt });
                return (
                  <__UI.SongCard
                    key={key}
                    songKey={key}
                    cover={<__UI.CoverThumb source={f.source} videoId={f.videoId} />}
                    title={f.title}
                    meta={meta}
                    actions={
                      <__UI.IconBtn
                        glyph={recentlyAdded[key] ? __UI.Glyph.check : __UI.Glyph.plusSm}
                        title={recentlyAdded[key] ? "已加入队列" : "加入队列"}
                        onClick={() => {
                          onAddRef({
                            source: f.source,
                            videoId: f.videoId,
                            page: f.source === "bili" && f.page ? f.page : undefined,
                          });
                          flashAdded(key);
                        }}
                        className={recentlyAdded[key] ? "is-flash" : null}
                      />
                    }
                  />
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
