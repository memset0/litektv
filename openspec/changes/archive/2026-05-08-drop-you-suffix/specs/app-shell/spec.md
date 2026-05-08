## ADDED Requirements

### Requirement: ONLINE users strip omits the "(you)" self-label

In the ONLINE users strip on the player column, the chip representing the current user SHALL render only the user's name (and emoji), with NO appended `" (you)"` / `" / me"` / similar text marker. The chip's distinct styling (`.user-chip.is-me` — pink background, pink border, pink text) is already enough to mark "self"; an extra text suffix duplicates the signal and clutters narrow viewports.

Same general principle as the existing "Trim labels in topbar chips" requirement: where dedicated styling already disambiguates, the chip SHALL NOT carry redundant text.

#### Scenario: Self chip in the ONLINE strip

- **WHEN** the current user is in the ONLINE users strip
- **THEN** their chip SHALL display only `<emoji> <name>` (e.g. `🎤 Stardust`), with the `is-me` pink styling, AND SHALL NOT include the substring `(you)`
