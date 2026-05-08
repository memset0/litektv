## Context

Today the frontend is 7 hand-rolled `.jsx` files served raw and transformed in the browser by `@babel/standalone`, with React + `pinyin-pro` pulled from unpkg UMD and cross-file plumbing done through `window.KTV.*`. The backend is a separate pnpm package under `packages/backend/` (with its own `pnpm-lock.yaml`); dev requires `cd packages/backend && STATIC_DIR=../frontend pnpm dev`. Production is a single Node process behind Caddy on port 38117 (systemd unit serves `node packages/backend/dist/index.js` + `STATIC_DIR=packages/frontend`).

Operator constraints (from `CLAUDE.md` and `litektv.service`):
- Single deploy box, single port (38117), single process. Caddy / DNS already point at it.
- DB lives at `/root/yulun/litektv/backend/data/litektv.db` (root-level `backend/`, gitignored). Path must not change.
- WS protocol, REST shapes, SQLite schema, room-routing slug rules — all wire-stable with the live deployment; refactor must be drop-in.
- `litektv.service` only refreshes when systemd is restarted; stale-restart is the #1 footgun.

## Goals / Non-Goals

**Goals:**
- Repo-root pnpm workspace; `pnpm install` at root installs everything.
- Vite + React + TypeScript real build pipeline for the frontend; HMR in dev, hashed/optimized bundle in prod.
- Single port (38117), single Node process for both dev and prod.
- Wire compatibility: no observable change to `/api/*`, the `/ws` protocol, slug rewrite rules, or the SQLite database.

**Non-Goals:**
- No changes to WS message shapes (`room-state-sync` untouched).
- No changes to SQLite schema or `room-persistence` semantics.
- No changes to `link-parser`, `queue-controls`, or `thumbnail-cache` semantics.
- No migration of `tweaks-panel.jsx` (currently unreferenced by `KTV.html` — out of scope).
- No CSS / design-token migration; `ktv.css` and `ktv-extras.css` are imported as-is.
- No backend ESM-bundler migration; backend stays on plain `tsc` → `dist/`.

## Decisions

### D1. Workspace shape: pnpm workspace with two members

