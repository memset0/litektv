// catalog.tsx — favorites modal.
//
// Centered popup over the app. Search input pinned at the top. List ordered
// by added_at DESC (server-side; we just render the order we received).
// Esc / backdrop click closes. Each row has a single "+ to queue" action;
// removing a favorite is intentionally not supported in v1.

import { useEffect, useRef, useState } from "react";
import type { SongRef } from "@litektv/types";
import { useFavorites } from "./state";
import { CoverThumb, Glyph, IconBtn, SongCard, type MetaBit } from "./app-ui";
import { filterFavorites } from "./pinyin-search";

interface CatalogModalProps {
  open: boolean;
  onClose: () => void;
  onAddRef: (ref: SongRef) => void;
}

export function CatalogModal({ open, onClose, onAddRef }: CatalogModalProps) {
  const [favs] = useFavorites();
  const [q, setQ] = useState("");
  const [recentlyAdded, setRecentlyAdded] = useState<Record<string, true>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    setQ("");
    setTimeout(() => {
      try { inputRef.current?.focus(); } catch {}
    }, 30);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const filtered = filterFavorites(favs, q);

  const flashAdded = (key: string) => {
    setRecentlyAdded((r) => ({ ...r, [key]: true }));
    setTimeout(() => {
      setRecentlyAdded((r) => {
        const n = { ...r };
        delete n[key];
        return n;
      });
    }, 1300);
  };

  return (
    <div className="sheet-overlay catalog-overlay" onClick={onClose}>
      <div className="sheet catalog-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3 className="neon-text" style={{ color: "var(--neon-pink)" }}>
            MY SONGS <span className="catalog-count">{favs.length}</span>
          </h3>
          <button className="sheet-x" onClick={onClose}>×</button>
        </div>
        <div className="catalog-search-row">
          <input
            ref={inputRef}
            className="catalog-search"
            placeholder="Search catalog — pinyin, initials, or partial title"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="catalog-list scrollbar">
          {favs.length === 0 ? (
            <div className="empty">No saved songs yet — tap ☆ on a queue or history row to save one.</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No matches for "{q}"</div>
          ) : (
            filtered.map((f) => {
              const key = `${f.source}:${f.videoId}:${f.page ?? 0}`;
              const meta: MetaBit[] = [{ kind: "src", source: f.source }];
              if (f.addedBy) meta.push({ kind: "by", name: f.addedBy.name, emoji: f.addedBy.emoji });
              meta.push({ kind: "time", ts: f.addedAt });
              const flashed = !!recentlyAdded[key];
              return (
                <SongCard
                  key={key}
                  songKey={key}
                  cover={<CoverThumb source={f.source} videoId={f.videoId} />}
                  title={f.title}
                  meta={meta}
                  actions={
                    <IconBtn
                      glyph={flashed ? Glyph.check : Glyph.plusSm}
                      title={flashed ? "Added to queue" : "Add to queue"}
                      onClick={() => {
                        onAddRef({
                          source: f.source,
                          videoId: f.videoId,
                          page: f.source === "bili" && f.page ? f.page : undefined,
                        });
                        flashAdded(key);
                      }}
                      className={flashed ? "is-flash" : null}
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
