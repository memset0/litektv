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

## Stage only your own changes

Only stage files YOU modified in the current task. Never use `git add -A` or `git add .` blindly — multiple Claude Code instances (or the user themselves) may be editing this repo at the same time, and unrelated in-progress work (e.g. an OpenSpec change proposal still being authored in another window) must NOT get swept into your commit. Stage files explicitly by path.
