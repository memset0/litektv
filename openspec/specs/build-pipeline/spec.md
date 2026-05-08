# build-pipeline Specification

## Purpose
TBD - created by archiving change refactor-vite-react-workspace. Update Purpose after archive.
## Requirements
### Requirement: Single repository-root install

The repository SHALL expose a single `pnpm install` command at the repository root that installs every workspace member's dependencies. Per-package installs (`cd packages/<x> && pnpm install`) SHALL NOT be required for normal local setup.

#### Scenario: Fresh clone, fresh install

- **WHEN** a developer clones the repo and runs `pnpm install` at the repo root
- **THEN** `node_modules` SHALL be populated under both `packages/backend/` and `packages/frontend/` via the workspace lockfile, AND no separate install command in any sub-package SHALL be needed before `pnpm dev` works

### Requirement: Single-port single-process serving

The running application SHALL bind to one HTTP port (configured via `PORT`, default `38117`) and one Node process, serving REST (`/api/*`), the WebSocket protocol (`/ws`), AND the SPA from that one port — in both dev and prod modes.

#### Scenario: Dev mode binds only port 38117

- **WHEN** `pnpm dev` is running
- **THEN** the only port the application listens on SHALL be 38117 (or `PORT` if overridden); no separate Vite dev server SHALL be running on a different port

#### Scenario: Prod mode binds only port 38117

- **WHEN** the systemd unit is active with `NODE_ENV=production`
- **THEN** the only port the running Node process listens on SHALL be 38117

### Requirement: Hot module replacement in dev

In dev mode, edits to frontend source files (`packages/frontend/src/**/*.{ts,tsx,css}`) SHALL trigger Hot Module Replacement in connected browsers without a full page reload. HMR traffic SHALL share the same HTTP server (and therefore the same port) as REST and `/ws`.

#### Scenario: Editing a component reflects without reload

- **WHEN** `pnpm dev` is running and the developer edits a `.tsx` file under `packages/frontend/src/`
- **THEN** the connected browser SHALL receive an HMR update over its existing WebSocket connection (NOT `/ws`) and reflect the change without a full reload, AND the room state in the page SHALL be preserved across the update

### Requirement: Production bundle is served from build output

In prod mode, the SPA SHALL be served from the Vite build output at `packages/frontend/dist/`, and the running Node process SHALL NOT import or load Vite.

#### Scenario: Prod process does not depend on Vite

- **WHEN** `NODE_ENV=production node packages/backend/dist/index.js` is invoked with `vite` not installed
- **THEN** the process SHALL still start successfully and serve the SPA from `STATIC_DIR`

#### Scenario: Prod static dir contains the built bundle

- **WHEN** the prod process serves a request for `/`
- **THEN** the response body SHALL be `packages/frontend/dist/index.html` (or its equivalent under the configured `STATIC_DIR`), with hashed `<script type="module" src="/assets/...">` references resolved from the same dist directory

### Requirement: Repo-root build, dev, start, typecheck, test commands

The repo-root `package.json` SHALL expose `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm typecheck`, and `pnpm test` scripts. Each SHALL fan out to the appropriate workspace member(s) so developers run all common workflows from the repo root.

#### Scenario: Build produces both bundles

- **WHEN** `pnpm build` is invoked at the repo root
- **THEN** `packages/frontend/dist/index.html` (plus hashed asset bundles under `packages/frontend/dist/assets/`) SHALL exist AND `packages/backend/dist/index.js` SHALL exist

#### Scenario: Typecheck covers both members

- **WHEN** `pnpm typecheck` is invoked at the repo root
- **THEN** `tsc --noEmit` SHALL run against both `packages/frontend` and `packages/backend`, and the command SHALL exit non-zero if either fails

### Requirement: WebSocket upgrade routing by path

The HTTP server SHALL split incoming `upgrade` requests by URL path. `/ws` upgrades SHALL be claimed by the room-state-sync handler; other upgrade paths in dev MAY reach Vite's HMR server. The room-state-sync handler SHALL NOT claim non-`/ws` upgrades.

#### Scenario: /ws upgrade reaches the room handler

- **WHEN** a client opens a WebSocket to `ws://<host>:38117/ws?room=<slug>`
- **THEN** the connection SHALL be accepted by the room-state-sync handler (the same handler as today), and a `state` snapshot SHALL be delivered

#### Scenario: HMR upgrade reaches Vite

- **WHEN** `pnpm dev` is running and a Vite-served page opens its HMR WebSocket (default path `/`)
- **THEN** the upgrade SHALL be handled by Vite's HMR server, and the room-state-sync handler SHALL NOT see this upgrade event

### Requirement: SPA core is built from npm dependencies, not runtime CDN scripts

The SPA core runtime (React, JSX transform, `pinyin-pro`) SHALL be bundled from npm-installed packages declared in `packages/frontend/package.json`. The HTML entry SHALL NOT load React, ReactDOM, `@babel/standalone`, or `pinyin-pro` at runtime from `unpkg.com` or any other CDN. (`fonts.googleapis.com` `<link>` tags for typography remain permitted.)

#### Scenario: Built index.html has no unpkg scripts

- **WHEN** `pnpm build` completes and `packages/frontend/dist/index.html` is inspected
- **THEN** the file SHALL contain no `<script src="https://unpkg.com/...">` tags, no `@babel/standalone` reference, AND no `<script type="text/babel">` blocks

### Requirement: Frontend source is TypeScript

Every module shipped under `packages/frontend/src/` (excluding `tweaks-panel.jsx`, which remains out of scope) SHALL be authored as TypeScript (`.ts` or `.tsx`). `tsc --noEmit` for the frontend workspace member SHALL exit zero.

#### Scenario: No .jsx files remain in src/

- **WHEN** `find packages/frontend/src -name '*.jsx'` is run after the migration
- **THEN** the output SHALL be empty

