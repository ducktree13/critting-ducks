# Critting Ducks 2 — Expansion Design & Build Plan

Successor to [PLAN.md](PLAN.md) (v1, complete). This document is the source of truth for the v2 expansion: mechanics, numbers, architecture, and phase order. Track completion in [PROGRESS.md](PROGRESS.md). All v1 hard rules stay in force: `src/game/` never touches the DOM, every tunable number lives in `src/game/balance.ts`, RNG is injectable, saves migrate forward and never wipe.

**The expansion in one paragraph:** the economy slows to a real idle curve with seven rarities and tiered packs that can *crit*. Ducks grow to ~160 with personality traits, gear, favorites, and ascension. Filling the first skill tree ends Act 1: the tree is felled and four saplings — Mining, Combat, Crit, Passive — grow in its place above a duck pond. Missions, achievements, a 5-minute tutorial, expeditions on real-world timers, a rotating shard shop, crafting, clickable falling leaves, and a full visual overhaul (mine cave, colosseum arena, panel minimize/expand) round out the game — aimed at an eventual Steam release.

## 1. Pacing targets (the yardstick for every number)

- Tutorial completes in ≤ 5 minutes.
- First rare-or-better duck at ~20 minutes (tutorial chain ends with a guaranteed-rare pack).
- Act 1 (all 30 first-tree nodes) takes 6–8 hours of active play.
- Act 2+ progression slows on a curve; "endgame" (divine ducks, aurorium, tree completion) lands at 1–2 months.
- Numbers stay small: early hits pay fractions of a gold; a dedicated first day ends in the low thousands.
- Every constant lives in `balance.ts`; a **pacing audit** (expected-income simulation) runs whenever the curve changes.

## 2. Rarities & gacha

**Seven tiers:** common, uncommon, rare, epic, legendary, **mythic**, **divine**.

| | common | uncommon | rare | epic | legendary | mythic | divine |
|---|---|---|---|---|---|---|---|
| Pack odds | 55% | 27% | 12% | 4.5% | 1.2% | 0.25% | 0.05% |
| Dupe shards | 1 | 2 | 3 | 5 | 10 | 25 | 60 |
| Ring color | gray | green | blue | purple | gold | crimson | white-iridescent |

**Packs** (no bulk discounts — bigger packs cost exactly N× and buy convenience + guarantees):

| Pack | Price | Rolls | Guarantee | Available |
|---|---|---|---|---|
| Standard | 150 | 1 | — | always |
| Five-Pack | 750 | 5 | ≥1 uncommon+ | always |
| 25-Pack | 3,750 | 25 | ≥1 rare+ | always |
| 100-Pack | 15,000 | 100 | ≥1 epic+ | player level 20 |

Guarantee rule: if no roll in the pack met the bar naturally, the final roll's rarity is bumped to the guaranteed tier.

**Pack crits:** every pack purchase rolls `stats.critChance`. A crit grants a **free bonus pack of the same type** (opened immediately, appended to the reveal). Bonus packs roll crits too; max 3 bonus packs per purchase. During T100 QUACKENING packs are free as before.

**Duck pool gating:** each duck def may carry `minPlayerLevel` (it cannot drop below that player level; rolls re-pick within the rarity) and/or `lockedBy: { kind: "mission" | "achievement" | "leaf" | "shop", id }` — locked ducks never drop from packs. Rarity pools must always retain ≥1 unlocked duck at level 1.

## 3. Economy rebalance

**Mine:** formula unchanged, constants cut. `orePerHit` base **0.1**. Duck mining power rescaled to ~1/10 of v1 (Bill 0.1). Bill on copper ≈ **0.26 gold/sec** expected — first pack ~10 min with level-up rewards.

**Ore table** (values per ore; unlock node + player-level gate):

| Ore | Gold/ore | Node | Player level |
|---|---|---|---|
| Copper | 1 | start | 1 |
| Silver | 3 | Silver Vein | 5 |
| Crystal | 8 | Crystal Cavern | 12 |
| Starmetal | 20 | Starmetal Seam | 20 |
| **Voidstone** | **60** | **Void Fissure** (Act 2 mining tree) | **30** |
| **Aurorium** | **150** | **Aurorium Heart** (Act 2 mining tree) | **40** |

