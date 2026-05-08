# Room Routing

## Purpose

Each room is reachable via a pretty URL of the form `https://<host>/<slug>`. The backend serves the SPA on every slug-shaped path; reserved paths and asset paths are excluded so they keep returning real responses.

## Requirements

### Requirement: Pretty URL pattern

The backend SHALL treat any single-segment path matching `^/[A-Za-z0-9_-]{1,64}$` (without a `.`) as a room slug and serve `KTV.html` for it. Slug parsing on the frontend SHALL prefer `location.pathname`.

#### Scenario: /comet-static-853 serves the SPA

- **WHEN** a browser visits `https://<host>/comet-static-853`
- **THEN** the backend SHALL respond with `200 text/html` returning `KTV.html`, and the frontend SHALL read `comet-static-853` as the room slug

### Requirement: Reserved paths bypass the catch-all

The backend SHALL exclude `api`, `ws`, `favicon.ico`, `robots.txt`, `sitemap.xml`, and any path containing a `.` from the slug catch-all so REST/WS endpoints and static assets keep their real responses.

#### Scenario: /api routes still resolve

- **WHEN** a request hits `/api/parse-link` or `/api/health`
- **THEN** the REST router SHALL handle it; the slug catch-all SHALL NOT intercept

#### Scenario: Static asset requests still resolve

- **WHEN** a request hits `/state.jsx`, `/ktv.css`, or any other file under the static dir
- **THEN** `express.static` SHALL serve the file; the slug catch-all SHALL NOT shadow it

#### Scenario: Missing dotted asset returns 404, not the SPA

- **WHEN** a request hits `/missing.png` with no matching file
- **THEN** the backend SHALL return `404`, NOT the SPA HTML

### Requirement: Default slug is a 6-digit number

When no slug is present in the URL (visit to `/`), the frontend SHALL generate a random 6-digit numeric slug, navigate to `/<digits>` via `history.replaceState`, and use it as the room id. Collisions are acceptable — the server lazily creates rooms, so two parties picking the same number simply share a room.

#### Scenario: Visiting / lands you in a fresh room

- **WHEN** a user navigates to `https://<host>/` with no recent room
- **THEN** the URL SHALL update to `https://<host>/<6-digit-number>` and the client SHALL connect to that room over WebSocket

### Requirement: Legacy ?room= URLs are migrated

The frontend SHALL accept `?room=<slug>` (or `#room=<slug>`) for back-compat and rewrite the URL to the pretty form on first load.

#### Scenario: Legacy QR / shared link

- **WHEN** a visitor opens `https://<host>/?room=abc-123`
- **THEN** the URL bar SHALL update to `https://<host>/abc-123` and the WS connection SHALL use `abc-123` as the room
