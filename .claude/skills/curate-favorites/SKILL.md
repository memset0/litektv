---
name: curate-favorites
description: Review the user's favorites in the litektv SQLite DB and use the audit-logged CLI tools to set each row's display_title / authors / mode. Use when the user says "新加了几首歌，帮我整理一下收藏里的元数据" or similar — they want curated structured titles for the catalog.
license: MIT
---

# Curate favorites — workflow + heuristics

The litektv backend stores every favorited song in a single SQLite
table at `/root/yulun/litektv/backend/data/litektv.db`. Each row has an
imported title plus three operator-curated columns (`display_title`,
`authors`, `mode`) that drive the catalog's structured rendering. This
skill walks through how to:

1. Discover which rows still need curating.
2. Run the auto-scanner (high-precision but conservative).
3. Manually finish the long tail by judgment, one row per CLI call.
4. Verify everything is audit-logged.

Every write uses the audit-logged path so the user can roll back via
`rollbackFavorites.ts` if anything goes wrong.

## When to invoke this skill

The user mentions any of:

- "新收藏了几首歌，帮我整理一下"
- "把新加进来的歌的曲名 / 作者 / 伴奏标记一下"
- "扫一下收藏夹看看哪些还没设元数据"
- "帮我用 cli 给这首歌设一下元数据"

## What "curated" looks like

The frontend renders favorited songs as:

| `mode` | output |
|---|---|
| `"instr"` / null / undefined | `<authors> - <displayTitle>` (no suffix; 伴奏 is the implicit default for KTV) |
| `"vocal"` | `<authors> - <displayTitle>（原唱）` |

Both `displayTitle` and at least one entry in `authors` MUST be set
for the structured form to render at all. Multiple authors join with
`, ` (Chinese-friendly comma + space).

## Tools at your disposal

All three live under `packages/backend/src/`. They MUST be invoked
with `DB_PATH` pointing at the live DB; the systemd service runs with
the same env var.

```bash
DB="/root/yulun/litektv/backend/data/litektv.db"
PKG="/root/yulun/litektv/packages/backend"

# 1. Auto-scanner (high precision, conservative)
DB_PATH=$DB pnpm --dir $PKG tsx src/autoMetaScan.ts            # dry-run
DB_PATH=$DB pnpm --dir $PKG tsx src/autoMetaScan.ts --apply

# 2. Manual setter (one row at a time)
DB_PATH=$DB pnpm --dir $PKG tsx src/setFavoriteMeta.ts \
    <source> <videoId> <page> \
    --display-title "曲名" \
    --authors "作者A, 作者B" \
    --mode instr|vocal|none \
    --actor cli-manual-curate \
    --apply
```

Key conventions:

- `<source>` is `yt` or `bili`. `<page>` is `0` for YouTube and for
  Bilibili rows without an explicit `?p=`; otherwise the page index.
- `--mode none` clears the column. Omitting `--mode` leaves it
  unchanged.
- `--display-title ""` and `--authors ""` clear those columns.
- `--actor` labels the audit row's `user_name`. Use
  `cli-manual-curate` when the metadata came from your judgment
  (artist recognition), not from a deterministic title parse. The
  auto-scanner uses `cli-auto-meta-scan` automatically.
- Default is dry-run; `--apply` is required to commit.

When dist/ is built, you can invoke `node dist/setFavoriteMeta.js …`
directly which is faster than `tsx`.

## Step-by-step playbook

### 0. Read the current state

```bash
cd /root/yulun/litektv/packages/backend
node -e '
const Database = require("better-sqlite3");
const db = new Database("/root/yulun/litektv/backend/data/litektv.db", { readonly: true });
const all = db.prepare("SELECT source, video_id, page, title, display_title, authors, mode FROM favorites ORDER BY added_at").all();
console.log("Total favorites:", all.length);
const curated = all.filter(r => r.display_title && r.authors);
console.log("Already curated (display_title + authors):", curated.length);
console.log("Need work:", all.length - curated.length);
console.log("");
const todo = all.filter(r => !r.display_title || !r.authors);
todo.forEach(r => console.log(`  ${r.source} ${r.video_id} p${r.page}  ::  ${r.title}`));
'
```

### 1. Run the auto-scanner first (dry-run)

```bash
DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
  pnpm --dir packages/backend tsx src/autoMetaScan.ts
```

This handles the easy cases (ARTIST-SONG with paren tail, page-suffix
underscore patterns, 《SONG》 with surrounding artist names). Read the
"proposed updates" list and confirm each one is correct before apply.

If anything looks wrong, **don't apply**. Skip to step 3 and handle
those rows manually.

If everything looks correct, apply:

```bash
DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
  pnpm --dir packages/backend tsx src/autoMetaScan.ts --apply
```

The scanner skips any row whose manual fields are already non-NULL,
so previous curation is never overwritten.

### 2. Triage the "unsure, skipping" rows

The dry-run output groups rows the scanner refused to touch under
`# rows the scanner could NOT confidently parse`. These are your
manual-curation queue.

For each row, look at the imported title and decide:

- **Is the song name discoverable?** Look for 《SONG》, leading
  brackets `【…】`, or recognisable Chinese / English title text.
- **Is the artist discoverable?** Heuristics:
  - 中文歌手通常 2–3 字 (e.g. 许嵩, 陶喆, 赵雷, F.I.R.).
  - Vocaloid 角色 (洛天依, 乐正绫) are credited as performers; the
    producer (ilem, Sodatune, 花儿不哭) is also a co-author.
  - 卡拉OK 上传者的频道名 NOT an author; it's the uploader.
- **Mode**:
  - 伴奏 / off vocal / off_vocal / inst (Ver) / 无原声 / 无人声 / 主旋律伴奏 / 卡拉OK / 纯K → `instr`
  - 原唱 / on vocal / on_vocal / 原版 / 原创曲 (PV with vocals) → `vocal`
  - If the title says nothing, default to `instr` (most KTV uploads).

### 3. Run setFavoriteMeta for each row

Use your judgment about artist names — most Chinese KTV titles use
the form `ARTIST-SONG` but a non-trivial minority use `SONG-ARTIST`.
You're a human(-ish) reader, you can recognise `许嵩`, `陶喆`, `张紫豪`,
`F.I.R.` etc. as artists; trust that recognition over the literal
left/right position of the dash.

```bash
DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
  node /root/yulun/litektv/packages/backend/dist/setFavoriteMeta.js \
  bili BV1y2q6YWEGp 1 \
  --display-title "小镇姑娘" \
  --authors "陶喆" \
  --mode instr \
  --actor cli-manual-curate \
  --apply
```

Important: drop authors you're NOT sure about. **Do NOT make up
artist names.** If you genuinely don't know, leave the row untouched
— a partial set is no better than an unset row (the structured form
won't render unless authors is non-empty), and a wrong artist is
worse than a missing one. The user can fill it in later.

### 4. Verify

After the batch:

```bash
node -e '
const Database = require("better-sqlite3");
const db = new Database("/root/yulun/litektv/backend/data/litektv.db", { readonly: true });
const total = db.prepare("SELECT count(*) AS n FROM favorites").get().n;
const curated = db.prepare("SELECT count(*) AS n FROM favorites WHERE display_title IS NOT NULL AND authors IS NOT NULL").get().n;
console.log("favorites:", total, "  curated:", curated, "  pending:", total - curated);
console.log("audit rows by op:", db.prepare("SELECT op, count(*) AS n FROM favorite_audit GROUP BY op").all());
'
```

Frontend redeploy is NOT needed — the favorites snapshot is broadcast
on every favorite mutation (each successful `setFavoriteMeta --apply`
sends one), so any open browser tab picks up the new structured
titles within milliseconds.

## Recovering from mistakes

Every successful `setFavoriteMeta --apply` AND every successful
`autoMetaScan --apply` writes one row to `favorite_audit` with the
full before/after JSON. To undo a bad run:

```bash
# dry-run rollback to a timestamp before the bad run
DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
  pnpm --dir packages/backend tsx src/rollbackFavorites.ts \
  2026-05-08T22:50:00Z

# commit if the diff looks right
DB_PATH=/root/yulun/litektv/backend/data/litektv.db \
  pnpm --dir packages/backend tsx src/rollbackFavorites.ts \
  2026-05-08T22:50:00Z --apply
```

## Things to refuse

- Do NOT touch `favorites` rows whose `display_title` and `authors`
  are already populated — those are operator-curated and the auto
  path explicitly skips them. If the user asks to *re-curate* a
  specific row, ALWAYS confirm explicitly before overwriting.
- Do NOT bypass the audit log by writing raw SQL. Every change
  MUST go through `setFavoriteMeta` (or `autoMetaScan`) so the
  rollback CLI keeps working.
- Do NOT expose any of these tools through HTTP / WebSocket / the
  frontend. Curation is a local-shell operation.

## After-action

Per repo conventions (see CLAUDE.md):

- This skill performs **DB writes only** — there is usually nothing
  to commit at the end of a curation pass.
- If you wrote new code (new heuristic, new helper) during the pass,
  follow the auto-commit-per-feature rule: stage explicit paths,
  `git diff --cached --stat` to verify, commit with the
  Conventional Commit style + `memset0 <memset0@outlook.com>`
  identity, push.