**XP:** mine hit 1 XP, arena hit 2 XP (unchanged); `xpToNext(level) = 100 * 1.6^(level-1)` (L5 ≈ 5 min, L14 ≈ 4–5 h, L20 ≈ a day+, L30/L40 deep Act-2). Level gates: crit5 at L14 remains the deepest Act-1 gate.

**Act-1 node costs** rescaled to sum ≈ 68K gold (~6–8h of the new income curve). Same 30 nodes, same effects (flat adds rescaled with the stat cut: ore1 +0.1, ore2 +0.2, atk1 +1, def1 +1; multipliers unchanged):

- Trunk: crit1 30, speed1 60, crit2 150
- Left: ore1 50, ore2 200, mineslot2 350, oresilver 550, minespeed 2000, ore3 1000, offline1 1600, orecrystal 2600, mineslot3 3800, offline2 6000, orestar 9000
- Right: atk1 50, def1 100, arenaslot2 350, atk2 400, atkspeed1 800, def2 1300, atk3 3200, arenaslot3 3800
- Crown: critdmg1 250, xp1 900, crit3 650, critdmg2 1600, crit4 3200, critdmg3 5000, crit5 12000, streak1 7500

**Arena:** enemy HP `24 * 1.16^(w-1)`, attack `2.5 * 1.13^(w-1)`, speed 0.8/s. Victory gold `2 * 1.12^(w-1)`, XP `5 * 1.10^(w-1)`. Boss (every 10th): 3× HP, 2× rewards, guaranteed shard, 25% equipment drop. Duck attack damage values rescaled ~1/2 of v1 so waves wall appropriately.

**Level-up rewards:** every level: `gold += 20 * level`. Every 5th level: +1 Standard Pack (auto-opened banner or claim button in HUD). L10/L20/L30/L40: +1 Five-Pack instead.

## 4. Ducks v2 (~160 total)

**Starter: Bill only.** Quackers is an early tutorial-mission reward instead.

**Roster distribution:** common 40, uncommon 35, rare 30, epic 25, legendary 15, mythic 10, divine 5 = **160**.

