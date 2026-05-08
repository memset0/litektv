# litektv

## Git commit conventions

Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/) style. Use the type prefix `<type>: <subject>`, where common types are:

- `feat`: a new feature
- `fix`: a bug fix
- `docs`: documentation only
- `style`: formatting / whitespace (no code change)
- `refactor`: code change that neither fixes a bug nor adds a feature
- `perf`: performance improvement
- `test`: adding or updating tests
- `build`: build system or dependency changes
- `ci`: CI configuration changes
- `chore`: other maintenance (no src or test change)
- `revert`: reverts a prior commit

**Recommended format:** `<type>(<scope>): <subject>` — scope SHOULD be included whenever a sensible one exists (subsystem, package, or area name). Example: `feat(player): add waveform preview`, `fix(backend): handle b23.tv redirects`. Bare `feat: ...` is allowed only when no meaningful scope applies.

Subject line: imperative mood, lowercase, no trailing period, ≤ 72 chars. Use the body for the *why*, not the *what*.

## Git author identity

All commits in this repo MUST be authored AND committed by:

```
memset0 <memset0@outlook.com>
```

Co-author lines for AI assistants are welcome (e.g. `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` in the trailer), but the primary author/committer is always memset0. When committing programmatically, set both `GIT_AUTHOR_*` and `GIT_COMMITTER_*` env vars (or local `user.name` / `user.email`) accordingly.

## Auto commit + push workflow

Whenever a new feature is implemented or a bug is fixed, commit it under a Conventional Commit message (per the section above) AND push immediately. Don't batch unrelated changes into a single commit; one commit per feature/fix.

After a successful `openspec archive <change>` (the rename to `openspec/changes/archive/<date>-<change>/` plus the merged spec update), automatically commit those moves AND `git push` — without waiting for the user to ask. Archive is the conclusion of a feature; the push is part of "feature complete".

When pushing, push ONLY the commits you made in this session. Concrete recipe:

1. List unpushed commits: `git log origin/master..HEAD --pretty='%h %an %s'`.
2. Verify every line is yours (author `memset0`, message YOU wrote, body matches the work YOU did this session).
3. If anything in that list isn't yours, a parallel agent has unpushed work locally — DO NOT `git push origin master`. Instead, push only your specific commit: `git push origin <your-sha>:master`. If their commit is an ancestor of yours, that still pushes theirs too — in that case stop and tell the user before doing anything destructive.
4. Otherwise, plain `git push origin master` is fine.

## Stage only your own changes

Only stage files YOU modified in the current task. Never use `git add -A` or `git add .` blindly — multiple Claude Code instances (or the user themselves) may be editing this repo at the same time, and unrelated in-progress work (e.g. an OpenSpec change proposal still being authored in another window) must NOT get swept into your commit. Stage files explicitly by path.

After staging and BEFORE `git commit`, run `git diff --cached --stat` and confirm every file in the staged set corresponds to an edit you actually made. The index may already contain stale deletions or modifications left over from a concurrent session — staging by explicit path does NOT prevent those from riding along.

## Restart the systemd unit after backend changes

The deployed backend runs as `litektv.service` on this same box (Caddy → 127.0.0.1:38117). The unit serves the **compiled** `packages/backend/dist/index.js` plus the static frontend files on disk, so:

- After ANY backend code change (`packages/backend/src/**`), you MUST run `pnpm --dir packages/backend build` and then `systemctl restart litektv.service` so the new bytecode is actually live. Without the restart, the user is still hitting the old backend regardless of what you committed.
- After ANY frontend change (`packages/frontend/**`), the file on disk is what's served, so a hard browser reload (Cmd-Shift-R) is enough — no restart needed. But if you also touched the backend in the same session, restart anyway.
- After a schema change in `db.ts` or new fields in WS messages, the restart is load-bearing — `initDb()` only runs `CREATE TABLE IF NOT EXISTS` on boot, and an old running process won't pick up new tables / new schema branches until it restarts.

This applies to every code agent working on this repo — Claude Code, agents spawned via `Agent`, parallel Claude instances, etc. If you're not sure whether the unit is running or which version it's running, `systemctl status litektv.service` shows the pid and start time. Confirm the start time is **after** your last `pnpm build`.

If the user reports a feature you just shipped "not working" and you can't reproduce it locally, before digging in: check `systemctl status litektv.service` for an old `Active: ... since` timestamp. A stale unit is the single most common cause of "I deployed it but the user still sees the old behaviour".