Repo root gets `package.json` (private, `"private": true`, no `version`) and `pnpm-workspace.yaml` declaring `packages/*`. Members:
- `packages/backend` — keeps name `litektv-backend`, keeps existing scripts, gains `vite` as an `optionalDependency` (so prod tarball doesn't strictly require it; the dev branch `await import('vite')`s it).
- `packages/frontend` — new package `litektv-frontend`, owns `vite.config.ts`, `tsconfig.json`, `src/`, plus the moved `index.html`.

**Alternatives considered:**
- *Collapse to a single root package*. Rejected — backend and frontend deps are genuinely disjoint (Express + better-sqlite3 vs React + Vite), backend tsconfig stays `module: ESNext / outDir: dist`, frontend tsconfig stays `jsx: react-jsx / noEmit: true`. The systemd unit's `WorkingDirectory=packages/backend` already encodes the split.
- *Move backend to root, keep only frontend as sub-package*. Rejected — asymmetric layout reads worse and would force a systemd unit edit unrelated to the actual change.

### D2. Single process, single port: Vite middleware-mode embedded in the Express app

`packages/backend/src/index.ts` becomes mode-aware. Sketch:

```ts
const server = http.createServer(app);

if (config.devMode) {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    root: path.resolve(import.meta.dirname, "../../frontend"),
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  // mount AFTER createRestRouter() and AFTER the slug catch-all
  app.use(vite.middlewares);
} else if (config.staticDir) {
  app.use(express.static(config.staticDir, { index: ["index.html"] }));
}

attachWs(server); // /ws path; attachWs filters by req.url

setInterval(gcRooms, 5 * 60 * 1000).unref();
server.listen(config.port, config.host, …);
```

Vite's HMR uses a separate WebSocket. With `hmr.server: server` it shares the existing HTTP server's `upgrade` stream. To avoid `/ws` colliding with HMR:
- `attachWs` is updated to register an `upgrade` handler that ONLY claims the request when `URL.parse(req.url).pathname === '/ws'`. Other upgrades fall through to whatever Vite installed.
- This keeps `/ws` semantics identical to today.

**Alternatives considered:**
- *Run Vite as a separate dev server on 5173 and proxy `/api`/`/ws` to Express via Vite's `server.proxy`*. Rejected — two processes, two ports; conflicts with the user's explicit "默认都绑定到 38117" constraint.
- *Run Express as a Vite plugin*. Rejected — inverts the prod / dev relationship; backend owns the process in prod, so it should also own the dev process to keep one mental model.

### D3. ESM module structure: drop `window.KTV.*`

Each `.tsx` file declares ordinary ES exports. Mapping:

| Old global | New module | Exports |
|---|---|---|
| `window.KTV.useRoom`, `useMe`, `useFavorites`, `SLUG`, `randomSlug` | `src/state.tsx` | named: `useRoom`, `useMe`, `useFavorites`, `SLUG`, `randomSlug` |
| `window.KTV.UI.*` | `src/app-ui.tsx` | named: `Topbar`, `MeChip`, `RoomBadge`, `SongCard`, ... |
| `window.KTV.urlparse` | `src/urlparse.ts` | named parsing helpers |
| `window.KTV.Player` | `src/player.tsx` | named `Player` |
| `window.KTV.Catalog` | `src/catalog.tsx` | named `Catalog` |
| `window.KTV.PinyinSearch` | `src/pinyin-search.ts` | named search utility |
| `app.jsx` body | `src/app.tsx` | default export `App` |
| (entry) | `src/main.tsx` | mounts `<App />` into `#root` |

Module conversion is mechanical per file: drop the IIFE wrapper, replace `const { x } = window.KTV` with `import { x } from "./state"`, replace `window.KTV.foo = …` / `Object.assign(window, …)` with `export const foo = …`. Locals that were "private" inside an IIFE just stay file-scoped — modules are already encapsulated.

The `RESERVED_PATHS` set in `state.tsx` (used to detect "this is an asset path, not a slug") drops `KTV.html`, `state.jsx`, `app.jsx`, `app-ui.jsx`, `player.jsx`, `urlparse.jsx`, `tweaks-panel.jsx`, `ktv.css`, `ktv-extras.css` and adds `index.html` and `assets`. Remaining members: `""`, `api`, `ws`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `index.html`, `assets`.

### D4. TypeScript scope: pragmatic, not exhaustive

Goal: every file compiles under `tsc --noEmit`, no fight against pre-existing dynamic patterns.
- Frontend `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: false` (relaxed for this codebase), `jsx: "react-jsx"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `target: "ES2022"`, `noEmit: true`.
- WS message types: import the existing `RoomState` / `Song` / `Favorite` types from `packages/backend/src/types.ts` via a TS path alias (`@litektv/types`). The frontend bundles its own erased copy; no runtime cross-package import. Added to frontend tsconfig:
  ```json
  "paths": { "@litektv/types": ["../backend/src/types.ts"] }
  ```
- React props: explicitly typed where they cross module boundaries; loose inline props are OK if no other module imports them.

### D5. Build commands

Root `package.json` scripts:
- `dev`: `pnpm --filter litektv-backend dev` (which runs `NODE_ENV=development STATIC_DIR=../frontend tsx watch src/index.ts`).
- `build`: `pnpm --filter litektv-frontend build && pnpm --filter litektv-backend build` (frontend first, then backend; ordering is defensive — backend doesn't import frontend output, but ordering keeps semantics linear).
- `start`: `pnpm --filter litektv-backend start` (assumes `STATIC_DIR=packages/frontend/dist` is set by the caller; in prod, systemd does that).
- `typecheck`: `pnpm -r --parallel typecheck`.
- `test`: `pnpm -r --parallel test` (currently only backend has tests).

### D6. Lockfile migration

Delete `packages/backend/pnpm-lock.yaml`. Run `pnpm install` at root. Commit the new repo-root `pnpm-lock.yaml`. Backend's `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` stays in `packages/backend/package.json` — pnpm honours per-package overrides in workspaces.

### D7. Static-asset and SPA-fallback ordering

In **prod**, Express middleware order is:
1. `createRestRouter()` — covers `/api/*`.
2. `express.static(staticDir, { index: ["index.html"] })` — serves `index.html` for `/`, hashed bundles for `/assets/*`, plus any other static files copied into `dist/`.
3. The existing slug catch-all `app.get('/:slug', ...)` — now sends `path.join(staticDir, 'index.html')` instead of `KTV.html`.

In **dev**, the order is identical except step 2 is replaced by `app.use(vite.middlewares)`, which Vite drives in `appType: "spa"` mode. We KEEP the explicit slug catch-all BEFORE `vite.middlewares` so the room-routing rules (reserved paths, dotted-asset-must-404 guard) keep their existing semantics — Vite's middleware would otherwise return the SPA HTML for any unknown path including `/missing.png`, which violates the existing `room-routing` requirement "Missing dotted asset returns 404, not the SPA". The slug catch-all explicitly serves `vite.transformIndexHtml(req.originalUrl, fs.readFileSync(indexHtmlPath, 'utf-8'))` instead of `KTV.html`.

### D8. CSS handling

`packages/frontend/ktv.css` and `ktv-extras.css` move under `packages/frontend/src/styles/` and are imported by `main.tsx` (`import "./styles/ktv.css"; import "./styles/ktv-extras.css";`). Vite hashes them in prod. File contents are unchanged.

The fonts loaded from `fonts.googleapis.com` stay as `<link>` tags in the new `index.html`.

## Risks / Trade-offs

- **[Risk] HMR WS path collision with `/ws`** → Mitigation: `attachWs` is updated to gate on `req.url.startsWith('/ws')` before claiming the upgrade. Smoke test: `pnpm dev`, open the SPA, edit `src/app.tsx`, confirm HMR fires AND queue-state sync still works (queue add → other tab sees it).
- **[Risk] Vite middleware accidentally enabled in prod** → Mitigation: `config.devMode = env.NODE_ENV === 'development'` (explicit, not default-true). The `vite` import is `await import(...)` — missing dep at runtime in prod throws "Cannot find module 'vite'" loudly, not silently.
- **[Risk] Frontend import refactor breaks subtle window.KTV side-effects** → Today some IIFE side-effects fire on `<script>` evaluation (e.g. `state.jsx` writing to `window.KTV` once). After conversion, that runs as module-load side-effect. Module evaluation is single-shot per import, so this is actually MORE deterministic than the IIFE form. Mitigation: post-migration manual smoke covers connect, queue add, queue reorder, queue top, danmaku send, favorite add/remove, link parse (Bilibili + YouTube), slug switch, fullscreen player.
- **[Risk] systemd unit pointed at old `STATIC_DIR=packages/frontend` after deploy → empty page** → Mitigation: tasks.md has an explicit operator step. Rollback is `git revert <merge>` + restore old systemd `STATIC_DIR` + `systemctl restart` — DB untouched, < 30s.
- **[Risk] In-flight `openspec/changes/{add-favorites, unify-song-card}` patch `.jsx` files** → The mass `.jsx → .tsx` rename in this change makes any pending patch against those files awkward to rebase. Mitigation: tasks.md task 0 verifies neither change is mid-implementation; if either is, this change pauses until they're archived.
- **[Trade-off] Lazy-importing `vite` in backend pays a one-time module-load latency on first dev request** → Acceptable; only affects dev startup.
- **[Trade-off] Path-aliased import of backend types from frontend tsconfig** → Couples frontend tsconfig to backend `types.ts` location. Acceptable inside a single-repo project; if backend's types ever move, the alias updates with it.

## Migration Plan

1. **Pre-flight**: confirm `add-favorites` and `unify-song-card` are archived or paused; pull latest master.
2. **Land code changes** per `tasks.md` — one feature/fix per commit per `CLAUDE.md`.
3. **Local verification** before pushing the final commit:
   - `pnpm install` at root resolves cleanly; no warnings about `better-sqlite3` rebuild.
   - `pnpm dev` boots; visit `http://127.0.0.1:38117/` — page loads, edit `src/app.tsx` → browser updates without reload, `/api/health` returns ok, two tabs against the same slug sync queue state.
   - `pnpm build && NODE_ENV=production STATIC_DIR=packages/frontend/dist pnpm start` serves the prod bundle on 38117 with no Vite in the running process.
4. **Operator deploy step (manual, NOT done by Claude)**:
   - On the deploy box: `pnpm install && pnpm build`.
   - `sudo systemctl edit --full litektv.service`: change `Environment=STATIC_DIR=…/packages/frontend` → `…/packages/frontend/dist`.
   - `sudo systemctl daemon-reload && sudo systemctl restart litektv.service`.
   - `systemctl status litektv.service`: confirm Active timestamp is fresh AND PID is the new process.
5. **Rollback**: `git revert <merge-commit>` + restore old `STATIC_DIR` + `systemctl restart`. DB is untouched throughout, no data risk.

## Open Questions

- `pnpm-workspace.yaml` glob (`packages/*`) vs explicit list — pick `packages/*` (idiomatic, no extra friction if a third workspace member ever appears).
- `.npmrc` at repo root — leave defaults unless `better-sqlite3`'s prebuild step complains during the first install; revisit if it does.
- `tweaks-panel.jsx` — currently unreferenced by `KTV.html`. Out of scope for this change; do not delete (could be live-code for an off-tree harness). Leave the file alone; no `.jsx → .tsx` conversion.