**Data-driven generation:** duck defs live in generated data (`duckgen.ts` builds the table at module load from a seed spec). Parametric SVG art: palette (12 body colors) × pattern (plain/spotted/striped/gradient) × accessory (~20: hats, tools, weapons, glasses…) × size jitter. Legendary+ ducks are hand-curated (unique names, art params, passives). Stat budgets per rarity keep power monotonic; roles miner/fighter/hybrid/**swimmer** (pond specialist, V2-8).

**Personality traits (item 19):** each duck def carries one trait; folded into that duck's own effective stats:

| Trait | Effect |
|---|---|
| Brave | +10% attack damage |
| Cowardly | −10% attack damage, +15% mine speed |
| Intelligent | +15% XP from its hits |
| Efficient | +10% mining power |
| Greedy | +10% gold from its mine hits, −5% XP |
| Lazy | −10% attack speed, +20% offline/pond contribution |
| Lucky | +3% crit chance |
| Loyal | +5% to team HP while rostered (arena) |
| Energetic | +10% attack speed, −5% damage |
| Stoic | +15% defense |
| Curious | +10% expedition success chance |
| Radiant | +5% all its own stats (legendary+ only) |

**Favorites (item 23):** heart toggle on every duck card/picker row; favorites sort first, protected from future bulk actions.

**Ascension (item 29):** requires max level (see §5 cap) + an ascension cost in shards (2× that duck's dupe-shard value × 10). Grants +25% to the duck's base stats per ascension (max 3), a star pip on its art, and resets level to 1 (keeping the multiplier) — classic prestige loop.

**Locked ducks (item 9):** `lockedBy` hooks ship in V2-4; actual mission/achievement content that unlocks specific ducks arrives with V2-3+ content passes. "Duck Tree" (leaf-exclusive, §9) ships in V2-7.

## 5. Shards, Shard Points, Shard Shop

- Per-duck shard cap raised to **200**. Overflow converts 1:1 into **Shard Points (SP)**, a global currency shown in the shop.
- Duck level cap stays 10 per ascension tier; upgrade cost still `level` shards.
- **Shard Shop (item 25):** 4 slots, restocks every **12 real-time hours** (slot contents are a deterministic function of `floor(now / 12h)` + save seed, so no server needed). Sells specific ducks at SP prices by rarity: 50 / 100 / 200 / 400 / 800 / 2,000 / 5,000. Divine slots appear only for player level 35+.

## 6. Gear & crafting

**Materials** drop from arena kills (100% on boss, 35% otherwise), themed per enemy family: Slime Goo, Goose Feather, Golem Crumb, Shark Tooth, Pondlord Relic (boss).

**Equipment:** three slots per duck — Weapon (+atk / +atk%), Armor (+def / +hp%), Charm (+crit chance / +gold%). Seven rarities; stat budget scales with rarity. Drops: 3% per kill (25% boss), themed to the enemy. Sell for gold (by rarity: 5 / 15 / 40 / 100 / 250 / 600 / 1,500).

**Crafting (item 28):** crafting menu combines ore (spends mined ore totals, giving ore counters a sink) + materials into deterministic recipes; higher recipes unlock by player level. Crafted gear rolls rarity weighted by recipe tier.

`computeStats`/duck-stat math folds equipped gear per duck (own-hit stats) the same way traits fold.

## 7. Duck inventory menu (item 24)

HUD button → full-screen menu: grid/list of owned ducks with sort (rarity, role, level, favorite) and filters; click → **duck card**: art, rarity ring, trait, stats (with gear contributions), equipment slots (equip/unequip from gear inventory), shard progress bar, upgrade/ascend buttons, favorite toggle, roster shortcuts.

## 8. Missions, achievements, tutorial

- **Achievements:** lifetime thresholds (crits landed, gold earned, waves, packs, ducks collected, trees filled…). One-time rewards (gold, SP, packs, specific duck unlocks).
- **Missions:** rotating short-term goals per section (mine / tree / arena / pond / expedition), e.g. "mine 500 silver", "clear wave 25", "land a 15-streak". Rewards scale with tier. **One mission pinnable per section** (item 11) — pinned missions render as a compact tracker inside that panel.
- **Tutorial (item 1):** scripted mission chain with a dimmed-backdrop pointer highlighting the target element: mine a duck → buy crit1 → open the streak tooltip → buy a Standard Pack (granted gold) → roster the new duck → win an arena wave → claim finale reward: one **guaranteed-rare pack** + Quackers. Skippable at any step; total ≤5 minutes.

## 9. Chapters & the four trees

**Act 2 trigger (item 7):** owning all 30 Act-1 nodes. A felling animation plays; the old tree becomes a stump; four **saplings** are planted: **Mining, Combat, Crit, Passive** — each its own node tree (~22–26 nodes each, authored in phase V2-7; costs continue the curve, gold sinks 50K → 5M across a month+).

**Growth & views (item 12):** each tree's rendered size scales with its owned-node count and player level — Act 1's tree retrospectively looks tiny against a grown Act-2 tree. Middle panel gets a tree switcher (rotate ◀ ▶) plus an **overview mode** showing all four (automatically used when mine + arena panels are both minimized). The pond stays visible beneath in all modes.

**Falling leaves (item 16):** every 3–6 minutes a leaf detaches and drifts down; clicking it grants gold or XP (scaled to current income, can **crit** at `stats.critChance` for 5×) or — 0.5% — the exclusive rare duck **"Duck Tree"** (leaf-only, `lockedBy: leaf`). Unclicked leaves fade after 30s.

## 10. Pond (item 8)

Rendered beneath the trees in the middle panel. Own roster (2 slots, +2 via Passive-tree nodes); rostered ducks visibly swim (bobbing path animation). Generates trickle income offline-style each tick: gold + occasional materials + slow XP, scaled by ducks' `passivePower` (new stat; swimmers excel) and Lazy trait bonus. Pond income participates in the offline calculation.

## 11. Expeditions (items 17, 18)

Expedition panel (HUD button or arena sub-tab): assemble a roster (ducks unavailable to other rosters while away) and choose a Journey: **1h (small)** / **8h (large)** / **24h (very large)** rewards — gold, materials, shards, small pack chance; scaled by duck power. Uses real timestamps (`endsAt` ms), so journeys complete while the game is closed. **Fail chance** `clamp(0.35 − 0.03 × avgDuckLevel − trait bonuses, 5%, 60%)`; failure pays 20% and no rare drops. On success, roll team crit chance: **crit journey = 2× rewards** (item 18).

## 12. Layout & visual overhaul

- **Minimize/expand (item 2):** each panel header gets a −/+ control; minimized panels collapse to a slim vertical rail (title + key stat ticker) and the CSS grid re-flows so remaining panels widen. State persists in settings.
- **Mine cave (item 21):** cave mouth SVG scene; rostered duck sprites walk a loop path into the cave, emerge with an ore pip, deposit it on a stockpile (pip flies to the HUD gold counter). Hit/crit floaters anchor to the depositing duck.
- **Colosseum (item 22):** arena panel becomes a colosseum: tiered stands, sandy floor, fighters vs enemy center-stage. Expanded (others minimized) = full scene with richer animation; otherwise a compact version runs.
- All plain DOM/SVG + CSS animation. No canvas, no framework.

## 13. Tooltips (item 3)

Shared `ui/tooltip.ts`: `attachTooltip(el, () => html)` on hover/focus with smart positioning. Applied to: skill nodes (name, effect, cost, level req — replaces click-tooltip; click becomes buy-confirm), every duck rendering (stats, trait, gear summary), streak tier pips (tier reward + remaining time), ore vein buttons, pack buttons (odds table), equipment icons.

## 14. Saves & Steam path (item 14)

- Save schema bumps to `version: 2`; `migrate()` ladder chains v1 → v2 (v1 saves keep all progress; new fields default). Never wipe.
- Storage stays behind `StorageLike`. For Steam: wrap the built site in a **Tauri** shell where `StorageLike` is backed by a save file in the OS app-data dir; enable **Steam Cloud** on that file — per-user saves handled by Steam, no accounts/server. V2-11 delivers the shell + docs; the web build is unaffected.

## 15. File layout additions

```
src/game/  packs.ts (replaces shop.ts), traits.ts, duckgen.ts, gear.ts,
           missions.ts, achievements.ts, chapters.ts, pond.ts,
           expeditions.ts, shardshop.ts  (+ colocated *.test.ts)
src/ui/    tooltip.ts, layout.ts, inventoryMenu.ts, craftingMenu.ts,
           missionsPanel.ts, tutorial.ts, pondPanel.ts, expeditionPanel.ts
```

Reused: `events.ts` bus, `RateTracker`, `duckSvg` (extended by duckgen), `computeStats` folding, save `migrate()` ladder, `Rng` test fakes.

## 16. Phases (each playable; check off in PROGRESS.md; commit + push)

- **V2-0 Design doc & save v2**: this file; PROGRESS reset; CLAUDE.md pointer; save `version: 2` + migration + v1-fixture test.
- **V2-1 Economy core**: rarity tiers, pack tiers/crits/gates, slowed curve, node costs, voidstone/aurorium defs + ore level gates, level-up rewards, shard cap + SP. Pacing audit. Tests.
- **V2-2 UX layer**: tooltip utility everywhere, minimize/expand, favorites, inventory menu.
- **V2-3 Tutorial + missions/achievements**: frameworks, pinned missions, tutorial chain, locked-duck hooks.
- **V2-4 Duck expansion**: duckgen to ~160, traits, Bill-only start, level-gated pool. Tests.
- **V2-5 Gear & crafting**: materials, drops, crafting menu, equip slots, selling. Tests.
- **V2-6 Shard shop + ascension**: 12h rotation, SP spending, ascension. Tests.
- **V2-7 Chapter system**: Act-2 transition, four authored trees, growth/views, falling leaves + Duck Tree. Tests.
- **V2-8 Pond**: pond roster/income, swimmers, offline integration.
- **V2-9 Expeditions**: journeys, fail/crit, real-time completion. Tests.
- **V2-10 Visual overhaul**: cave mine, colosseum, expanded-mode scenes.
- **V2-11 Steam prep**: Tauri shell, file StorageLike, Steam Cloud docs.

## 17. Verification

Per phase: `npm run test` and `npm run build` clean; dev-server playable check of that phase's feature; v1-save migration must keep loading throughout. After V2-1 (and any later balance change): run the pacing audit — derive expected gold/hr at 0h/2h/4h/8h marks and check §1 targets before committing. Push → auto-deploy.
