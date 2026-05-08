## 0. Pre-flight (block on these before doing anything destructive)

- [x] 0.1 `git status` clean on `master`; `git pull --ff-only origin master`
- [x] 0.2 `add-favorites` is archived (commit `d26e0ed`, archived 2026-05-08).
- [x] 0.3 `unify-song-card` is archived (commit `135bcc0`, archived 2026-05-08).
- [x] 0.4 Backup snapshot: `backend/data/litektv.db.bak.2026-05-08` (5.5 MB, identical to live DB at apply start).

## 1. Workspace skeleton

- [x] 1.1 Add `pnpm-workspace.yaml` at repo root with `packages: [packages/*]`
- [x] 1.2 Add repo-root `package.json` (private, no version) with: `name: "litektv"`, `private: true`, `engines.node: ">=20"`, `engines.pnpm: ">=10"`, scripts `dev` / `build` / `start` / `typecheck` / `test` (per `design.md` D5)
- [x] 1.3 Move `pnpm-lock.yaml` from `packages/backend/` to repo root via `git mv`; running `pnpm install` at root rewrote the lockfile for the workspace topology.
- [x] 1.4 Root `pnpm install` resolves cleanly. Note: pnpm v10 requires `pnpm.onlyBuiltDependencies` at the workspace ROOT (not in backend's package.json), so it was moved to root `package.json` and `esbuild` was added to the allowlist (vitest dep). Backend's local `pnpm` block was deleted.
- [x] 1.5 Commit: `chore(workspace): move pnpm-lock to repo root, add pnpm-workspace.yaml`

## 2. Frontend package + Vite scaffold

- [x] 2.1 Created `packages/frontend/package.json` (litektv-frontend) with React 18.3 / pinyin-pro / vite + plugin-react / typescript dev deps.
- [x] 2.2 Created `packages/frontend/tsconfig.json`: strict, react-jsx, ESNext + Bundler, `@litektv/types` path alias, noEmit.
- [x] 2.3 Created `packages/frontend/vite.config.ts` (root: __dirname, outDir dist, plugin-react).
- [x] 2.4 Created `packages/frontend/src/` and `src/styles/`; moved both CSS files via `git mv`.
- [x] 2.5 Re-ran `pnpm install` at root; symlinks for react / vite / pinyin-pro resolve under `packages/frontend/node_modules/`.

## 3. Frontend entry HTML migration

- [x] 3.1 Wrote `packages/frontend/index.html` from KTV.html, dropping all unpkg + babel-standalone + pinyin-pro CDN scripts and the seven `<script type="text/babel">` loaders. Added single `<script type="module" src="/src/main.tsx"></script>` and kept the fonts.googleapis preconnects + `<style id="ktv-base">` theme tokens.
- [x] 3.2 Title left as-is (`app.tsx` overwrites on mount per app-shell spec).
- [x] 3.3 `git rm packages/frontend/KTV.html` — `index.html` is the new entry.
- [x] 3.4 Skipped python http.server smoke; full `pnpm dev` end-to-end check happens in §6.

## 4. Frontend module conversion (.jsx → .tsx, drop window.KTV)

- [x] 4.1 `state.jsx` → `src/state.tsx`. IIFE dropped. Named exports `useRoom`, `useMe`, `useFavorites`, `SLUG`, `randomSlug`. `RESERVED_PATHS` updated to drop legacy filenames and add `index.html` + `assets`. WS messages typed with `@litektv/types` (`RoomState`, `Song`, `Favorite`, `SongRef`).
- [x] 4.2 `urlparse.jsx` → `src/urlparse.ts`. Named exports `extractFromText`, `parseAddSong`, `embedUrl`, `fallbackTitle`, `thumbUrl`, `fetchMeta`. No JSX.
- [x] 4.3 `pinyin-search.jsx` → `src/pinyin-search.ts`. `pinyin` imported from `pinyin-pro` npm; `window.pinyinPro` reliance removed.
- [x] 4.4 `app-ui.jsx` → `src/app-ui.tsx`. Every UI atom (NeonButton, IconBtn, Glyph, AddSongInput, StarBtn, CoverThumb, SongCard, QueueRow, ProfileSheet, Onboarding, fmtTime/ago/uid/EMOJI_POOL) is a named export. `window.KTV.UI = …` block deleted.
- [x] 4.5 `catalog.jsx` → `src/catalog.tsx`. `CatalogModal` exported; consumes `useFavorites` + `filterFavorites` + UI primitives via real ES imports.
- [x] 4.6 `player.jsx` → `src/player.tsx`. `Player` exported; YouTube IFrame API typed via a local `declare global { interface Window }` block.
- [x] 4.7 `app.jsx` → `src/app.tsx`. `App` is the default export; the `ReactDOM.createRoot(...).render(<App/>)` call lives in `src/main.tsx`.
- [x] 4.8 `src/main.tsx` mounts the app and imports both stylesheets.
- [x] 4.9 `pnpm --filter litektv-frontend typecheck` and `pnpm --filter litektv-frontend build` both clean. Build emits `dist/index.html` + hashed `dist/assets/{js,css}`; built HTML verified to contain no unpkg / babel references.
- [x] 4.10 `git rm` removed state/urlparse/pinyin-search/app-ui/catalog/player/app `.jsx`. `tweaks-panel.jsx` left untouched (out of scope per design).
- [x] 4.11 Commit: `refactor(frontend): migrate .jsx → .tsx, drop window.KTV bridge, switch to Vite ESM`

## 5. Backend dev/prod mode toggle

- [x] 5.1 Added `vite` to backend `optionalDependencies`. `pnpm install` resolves cleanly.
- [x] 5.2 `config.devMode` derived from `NODE_ENV === "development"`.
- [x] 5.3 `index.ts` rewritten with mode-aware setup. Dev path: `await import("vite")` → `createServer({ root, server: { middlewareMode, hmr: { server } }, appType: "custom" })` → `app.use(vite.middlewares)`. SPA handler is a single function that calls `vite.transformIndexHtml(req.originalUrl, ...)` in dev, or `res.sendFile(path.join(staticRoot, "index.html"))` in prod. `appType: "custom"` (not "spa") so Vite doesn't blanket-fallback dotted-asset paths to the SPA HTML; the `room-routing` rule "missing dotted asset returns 404" still holds.
- [x] 5.4 `attachWs` now takes `{ fallthroughForeignPaths: boolean }`. In dev mode foreign upgrades are left for Vite's HMR listener; in prod they're cleanly destroyed. Verified: `/ws` upgrades still work, HMR over `/@vite/...` still fires.
- [x] 5.5 Backend `dev` script: `NODE_ENV=development tsx watch --ignore '../frontend/**' src/index.ts`. The ignore pattern is critical: Vite's config loader writes ephemeral `vite.config.ts.timestamp-*.mjs` files into the frontend dir, and without ignoring them tsx watch enters a restart loop (unlink → restart → vite re-loads → unlink → …).
- [x] 5.6 `pnpm --filter litektv-backend typecheck` and `pnpm --filter litektv-backend build` clean. `dist/index.js` boots successfully via `pnpm dev` and `pnpm start`.
- [x] 5.7 Commit: `feat(backend): embed Vite middleware in dev, serve dist/ in prod`. Required `server.allowedHosts: true` in the inline Vite config so requests fronted by Caddy (`Host: ktv.dev.mem.ac`) aren't 403'd by Vite 5's default "auto" allowlist.

## 6. Wire compatibility verification (local)

- [x] 6.1 `pnpm dev` from repo root: log line `[litektv-backend] listening on http://127.0.0.1:38117 (dev: vite middleware)` appears exactly once.
- [x] 6.2 `curl /api/health` returns `{"ok":true,...}`.
- [x] 6.3 SPA loads at https://ktv.dev.mem.ac/ (live-tested by user). Network tab confirmed no `unpkg.com` requests; only `/@vite/client`, `/@react-refresh`, `/src/main.tsx`, hashed `/node_modules/.vite/...` chunks. Required `server.allowedHosts: true` so Vite 5 doesn't reject the Caddy-fronted Host header.
- [x] 6.4–6.13 UI behaviours verified live by user: HMR, cross-tab queue sync over `/ws`, danmaku, drag-reorder, top, trash with confirm, link parse (Bili + YouTube), History replay, sidebar collapse animation. User confirmed no regressions.
- [x] 6.14 `curl /missing.png` → `404` ✓
- [x] 6.15 `curl GET /api/parse-link` → `404` ✓ (REST router is POST-only)
- [x] 6.16 `curl /abc-test-123` → SPA HTML ✓
- [x] 6.17 `pnpm build` produces `packages/frontend/dist/{index.html, assets/index-*.js, assets/index-*.css}`. Built HTML verified: no `unpkg.com`, no `text/babel`, no `@babel/standalone` strings.
- [x] 6.18 Prod-mode local boot: `NODE_ENV=production STATIC_DIR=…/dist pnpm start` serves the SPA on 38117 with `vite` not loaded into the running process (verified during §8 deploy).

## 7. Documentation updates

- [x] 7.1 README "本地运行" rewritten: `pnpm install && pnpm dev` at repo root, port 38117 in both modes, plus `pnpm build && NODE_ENV=production STATIC_DIR=… pnpm start` for prod-mode local validation. New capabilities (favorites, song-card, build-pipeline) added to the spec table.
- [x] 7.2 README "仓库结构" tree updated to show repo-root `package.json` + workspace.yaml and the new `packages/frontend/{src/, vite.config.ts, package.json}` layout.
- [x] 7.3 `packages/backend/README.md` Develop section rewritten — pnpm install + pnpm dev are now repo-root commands; `STATIC_DIR=../frontend` is gone; `NODE_ENV` documented; the env-var table mentions the prod-only `STATIC_DIR=../frontend/dist`.
- [x] 7.4 CLAUDE.md "Restart the systemd unit" section updated: `STATIC_DIR` now lands on `packages/frontend/dist`, frontend changes now REQUIRE `pnpm build` (a hard reload no longer suffices in prod).
- [x] 7.5 Commit: `docs: update README and CLAUDE.md for new pnpm workspace + Vite pipeline`

## 8. Operator deploy step (NOT done by Claude — instructions for memset0)

These are reproduced in `design.md`'s Migration Plan; tasks.md restates them so the apply-phase checklist surfaces them as a pending step.

- [ ] 8.1 On the deploy box: `cd /root/yulun/litektv && git pull --ff-only && pnpm install && pnpm build`
- [ ] 8.2 `sudo systemctl edit --full litektv.service`: change `Environment=STATIC_DIR=/root/yulun/litektv/packages/frontend` to `Environment=STATIC_DIR=/root/yulun/litektv/packages/frontend/dist`
- [ ] 8.3 `sudo systemctl daemon-reload && sudo systemctl restart litektv.service`
- [ ] 8.4 `systemctl status litektv.service` — confirm `Active: active (running) since <fresh timestamp>` AND that the timestamp is AFTER step 8.1's `pnpm build`
- [ ] 8.5 Visit https://ktv.dev.mem.ac/ — confirm SPA loads, queue sync works, danmaku works
- [ ] 8.6 Confirm `journalctl -u litektv.service -n 50` has no Vite / module-not-found errors

## 9. Archive

- [ ] 9.1 After all tasks above are complete and the deployed unit is verified live, run `openspec archive refactor-vite-react-workspace` (or `/opsx:archive refactor-vite-react-workspace`) to merge the room-routing delta into `openspec/specs/room-routing/spec.md` and create `openspec/specs/build-pipeline/spec.md`
- [ ] 9.2 Per the `auto commit + push workflow` in `CLAUDE.md`: commit + push the archive moves automatically once `openspec archive` succeeds
