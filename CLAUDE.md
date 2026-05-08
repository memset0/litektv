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
