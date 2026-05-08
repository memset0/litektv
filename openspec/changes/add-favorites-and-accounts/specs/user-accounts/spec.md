## ADDED Requirements

### Requirement: Account is `(name, password_hash, emoji)`

The backend SHALL store an account as `{account_id, name, emoji, password_hash, created_at, last_seen}`. `name` SHALL be 3–24 chars, unique case-insensitively, and matched by `[A-Za-z0-9_\-一-鿿]+`. `password_hash` SHALL be produced by argon2id with the library's default parameters. There SHALL NOT be an email field, password reset flow, or third-party identity binding in v1.

#### Scenario: Two accounts cannot share a name

- **WHEN** an account already exists with `name = "Memo"` and a new signup request arrives with `name = "memo"`
- **THEN** the server SHALL reject the request with `{type:"error", error:"name taken"}` and SHALL NOT create a row

### Requirement: Signup and login over WebSocket and REST

The backend SHALL accept either of the following equivalent flows:

- WebSocket: `{type:"auth.signup", name, password, emoji?}` and `{type:"auth.login", name, password}`. On success the server SHALL respond with `{type:"auth.ok", token, account:{id, name, emoji}}` and SHALL also send a fresh `favorites` snapshot scoped to the resulting account.
- REST: `POST /api/auth/signup` and `POST /api/auth/login` with the same JSON payloads, returning the same `{token, account}` shape on success.

`token` SHALL be a 32-byte url-safe random string and SHALL be stored in `sessions(token, account_id, created_at, last_seen)`.

#### Scenario: Login reuses an existing token

- **WHEN** a client already holds a valid `token` and sends `{type:"auth.login", name, password}` for the same account
- **THEN** the server MAY return a new token (the prior one is also still valid) and the new token SHALL be persisted in `sessions`

#### Scenario: Wrong password

- **WHEN** `auth.login` arrives with the right `name` but the wrong password
- **THEN** the server SHALL respond with `{type:"error", error:"invalid credentials"}` and SHALL NOT mutate state, and SHALL apply a per-name+IP backoff (≥1s after 5 failures within 60s)

### Requirement: Session tokens authenticate WebSockets

A client SHALL be able to attach a session by sending `{type:"auth.attach", token}` after `hello`, or by including `token` in the initial `hello`. Until that moment the connection SHALL be treated as anonymous (`owner_key = "anon:<userId>"`). Upon a successful `auth.attach`, the server SHALL update the connection's owner key to `"acct:<account_id>"` and send a fresh `favorites` snapshot. `auth.logout` SHALL clear the session token (and delete the row from `sessions`) and revert the connection to anonymous, again sending a fresh `favorites` snapshot.

#### Scenario: Logout reverts owner key

- **WHEN** a logged-in client sends `auth.logout`
- **THEN** the server SHALL delete the session row, the connection's owner key SHALL revert to `anon:<userId>`, and the next `favorites` snapshot delivered SHALL reflect the anonymous list (which may be empty)

### Requirement: Anonymous favorites merge into the account on login

When an anonymous client whose `userId` has rows in `favorites` under `anon:<userId>` successfully logs in (or signs up), the server SHALL, in a single SQL transaction:

1. For each `anon:<userId>` favorite row, insert a corresponding `acct:<account_id>` row using `INSERT OR IGNORE` (so an entry the account already had wins).
2. Delete all `anon:<userId>` rows.
3. Upsert `user_links(user_id, account_id, linked_at = now)`.

The server SHALL then send a `favorites` snapshot reflecting the merged list.

#### Scenario: Anonymous user signs up and brings favorites along

- **WHEN** an anonymous user has 5 favorites under `anon:u_abc` and signs up as account `Memo`
- **THEN** the server SHALL move all 5 rows to `acct:<id>`, the next `favorites` snapshot SHALL show all 5, and querying the `favorites` table for `owner_key = "anon:u_abc"` SHALL return 0 rows

#### Scenario: Conflict on merge

- **WHEN** anonymous favorites contain `(bili, BV1, 0)` and the account already has `(bili, BV1, 0)`
- **THEN** the merge SHALL keep the account's existing row (preserving its `added_at`) and SHALL drop the anonymous duplicate

### Requirement: Profile fields can be edited

A logged-in client SHALL be able to send `{type:"auth.profile", name?, emoji?, password?}` to update their own account. `name` changes SHALL re-check uniqueness; `password` changes SHALL re-hash with argon2id. The server SHALL respond with `{type:"auth.ok", account}` on success.

#### Scenario: Renaming to a taken name

- **WHEN** a logged-in user sends `auth.profile` with a `name` that another account already holds
- **THEN** the server SHALL respond with `{type:"error", error:"name taken"}` and SHALL NOT modify the account

### Requirement: Display identity precedence

When rendering presence (`users[*].name`/`emoji` in the room state) and `addedBy` on songs, the server SHALL use the account's `name`/`emoji` whenever a session is attached, overriding the `name`/`emoji` fields in the connection's `hello`. The frontend's hello SHALL still be honored for anonymous connections.

#### Scenario: Logged-in user appears under their account name

- **WHEN** an account named `Memo` (`emoji = 🎤`) joins room `aaa` and sends `queue.add` with hello `name="未命名"`, `emoji="👤"`
- **THEN** the resulting song's `addedBy` SHALL be `{name:"Memo", emoji:"🎤", anonymous:false, id:<account_id>}`
