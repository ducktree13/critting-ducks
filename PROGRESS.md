# Build progress

One checkbox per build phase. Work top to bottom — the game is playable at the end of every phase. Check a phase off only after its *playable check* passes and `npm run test` + `npm run build` are clean, then commit and push.

## v2 expansion (spec: [PLAN2.md](PLAN2.md))

- [x] **V2-0 — Design doc & save v2**: PLAN2.md, PROGRESS reset, CLAUDE.md pointer, save `version: 2` + migration ladder.
  *Playable check: game runs unchanged; a v1 save loads with all progress intact.*
- [x] **V2-1 — Economy core**: 7 rarities, pack tiers (5/25/100) with guarantees + pack crits + level gates, slowed progression curve, rescaled node costs, Voidstone/Aurorium defs, ore level gates, level-up rewards, shard cap + Shard Points. Pacing audit. Tests.
  *Playable check: first pack ≈10 min of expected income; pack crit grants a bonus pack; ores respect level gates.*
- [x] **V2-2 — UX layer**: shared hover tooltips (nodes, ducks, pips, veins, packs), panel minimize/expand, favorite toggle, duck inventory menu.
  *Playable check: hover anything meaningful and learn what it does; minimize mine → tree+arena widen.*
- [ ] **V2-3 — Tutorial + missions/achievements**: frameworks + pinned mission per section + 5-minute tutorial chain ending in a guaranteed-rare pack + locked-duck hooks.
  *Playable check: fresh save completes the tutorial in ≤5 min and holds a rare+ duck.*
- [ ] **V2-4 — Duck expansion**: duckgen to ~160 ducks, personality traits, Bill-only start, level-gated pools. Tests.
  *Playable check: collection shows ~160 entries; traits visibly change stats; new game starts with just Bill.*
- [ ] **V2-5 — Gear & crafting**: enemy materials, equipment drops with rarities, crafting menu, 3 equip slots, selling. Tests.
  *Playable check: kill enemies → materials/gear; craft an item; equip it; duck card reflects stats.*
- [ ] **V2-6 — Shard shop + ascension**: 12h rotating SP shop, ascension milestones. Tests.
  *Playable check: overflow shards become SP; shop restocks on the 12h boundary; ascend a maxed duck.*
- [ ] **V2-7 — Chapter system**: Act-2 transition (tree felled → 4 saplings), authored Mining/Combat/Crit/Passive trees, growth scaling, rotate/overview modes, falling clickable leaves + Duck Tree. Tests.
  *Playable check: completing Act 1 fells the tree; saplings grow; a clicked leaf pays out (and can crit).*
- [ ] **V2-8 — Pond**: pond beneath the trees, swim roster, passive income + offline integration.
  *Playable check: rostered ducks swim and generate trickle income, including while away.*
- [ ] **V2-9 — Expeditions**: 1h/8h/24h journeys on real timestamps, fail chance by level, journey crits. Tests.
  *Playable check: send a journey, close the game past its timer, return to rewards (or a failure).*
- [ ] **V2-10 — Visual overhaul**: mine cave scene with walking ducks, colosseum arena, expanded-mode scenes.
  *Playable check: ducks walk in/out of the cave dropping ore; expanding the arena reveals the colosseum.*
- [ ] **V2-11 — Steam prep**: Tauri shell, file-backed StorageLike, Steam Cloud documentation.
  *Playable check: desktop build runs with file saves; web build unaffected.*

## v1 (complete — spec: [PLAN.md](PLAN.md))

- [x] Phase –1 Handoff · [x] Phase 0 Skeleton · [x] Phase 1 Mine+HUD · [x] Phase 2 Streak · [x] Phase 3 Skill tree · [x] Phase 4 Shop/gacha/rosters · [x] Phase 5 Arena · [x] Phase 6 Offline+polish
