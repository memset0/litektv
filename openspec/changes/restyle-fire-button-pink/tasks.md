## 1. Restyle the FIRE button

- [x] 1.1 Update `.dm-send` background gradient in `packages/frontend/ktv.css` from `var(--neon-cyan), var(--neon-purple)` to `var(--neon-pink), var(--neon-purple)`
- [x] 1.2 Update `.dm-send` resting `box-shadow` to the pink stack: `0 0 0 1px rgba(255,46,166,0.4), 0 0 18px rgba(255,46,166,0.3)`
- [x] 1.3 Update `.dm-send:hover` `box-shadow` to the stronger pink stack: `0 0 0 1px rgba(255,46,166,0.6), 0 0 26px rgba(255,46,166,0.55)`

## 2. Verify visually

- [x] 2.1 Reload `https://ktv.dev.mem.ac/<slug>` and confirm the FIRE button matches the QUEUE button at rest and on hover
- [x] 2.2 Confirm no other element regressed — non-primary cyan affordances (room badge, shuffle icon, QR ring) still render in cyan
