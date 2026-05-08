## 1. Drop the "(you)" suffix

- [ ] 1.1 In `packages/frontend/app.jsx` `UsersStrip`, change `{u.name}{id === meId ? " (you)" : ""}` to just `{u.name}`

## 2. Verify

- [ ] 2.1 Open the app — your chip in the ONLINE strip shows just `<emoji> <name>` in pink, with no `(you)` suffix
- [ ] 2.2 Open the app in a second browser as a different user — your own chip there is the pink one (no suffix), the other user's chip is the unstyled one
- [ ] 2.3 Confirm sort order unchanged (current user floats to the front)