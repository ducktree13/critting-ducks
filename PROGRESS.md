# Build progress

One checkbox per build phase (full details in [PLAN.md](PLAN.md) §13). Work top to bottom — the game is playable at the end of every phase. Check a phase off only after its *playable check* passes and `npm run test` + `npm run build` are clean.

- [x] **Phase –1 — Handoff package**: repo scaffolding (Vite + TypeScript), docs, GitHub Pages deploy pipeline, placeholder page live.
- [ ] **Phase 0 — Skeleton**: `types.ts`, `balance.ts`, `rng.ts`, `state.ts`, `events.ts`, `save.ts`, fixed-timestep loop in `main.ts`, 3-panel CSS grid with placeholder panels, autosave.
  *Playable check: three empty panels render; save survives reload.*
- [ ] **Phase 1 — Mine + HUD**: `ducks.ts` (definitions), `mine.ts`, `rates.ts`, `minePanel.ts`, `hud.ts`, `floaters.ts`, `duckArt.ts`. Bill mining copper.
  *Playable check: gold accumulates, floaters fly, gold/hr and xp/hr display.*
- [ ] **Phase 2 — Streak**: `streak.ts` + HUD streak widget + game-speed wiring + tier buffs in `computeStats`. Tests.
  *Playable check: crits chain, game speed visibly ramps, T10 buff pip works.*
- [ ] **Phase 3 — Skill tree**: `skilltree.ts` + `treePanel.ts` (SVG tree, leaf growth, purchase flow, level gating). Tests.
  *Playable check: buy crit/ore nodes, effects apply, tree grows leaves.*
- [ ] **Phase 4 — Shop, gacha, rosters**: `shop.ts`, `shopModal.ts`, roster pickers, duck levels/shards, slot nodes meaningful. Tests.
  *Playable check: buy packs, duplicates convert to shards, roster 2–3 miners.*
- [ ] **Phase 5 — Arena**: `arena.ts`, `arenaPanel.ts`, wave loop, rewards, boss shards, arena hits feeding the streak. Tests.
  *Playable check: full three-panel loop; the T50/T100 chase is live.*
- [ ] **Phase 6 — Offline + polish**: `offline.ts`, `welcomeBack.ts`, dark mode toggle, frame-gap guard, export/import/reset, T100 free-shop flourish, number formatting, balance touch-up.
  *Playable check: full manual verification list in PLAN.md §12; `npm run build` clean.*
