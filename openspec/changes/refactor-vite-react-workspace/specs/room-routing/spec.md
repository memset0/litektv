## MODIFIED Requirements

### Requirement: Pretty URL pattern

The backend SHALL treat any single-segment path matching `^/[A-Za-z0-9_-]{1,64}$` (without a `.`) as a room slug and serve the SPA entry HTML (`index.html`) for it. In dev mode the entry HTML SHALL be served via Vite's middleware (so `<script type="module">` references resolve to live ES modules and an HMR client); in prod mode the entry HTML SHALL be served from the build output (`<staticDir>/index.html`, where `staticDir` defaults to `packages/frontend/dist/`). Slug parsing on the frontend SHALL prefer `location.pathname`.

#### Scenario: /comet-static-853 serves the SPA

- **WHEN** a browser visits `https://<host>/comet-static-853`
- **THEN** the backend SHALL respond with `200 text/html` returning the SPA entry (`index.html`), and the frontend SHALL read `comet-static-853` as the room slug

### Requirement: Reserved paths bypass the catch-all

The backend SHALL exclude `api`, `ws`, `favicon.ico`, `robots.txt`, `sitemap.xml`, and any path containing a `.` from the slug catch-all so REST/WS endpoints and static assets keep their real responses. The frontend's mirrored `RESERVED_PATHS` set SHALL stay in sync with this list and SHALL include `index.html` and `assets` as reserved single-segment names (the Vite-built SPA entry and bundle directory) — it SHALL NOT include the legacy `KTV.html`, `state.jsx`, `app.jsx`, `app-ui.jsx`, `player.jsx`, `urlparse.jsx`, `tweaks-panel.jsx`, `ktv.css`, `ktv-extras.css` names, since those source filenames no longer exist in the served output.

#### Scenario: /api routes still resolve

- **WHEN** a request hits `/api/parse-link` or `/api/health`
- **THEN** the REST router SHALL handle it; the slug catch-all SHALL NOT intercept

#### Scenario: Hashed asset requests still resolve

- **WHEN** a request hits `/assets/index-<hash>.js`, `/assets/index-<hash>.css`, or any other file under the static dir
- **THEN** the static handler (`express.static` in prod, `vite.middlewares` in dev) SHALL serve the file; the slug catch-all SHALL NOT shadow it

#### Scenario: Missing dotted asset returns 404, not the SPA

- **WHEN** a request hits `/missing.png` with no matching file
- **THEN** the backend SHALL return `404`, NOT the SPA HTML
