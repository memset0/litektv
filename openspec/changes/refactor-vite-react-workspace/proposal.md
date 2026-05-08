## Why

The frontend ships as raw `.jsx` files transformed in the browser by `@babel/standalone`, with React + `pinyin-pro` pulled from unpkg UMD and module sharing done through `window.KTV.*` globals. That means: slow first paint (parse + transform on every load), no HMR, no type checking, no tree-shaking, and a brittle global-bridge that fights any future modularization. The backend, meanwhile, is a standalone pnpm package with its own lockfile under `packages/backend/`, and dev requires a per-subdir incantation (`cd packages/backend && STATIC_DIR=../frontend pnpm dev`).

Lifting both packages under a single root pnpm workspace and replacing the runtime-Babel pipeline with a real Vite + React + TypeScript build lets us delete the unpkg/babel hot path, introduce types across the frontend, and collapse dev / prod into "one port (38117), one process" — which is also how Caddy + the deployed systemd unit already see the world.

## What Changes

- **ADD** repo-root `package.json` + `pnpm-workspace.yaml`; move `pnpm-lock.yaml` from `packages/backend/` to the repo root.
- **ADD** `packages/frontend/package.json` (the directory is currently not a Node package); declare `react`, `react-dom`, `pinyin-pro`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom` as deps.
- **CONVERT** the 7 frontend modules (`state`, `urlparse`, `player`, `pinyin-search`, `app-ui`, `catalog`, `app`) from `.jsx` to `.tsx`; replace every `window.KTV.*` / `window.*` global bridge with explicit ES `import` / `export`.
- **DELETE** the unpkg React UMD + `@babel/standalone` + pinyin-pro UMD `<script>` tags from the SPA entry HTML; rename `KTV.html` → `index.html` so it becomes Vite's default entry.
- **ADD** Vite middleware-mode integration in `packages/backend/src/index.ts`: when `NODE_ENV=development`, mount `vite.middlewares` AFTER the REST router and the slug catch-all, and split HTTP `upgrade` events by URL path so `/ws` keeps reaching `attachWs(server)` while other upgrades reach Vite's HMR server.
- **ADD** root-level scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm typecheck`, `pnpm test` — each fans out to the right workspace member.
- **CHANGE** prod static-serving target: `STATIC_DIR` now points at `packages/frontend/dist/` (Vite build output) instead of `packages/frontend/` (raw source). The systemd unit on the deploy box must be updated by the operator; this change documents the migration step but does NOT touch `/etc/systemd/system/litektv.service`.
- **BREAKING (developer workflow, not user-facing)**: install + dev commands change. `cd packages/backend && pnpm install` becomes `pnpm install` at repo root; `STATIC_DIR=../frontend pnpm dev` becomes `pnpm dev` at repo root.
- **NOT IN SCOPE**: WebSocket protocol, REST shapes, SQLite schema, room/queue/danmaku semantics, room-routing slug rules, `tweaks-panel.jsx` (currently unreferenced by `KTV.html`).

## Capabilities

### New Capabilities

- `build-pipeline`: workspace layout, dev-mode single-process integration of Vite + Express + WebSocket, prod-mode static-from-dist serving, the single-port (38117) invariant across both modes, and the build / typecheck / test command surface exposed at repo root.

### Modified Capabilities

- `room-routing`: the SPA entry HTML filename SHALL change from `KTV.html` to Vite's `index.html` (transformed by Vite middleware in dev, served from `dist/` in prod). The pretty-URL rules, reserved-path list, default-slug behavior, and legacy `?room=` migration are unchanged — only the filename referenced by the catch-all and frontend `RESERVED_PATHS` set is updated.

## Impact

**Code**
- Every `packages/frontend/*.jsx` is deleted and replaced with a `.tsx` module under `packages/frontend/src/`.
- `packages/frontend/KTV.html` is renamed to `packages/frontend/index.html` and stripped of the `<script src="https://unpkg.com/...">` block plus the `<script type="text/babel">` loader stanza.
- `packages/backend/src/index.ts` grows a dev-only Vite-middleware attach path (lazy `import("vite")` so prod doesn't pay for it) and the `server.upgrade` listener splits by URL path.
- New files: repo-root `package.json`, `pnpm-workspace.yaml`, `packages/frontend/package.json`, `packages/frontend/vite.config.ts`, `packages/frontend/tsconfig.json`.

**Dependencies**
- New runtime deps (frontend): `react@18`, `react-dom@18`, `pinyin-pro@3`.
- New dev deps (frontend): `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`.
- New dev deps (backend): `vite` (peer of the dev-mode middleware), kept as `optionalDependencies` or guarded by `NODE_ENV` so the prod tarball doesn't require it at runtime.
- Existing backend deps unchanged.

**Lockfile**
- `packages/backend/pnpm-lock.yaml` is removed; a new `pnpm-lock.yaml` is created at repo root covering both workspace members. First `pnpm install` after this change rewrites the dep graph.

**Deployment**
- `systemctl status litektv.service` will need a one-time edit to set `STATIC_DIR=/root/yulun/litektv/packages/frontend/dist`. Until that edit happens AND a fresh `pnpm build` has produced `dist/`, the unit serves an empty static dir. The migration tasks call this out explicitly so the operator (memset0) does it before the first restart against the new code.
- `DB_PATH=/root/yulun/litektv/backend/data/litektv.db` is unchanged — DB file location, schema, and `.gitignore` rule (`/backend/`) all stay.

**OpenSpec**
- `openspec/specs/room-routing/spec.md` gets a small text update (KTV.html → index.html in the SPA-entry requirement and reserved-paths scenario).
- `openspec/specs/build-pipeline/spec.md` is created.

**In-flight changes**
- `openspec/changes/add-favorites/` and `openspec/changes/unify-song-card/` both target `.jsx` files. This migration's `.jsx → .tsx` rename makes any pending patches against those files awkward to rebase. **Sequencing recommendation**: finish (apply + archive) those two changes BEFORE starting `/opsx:apply` on this one. The tasks file enforces a precondition check.
