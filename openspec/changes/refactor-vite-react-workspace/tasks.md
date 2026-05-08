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

- [ ] 5.1 Add `vite` to `packages/backend/package.json` `optionalDependencies` (NOT `dependencies` — prod tarball MAY skip it). Run `pnpm install`.
- [ ] 5.2 Add `devMode: env.NODE_ENV === "development"` to `packages/backend/src/config.ts`.
- [ ] 5.3 In `packages/backend/src/index.ts`, restructure: keep REST router and slug catch-all in their current order; ADD a dev branch (after the catch-all) that does `await import("vite")` → `createServer({ root: path.resolve(import.meta.dirname, "../../frontend"), server: { middlewareMode: true, hmr: { server } }, appType: "spa" })` → `app.use(vite.middlewares)`. The slug catch-all in dev SHALL serve `await vite.transformIndexHtml(req.originalUrl, fs.readFileSync(indexHtmlPath, "utf-8"))` instead of `KTV.html` (read from `packages/frontend/index.html`). In prod, the slug catch-all serves `path.join(staticDir, "index.html")`.
- [ ] 5.4 In `packages/backend/src/ws.ts` (or wherever `attachWs` lives), guard the `upgrade` listener: only call `wss.handleUpgrade` when `URL.parse(req.url).pathname === "/ws"`; otherwise `socket.destroy()` is REPLACED by allowing fall-through to other upgrade listeners (which Vite registers via `hmr.server: server`). Concretely: change the listener to short-circuit ONLY for `/ws`, return without destroying the socket otherwise.
- [ ] 5.5 Update `packages/backend/package.json` `dev` script: `NODE_ENV=development STATIC_DIR=../frontend tsx watch src/index.ts` (note: in dev, `STATIC_DIR` is irrelevant — Vite drives — but keeping it set avoids the env-var-gating branch flipping unexpectedly).
- [ ] 5.6 Run `pnpm --filter litektv-backend typecheck` — fix errors. Run `pnpm --filter litektv-backend build` — confirm `dist/index.js` exists and is loadable (`node -e 'require("./packages/backend/dist/index.js")'` will boot the server; `Ctrl+C`).
- [ ] 5.7 Commit: `feat(backend): embed Vite middleware in dev, serve dist/ in prod`

## 6. Wire compatibility verification (local)

- [ ] 6.1 `pnpm dev` from repo root: confirm the Express log line `[litektv-backend] listening on http://127.0.0.1:38117` appears once and only once (no duplicate Vite listener)
- [ ] 6.2 `curl -sS http://127.0.0.1:38117/api/health` returns `{"ok":true,"time":...}`
- [ ] 6.3 Open `http://127.0.0.1:38117/` in a browser; SPA loads, no console errors, no `unpkg.com` requests in the network tab
- [ ] 6.4 Edit `packages/frontend/src/app.tsx` (e.g. tweak a string); confirm browser updates via HMR with no full reload, room state intact
- [ ] 6.5 Open a second tab against the same slug; queue-add a song in tab A; confirm tab B sees the update over `/ws`
- [ ] 6.6 Send a danmaku; confirm both tabs see it; confirm the danmaku layer animates as before
- [ ] 6.7 Drag-reorder the queue; confirm the reorder persists and propagates
- [ ] 6.8 Click 置顶 on row 3; confirm it moves to position 0
- [ ] 6.9 Click trash on a row; confirm the `window.confirm` dialog fires; confirm cancel cancels and OK removes
- [ ] 6.10 Paste a Bilibili share URL with Chinese title prefix; confirm `/api/parse-link` returns valid `ref`
- [ ] 6.11 Paste a YouTube URL; confirm same
- [ ] 6.12 Click a thumbnail in History; confirm the `+ REPLAY` action requeues the song
- [ ] 6.13 Toggle the side-panel collapse; confirm animation matches `app-shell` requirements
- [ ] 6.14 Visit `/missing.png`; confirm `404` (NOT the SPA HTML) — proves the room-routing dotted-asset rule still holds
- [ ] 6.15 Visit `/api/parse-link` via GET; confirm `404` from express (NOT the SPA HTML) — proves `/api` is reserved
- [ ] 6.16 Visit `/abc-123-test`; confirm SPA renders with that slug
- [ ] 6.17 Stop dev. Run `pnpm build` — confirm `packages/frontend/dist/index.html` + `dist/assets/*.{js,css}` exist; confirm the built `index.html` contains no `unpkg.com`, no `text/babel`, no `@babel/standalone`
- [ ] 6.18 Run `NODE_ENV=production STATIC_DIR=$(pwd)/packages/frontend/dist pnpm start` from repo root — confirm the prod process boots, `curl /api/health` works, the SPA loads from dist, and `ps aux | grep node | grep vite` returns NOTHING (no Vite in the running process)

## 7. Documentation updates

- [ ] 7.1 Update `README.md` "本地运行" section: replace the `cd packages/backend && STATIC_DIR=../frontend pnpm dev` block with `pnpm install && pnpm dev` at repo root; mention port 38117 stays the same; mention `pnpm build && pnpm start` for prod-mode local validation.
- [ ] 7.2 Update `README.md` "仓库结构" tree to reflect the workspace root + new `packages/frontend/{src/, vite.config.ts, package.json}` layout.
- [ ] 7.3 Update `packages/backend/README.md` if it documents the dev workflow (currently it points at the old `STATIC_DIR=../frontend` invocation — adjust).
- [ ] 7.4 Add a one-paragraph deployment note to `CLAUDE.md` under "Restart the systemd unit after backend changes": call out that `STATIC_DIR` MUST now point at `packages/frontend/dist` (not the raw source) and that `pnpm build` must run before any restart against new code. Frontend changes now require `pnpm build` to be re-run; a hard browser reload alone is no longer enough in prod.
- [ ] 7.5 Commit: `docs: update README and CLAUDE.md for new pnpm workspace + Vite pipeline`

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
