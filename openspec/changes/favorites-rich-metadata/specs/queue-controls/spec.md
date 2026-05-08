## MODIFIED Requirements

### Requirement: Star button on every queue and history row

Every queue row (current and pending) and every history row SHALL render a star button. The icon SHALL be filled when the row's `(source, videoId, page?)` is present in the global favorites snapshot, otherwise empty.

When the row is NOT yet favorited, clicking the star SHALL send `{type:"favorite.add", song:{...}}` derived from the row's fields. When the row IS already favorited, clicking the star SHALL open the same Favorite Edit modal that the catalog row's edit button opens, pre-populated with the matching favorite's current `displayTitle` / `authors` / `mode`. The button SHALL NOT be `disabled`. v1 does NOT support unstar from this control directly — to remove a favorite, the user uses the trash button inside the Edit modal (or in the catalog row, see below).

#### Scenario: Star a pending row

- **WHEN** the user clicks an empty star on a pending queue row
- **THEN** the client SHALL send `favorite.add` populated from the row's `source`, `videoId`, `page`, `title`, and `thumb`; after the resulting `favorites` snapshot the star SHALL render as filled

#### Scenario: Click filled star opens edit modal

- **WHEN** the user clicks a filled star on any queue or history row
- **THEN** no `favorite.add` SHALL be sent; instead the Favorite Edit modal SHALL open scoped to that song, pre-populated with the existing `displayTitle` / `authors` / `mode` (if any)

#### Scenario: A's star fills B's queue row in real time

- **WHEN** user A stars a song that's also in user B's queue rendering
- **THEN** B's queue row SHALL transition the star icon to filled on the next favorites broadcast, without B needing to refresh

### Requirement: Catalog modal row exposes edit / add / delete

Each favorite row in the catalog modal SHALL expose three icon buttons in this left-to-right order:

1. **Edit** (✏️ pencil glyph) — opens the Favorite Edit modal pre-populated with the row's current `displayTitle` / `authors` / `mode`. Saving sends `{type:"favorite.update", source, videoId, page, displayTitle?, authors?, mode?}`.
2. **Add to queue** (`+`) — sends `{type:"queue.add", ref:{source, videoId, page?}}`. SHALL NOT close the catalog modal so users can queue several songs in a row.
3. **Delete** (🗑 trash glyph) — invokes `window.confirm` with the song's display title (or raw title); on confirm, sends `{type:"favorite.remove", source, videoId, page}`. SHALL NOT close the catalog modal.

The legacy single "+ 加入" button text SHALL NOT be rendered.

#### Scenario: Default catalog row layout

- **WHEN** the catalog modal renders any favorite row
- **THEN** the action area SHALL contain three icon buttons in the order edit, add, delete (no text-label "+ 加入" button)

#### Scenario: Edit a favorite

- **WHEN** the user clicks ✏️ on a catalog row, changes `displayTitle` and `mode`, then Save
- **THEN** the client SHALL send `{type:"favorite.update", source, videoId, page, displayTitle:"...", mode:"..."}` (the unchanged `authors` field SHALL NOT appear in the message); the modal SHALL close on a successful broadcast and the catalog row SHALL re-render with the updated structured title (or fall through to the raw title if not all three fields are now set)

#### Scenario: Delete a favorite

- **WHEN** the user clicks 🗑 on a catalog row and confirms
- **THEN** the client SHALL send `{type:"favorite.remove", source, videoId, page}`; on the resulting `favorites` snapshot the row SHALL disappear from the catalog modal; the modal itself SHALL stay open

#### Scenario: Cancel delete confirm dialog

- **WHEN** the user clicks 🗑 and clicks "Cancel" in the confirm dialog
- **THEN** no `favorite.remove` SHALL be sent
