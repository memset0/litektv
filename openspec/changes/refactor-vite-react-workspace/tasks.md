## 0. Pre-flight (block on these before doing anything destructive)

- [ ] 0.1 `git status` clean on `master`; `git pull --ff-only origin master`
- [x] 0.2 `add-favorites` is archived (commit `d26e0ed`, archived 2026-05-08).
- [x] 0.3 `unify-song-card` is archived (commit `135bcc0`, archived 2026-05-08).
- [ ] 0.4 Take a backup snapshot of `/root/yulun/litektv/backend/data/litektv.db` (`cp` to `litektv.db.bak.<date>`) — DB is not modified by this change but the safety cost is zero

## 1. Workspace skeleton

- [ ] 1.1 Add `pnpm-workspace.yaml` at repo root with `packages: [packages/*]`
- [ ] 1.2 Add repo-root `package.json` (private, no version) with: `name: "litektv"`, `private: true`, `engines.node: ">=20"`, `engines.pnpm: ">=10"`, scripts `dev` / `build` / `start` / `typecheck` / `test` (per `design.md` D5)
- [ ] 1.3 Move `pnpm-lock.yaml` from `packages/backend/` to repo root: `git mv packages/backend/pnpm-lock.yaml ./pnpm-lock.yaml` then run `pnpm install` at root and let pnpm rewrite the lockfile structure for the new workspace topology
- [ ] 1.4 Verify root `pnpm install` resolves cleanly (no warnings about `better-sqlite3` rebuild — backend's `pnpm.onlyBuiltDependencies` should still take effect)
- [ ] 1.5 Commit: `chore(workspace): move pnpm-lock to repo root, add pnpm-workspace.yaml`

## 2. Frontend package + Vite scaffold

- [ ] 2.1 Create `packages/frontend/package.json` with: `name: "litektv-frontend"`, `private: true`, `type: "module"`, scripts `dev` / `build` / `typecheck`, deps `react@^18.3` / `react-dom@^18.3` / `pinyin-pro@^3.27`, devDeps `vite@^5` / `@vitejs/plugin-react@^4` / `typescript@^5.7` / `@types/react@^18` / `@types/react-dom@^18`
- [ ] 2.2 Create `packages/frontend/tsconfig.json` per design D4 (strict, jsx react-jsx, ESNext modules, Bundler resolution, paths `@litektv/types` → `../backend/src/types.ts`, noEmit)
- [ ] 2.3 Create `packages/frontend/vite.config.ts` with `@vitejs/plugin-react`, `root: __dirname`, `build.outDir: "dist"`, `server.port: 5173` (only used for stand-alone vite dev — middleware mode bypasses it)
- [ ] 2.4 Create `packages/frontend/src/` directory; create `packages/frontend/src/styles/` and move `ktv.css` + `ktv-extras.css` into it (`git mv` to preserve history)
- [ ] 2.5 Re-run `pnpm install` at root; confirm `packages/frontend/node_modules` symlinks resolve

## 3. Frontend entry HTML migration

- [ ] 3.1 Create `packages/frontend/index.html` from `KTV.html`, dropping the `<script src="https://unpkg.com/...">` tags for React, ReactDOM, `@babel/standalone`, `pinyin-pro`, dropping the seven `<script type="text/babel" src="...">` lines, and adding a single `<script type="module" src="/src/main.tsx"></script>` before `</body>`. Keep the `fonts.googleapis.com` `<link>` tags. Keep the existing `<style id="ktv-base">` block AS-IS for now (refactoring CSS is out of scope).
- [ ] 3.2 Update the `<title>` if needed (no — leave as-is; `app.tsx` overwrites it on mount)
- [ ] 3.3 `git rm packages/frontend/KTV.html` once `index.html` is committed and verified
- [ ] 3.4 Open `packages/frontend/index.html` in a quick `python -m http.server` from `packages/frontend/` to confirm the HTML parses and the font preconnect/links don't 404 (CSS will be missing — that's expected before main.tsx exists)

## 4. Frontend module conversion (.jsx → .tsx, drop window.KTV)

Per design D3, convert each file. After every file, run `pnpm --filter litektv-frontend typecheck` to surface incremental errors.

- [ ] 4.1 Move `state.jsx` → `src/state.tsx`. Drop the `(function () { ... })()` wrapper. Replace `Object.assign(window.KTV ??= {}, { useRoom, useMe, useFavorites, SLUG, randomSlug, ... })` with `export { useRoom, useMe, useFavorites, SLUG, randomSlug }`. Update `RESERVED_PATHS` per design D3 (drop legacy filenames, add `index.html` and `assets`). Type the WS message handlers using imports from `@litektv/types`.
- [ ] 4.2 Move `urlparse.jsx` → `src/urlparse.ts` (no JSX in this file — pure helpers). Replace `window.KTV.urlparse = ...` with named exports.
- [ ] 4.3 Move `pinyin-search.jsx` → `src/pinyin-search.ts`. Import `pinyin` from `pinyin-pro` (npm) instead of relying on `window.pinyinPro`.
- [ ] 4.4 Move `app-ui.jsx` → `src/app-ui.tsx`. Replace `Object.assign(window.KTV.UI ??= {}, { ... })` with named exports for each component.
- [ ] 4.5 Move `catalog.jsx` → `src/catalog.tsx`. Replace globals with imports from `./state`, `./app-ui`. Export the `Catalog` component.
- [ ] 4.6 Move `player.jsx` → `src/player.tsx`. Same treatment.
- [ ] 4.7 Move `app.jsx` → `src/app.tsx`. Convert the IIFE that mounts `<App />` to `export default function App() { ... }`. Move the actual `ReactDOM.createRoot(...).render(<App />)` call into `src/main.tsx` (next task).
- [ ] 4.8 Create `src/main.tsx` with: `import "./styles/ktv.css"; import "./styles/ktv-extras.css"; import App from "./app"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")!).render(<App />);`. Add `<div id="root"></div>` to `index.html` body.
- [ ] 4.9 Run `pnpm --filter litektv-frontend typecheck` — fix all errors. Run `pnpm --filter litektv-frontend build` — confirm `dist/index.html` + `dist/assets/*.js` are produced.
- [ ] 4.10 `git rm` all the old `.jsx` files (state, urlparse, pinyin-search, app-ui, catalog, player, app) — leave `tweaks-panel.jsx` alone per design.
- [ ] 4.11 Commit: `refactor(frontend): migrate .jsx → .tsx, drop window.KTV bridge, switch to Vite ESM`

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
