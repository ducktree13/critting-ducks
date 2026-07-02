# Critting Ducks — Game Design & Build Plan

A browser idle/incremental game about critical strikes, built with Vite + TypeScript, plain DOM + SVG (no framework). This document is the source of truth for the build: mechanics, numbers, architecture, and phase order. Track completion in [PROGRESS.md](PROGRESS.md); agent conventions are in [CLAUDE.md](CLAUDE.md).

**The game in one paragraph:** three panels on one screen. Left, a **mine** where rostered ducks generate passive income. Middle, a **skill tree** drawn as an actual tree that grows leaves as you buy nodes. Right, an **arena** where a duck team auto-battles enemy waves. Every duck attack — mining swing or arena hit — rolls for a critical strike, and **consecutive crits build a global streak** that speeds up the entire game, with checkpoint buffs at 10/25/50/100. Ducks are collected from gacha packs and specialize in mining or combat.

## 1. Project Scaffolding

*(Already present in this repo — kept for reference and so this plan works from an empty folder.)*

Scaffold manually (do NOT use `npm create vite` — it prompts interactively in a non-empty directory).

**Command:** `npm install -D vite typescript vitest`

**`package.json`:**

```json
{
  "name": "critting-ducks",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**`tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

**`vite.config.ts`:**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

**`.gitignore`:** `node_modules/`, `dist/`

**`index.html`** (project root): minimal shell with `<div id="app"></div>` and `<script type="module" src="/src/main.ts"></script>`. Title "Critting Ducks".

**Folder layout:**

```
src/
├── main.ts                 # bootstrap: load save, offline calc, start loop
├── style.css               # CSS grid layout, theme variables, animations
├── game/                   # PURE LOGIC — no DOM imports allowed
│   ├── types.ts            # all interfaces (GameState, DuckDef, SkillNode...)
│   ├── balance.ts          # every tunable number in one file
│   ├── rng.ts              # injectable RNG (Rng interface + mulberry32)
│   ├── state.ts            # createInitialState(), computeStats() (derived stats)
│   ├── ducks.ts            # 13 duck definitions, duck stat/level math
│   ├── skilltree.ts        # 27 node definitions, canBuy/buy logic
│   ├── streak.ts           # registerHitResult(), buff timers, gameSpeed()
│   ├── mine.ts             # tickMine(state, dt, rng)
│   ├── arena.ts            # tickArena(state, dt, rng)
│   ├── shop.ts             # gacha rolls, pack pricing, shard conversion
│   ├── offline.ts          # computeOfflineProgress(state, elapsedSec)
│   ├── save.ts             # serialize/deserialize/migrate, localStorage I/O
│   ├── rates.ts            # RateTracker (rolling gold/hr, xp/hr)
│   ├── events.ts           # tiny pub/sub bus (hit, crit, levelup, wave, buy)
│   └── *.test.ts           # vitest unit tests colocated
└── ui/                     # DOM/SVG rendering — reads state, calls game fns
    ├── hud.ts              # top bar: gold, xp/level, gold/hr, xp/hr, streak, theme toggle
    ├── minePanel.ts        # left panel
    ├── treePanel.ts        # middle panel: SVG tree + node interaction
    ├── arenaPanel.ts       # right panel
    ├── shopModal.ts        # gacha shop overlay
    ├── welcomeBack.ts      # offline summary modal
    ├── floaters.ts         # floating damage/crit numbers
    ├── duckArt.ts          # duckSvg(defId, size) -> SVG string
    └── theme.ts            # dark mode toggle wiring
```

**Hard rule:** nothing in `src/game/` may import from `src/ui/` or reference `document`/`window` (except `save.ts`, which touches `localStorage` behind an injectable guard so tests can pass a Map-backed fake). All game functions take `(state, dt, rng)` and mutate state; UI subscribes to `events.ts` for effects and re-reads state each frame for display.

## 2. Core Game Loop

Fixed-timestep simulation with rAF rendering, in `src/main.ts`:

```
TICK = 0.1 game-seconds (10 logic ticks per game-second)
accumulator += realDeltaSeconds * gameSpeed(state)   // streak speed multiplier here
while (accumulator >= TICK) { simTick(state, TICK, rng); accumulator -= TICK }
render(state)   // every rAF frame
```

- `gameSpeed(state) = 1 + 0.01 * min(streak, 100)` — capped at **2.0x**. Scales game-time, so mine hit timers, arena attack timers, and enemy attack timers all run faster. Streak **buff expiry timers and autosave run on real time** (buffs always last a real 10s regardless of speed).
- `simTick(state, dt, rng)` calls in order: `tickMine`, `tickArena`, then updates lifetime stats. Buff expiry is timestamp-based (§5), not ticked.
- **Frame-gap guard:** if `realDeltaSeconds > 5` (tab was hidden/throttled), do not spin the accumulator. Call `computeOfflineProgress(state, gap)` with rate 1.0 for the first 15 minutes of gap and the offline rate beyond, and reset the streak to 0 (buff timers expire naturally by timestamp). Otherwise clamp accumulator to max 1.0s.
- **Attack timers:** each rostered duck has a `nextHitIn` countdown (game-seconds). Each tick, subtract `dt`; when ≤ 0, resolve one hit and add `1 / attacksPerSecond`. While-loop so very fast ducks can land multiple hits per tick.
- Every hit (mine or arena): roll crit → compute payout/damage → `registerHitResult(state, isCrit)` → emit `hit` event for the UI.

## 3. Data Model (`src/game/types.ts`)

```ts
export type OreId = "copper" | "silver" | "crystal" | "starmetal";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Panel = "mine" | "arena";

export interface Rng { next(): number } // [0,1); mulberry32 impl + test fakes

export interface DuckDef {                 // static, in ducks.ts
  id: string; name: string; rarity: Rarity;
  role: "miner" | "fighter" | "hybrid";
  miningPower: number;                     // ore per hit multiplier basis
  attackDamage: number;
  attacksPerSecond: number;
  hp: number; defense: number;
  critChanceBonus: number;                 // additive, e.g. 0.05 — applies to own hits only
  critDamageBonus: number;                 // additive to multiplier, e.g. 0.25
  passive?: PassiveId;                     // "teamOre10" | "teamDmg10" | "goldenCrit" | "streakShield"
}

export interface OwnedDuck {
  defId: string;
  level: number;                           // 1..10, +10% base stats per level above 1
  shards: number;
  nextHitIn: number;                       // attack timer (game-seconds)
}

export interface StreakState {
  current: number;                         // consecutive crits, global
  best: number;
  buffExpiry: { t10: number; t25: number; t50: number; t100: number }; // real-time ms epoch
  shieldReadyAt: number;                   // Deathbill's Streak Shield cooldown (ms epoch)
}

export interface ArenaState {
  wave: number;                            // 1-based
  enemyHp: number; enemyMaxHp: number;
  enemyNextHitIn: number;
  teamHp: number; teamMaxHp: number;
  retryAt: number;                         // real-time ms; 0 = fighting
}

export interface GameState {
  version: 1;
  gold: number;
  xp: number; level: number;
  lifetime: { gold: number; crits: number; hits: number; packs: number };
  ores: Record<OreId, number>;             // cumulative mined, for stats display
  selectedOre: OreId;                      // current mine vein
  ducks: OwnedDuck[];                      // owned (defId unique)
  rosters: { mine: string[]; arena: string[] };  // defIds, length ≤ slot count
  skillNodes: string[];                    // purchased node ids
  streak: StreakState;
  arena: ArenaState;
  settings: { darkMode: boolean };
  lastSaved: number;                       // ms epoch
  createdAt: number;
}

export interface DerivedStats {            // computeStats(state) output — pure
  critChance: number;                      // clamped [0, 0.95]
  critMult: number;                        // base 2.0
  orePerHit: number; oreMult: number;
  attackDamageMult: number; flatAttack: number;
  attackSpeedMult: number; mineSpeedMult: number;
  defenseMult: number; flatDefense: number;
  xpMult: number; goldMult: number;        // includes streak tier buffs when active
  mineSlots: number; arenaSlots: number;   // 1 + purchased slot nodes
  offlineRate: number;                     // 0.5 base, up to 0.8
  buffDurationSec: number;                 // 10, or 15 with "Momentum" node
  unlockedOres: OreId[];
}
```

`computeStats(state, nowMs)` aggregates: base values from `balance.ts` + purchased skill nodes + passives of *rostered* ducks + active streak buffs (checked against `buffExpiry` and `nowMs`). Called once per logic tick and cached module-locally; UI reads the same cache.

**Base values (`balance.ts`):** critChance 0.30, critMult 2.0, orePerHit 1, offlineRate 0.5, mine/arena slots 1 each, crit cap 0.95.

## 4. Skill Tree (27 nodes)

Costs in gold. `requires` = parent node (tree edge). `minLevel` gates by player level. Effects are declarative (`{ stat, add | mult }`) so `computeStats` folds them generically; special kinds (`slot`, `oreUnlock`, `offline`, `buffDuration`) handled by tag.

**Trunk (root at bottom, always available):**

| id | name | effect | cost | requires | minLevel |
|---|---|---|---|---|---|
| crit1 | Keen Eyes | +5% crit chance | 50 | — | 1 |
| speed1 | Quick Feathers | +10% attack speed (both panels) | 100 | crit1 | 1 |
| crit2 | Keener Eyes | +5% crit chance | 250 | speed1 | 2 |

**Left branch — Mining (splits off `speed1`):**

| id | name | effect | cost | requires | minLevel |
|---|---|---|---|---|---|
| ore1 | Bigger Pickaxes | +1 ore per hit | 75 | speed1 | 1 |
| ore2 | Ore Magnet | +2 ore per hit | 300 | ore1 | 2 |
| mineslot2 | Bunk Beds | +1 mine roster slot | 500 | ore1 | 3 |
| oresilver | Silver Vein | unlock Silver ore (3g/ore) | 800 | ore2 | 3 |
| minespeed | Frenzied Mining | +25% mine attack speed | 3,000 | ore2 | 5 |
| ore3 | Deep Drilling | +50% ore per hit | 1,500 | oresilver | 5 |
| offline1 | Night Shift | offline rate 50% → 65% | 2,500 | mineslot2 | 5 |
| orecrystal | Crystal Cavern | unlock Crystal ore (8g/ore) | 4,000 | ore3 | 7 |
| mineslot3 | Duck Dormitory | +1 mine roster slot (3 total) | 6,000 | offline1 | 8 |
| offline2 | Automated Carts | offline rate 65% → 80% | 10,000 | offline1 | 10 |
| orestar | Starmetal Seam | unlock Starmetal ore (20g/ore) | 15,000 | orecrystal | 12 |

**Right branch — Combat (splits off `speed1`):**

| id | name | effect | cost | requires | minLevel |
|---|---|---|---|---|---|
| atk1 | Sharp Beak | +2 attack damage | 75 | speed1 | 1 |
| def1 | Feather Armor | +2 defense | 150 | atk1 | 2 |
| arenaslot2 | Battle Buddy | +1 arena roster slot | 500 | atk1 | 3 |
| atk2 | Talon Training | +25% attack damage | 600 | def1 | 3 |
| atkspeed1 | Wing Flurry | +25% arena attack speed | 1,200 | atk2 | 5 |
| def2 | Iron Plumage | +50% defense | 2,000 | def1 | 5 |
| atk3 | Berserk Quack | +50% attack damage | 5,000 | atkspeed1 | 8 |
| arenaslot3 | Flying V | +1 arena roster slot (3 total) | 6,000 | arenaslot2 | 8 |

**Crown — Crit core (grows from `crit2` at the top):**

| id | name | effect | cost | requires | minLevel |
|---|---|---|---|---|---|
| critdmg1 | Heavy Blows | crit damage +0.25x (2.0 → 2.25) | 400 | crit2 | 3 |
| xp1 | Wise Elders | +25% XP gain | 1,500 | crit2 | 4 |
| crit3 | Eagle Eyes | +10% crit chance | 1,000 | critdmg1 | 5 |
| critdmg2 | Devastating Strikes | crit damage +0.25x | 2,500 | crit3 | 7 |
| crit4 | Precision Instinct | +10% crit chance | 5,000 | critdmg2 | 9 |
| critdmg3 | Overkill | crit damage +0.5x | 8,000 | crit4 | 11 |
| crit5 | Guaranteed Chaos | +10% crit chance | 20,000 | crit4 | 14 |
| streak1 | Momentum | streak tier buffs last 15s (up from 10s) | 12,000 | crit3 | 10 |

Max crit chance from tree: 30% base + 40% = 70%; duck bonuses push toward the 95% cap. Purchase rule: node visible if parent purchased; buyable if parent purchased AND `level >= minLevel` AND `gold >= cost`.

**SVG mapping:** each node carries `{ x, y }` in the tree's viewBox (0 0 400 600) plus `branch: "trunk" | "left" | "right" | "crown"` — see §10.

## 5. Streak System (core loop)

In `src/game/streak.ts`:

- **What counts as a hit:** every resolved attack from every rostered duck, in both mine and arena. Enemy attacks do NOT count. **The streak is global** — mine and arena hits feed one counter. Intentional tension: a low-crit duck on either roster poisons streaks, so roster optimization matters.
- `registerHitResult(state, isCrit, nowMs, stats)`:
  - **Crit:** `streak.current++`, update `best`. For each tier `t ∈ {10, 25, 50, 100}`, if `current >= t`, set `buffExpiry[t] = nowMs + stats.buffDurationSec * 1000` (crossing a tier starts the buff; every further crit at/above the tier refreshes it).
  - **Non-crit:** if Streak Shield is rostered and `nowMs >= shieldReadyAt`, consume it (`shieldReadyAt = nowMs + 60_000`) and keep the streak. Otherwise `current = 0`. **Buff expiries are untouched** — they run out on their own timers, so losing the streak never instantly strips a buff.
- **Game speed:** `gameSpeed = 1 + 0.01 * min(current, 100)` (max 2.0x). Continuous, not stepped — every crit feels like acceleration.
- **Tier buffs** (active while `nowMs < buffExpiry[t]`, folded into `computeStats`):
  - **T10 — Gold Rush:** +50% gold income (goldMult ×1.5)
  - **T25 — Enlightened:** +50% XP gain
  - **T50 — Bloodlust:** +50% attack damage (arena)
  - **T100 — QUACKENING:** +25% to ALL stats (crit chance +10% flat within cap; oreMult, dmgMult, speedMult, xpMult, goldMult ×1.25) AND all shop purchases are FREE while active
- **Reachability sanity check:** at 60% crit, a 10-streak occurs about every 2 minutes at 3 hits/sec; at 80%, every ~17s; a 100-streak needs ~90%+ crit chance and is a genuine endgame moment (0.95^100 ≈ 0.6% per attempt). Tree/duck progression is tuned around this curve.
- Streak state persists in saves; a hidden-tab gap > 5s or offline load resets `current` to 0.

**Unit tests:** tier crossing sets expiry; refresh-while-above; non-crit resets but preserves expiry; shield consumes once per 60s; speed cap at 2.0.

## 6. Duck Roster (13 ducks, `src/game/ducks.ts`)

Stats at level 1. Level L multiplies miningPower, attackDamage, and hp by `1 + 0.10 * (L - 1)` (max level 10 = 1.9x).

| id | name | rarity | role | MP | atk | atk/s | HP | def | crit+ | critDmg+ | passive |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bill | Bill | common | miner | 1.0 | 1 | 1.0 | 20 | 0 | — | — | — |
| pebbles | Pebbles | common | miner | 0.8 | 1 | 1.3 | 20 | 0 | — | — | — |
| quackers | Quackers | common | fighter | 0.2 | 3 | 1.0 | 30 | 1 | — | — | — |
| waddles | Waddles | common | fighter | 0.2 | 2 | 0.8 | 45 | 3 | — | — | — |
| goldie | Goldie | uncommon | miner | 1.5 | 1 | 1.0 | 25 | 0 | +5% | — | — |
| drake | Drake | uncommon | fighter | 0.3 | 5 | 1.0 | 35 | 2 | +5% | — | — |
| puddle | Puddle | uncommon | hybrid | 1.2 | 4 | 0.9 | 30 | 1 | — | — | — |
| sirquack | Sir Quacksalot | rare | fighter | 0.4 | 8 | 1.0 | 60 | 4 | — | +0.25 | — |
| nugget | Nugget | rare | miner | 3.0 | 2 | 1.0 | 30 | 1 | +10% | — | — |
| drillbert | Drillbert | epic | miner | 5.0 | 3 | 1.5 | 40 | 2 | +5% | — | teamOre10 (+10% team ore/hit) |
| thunder | Thunderquack | epic | fighter | 0.5 | 14 | 1.4 | 70 | 4 | +10% | — | teamDmg10 (+10% team damage) |
| goose | The Golden Goose | legendary | miner | 10.0 | 5 | 1.2 | 50 | 2 | +15% | — | goldenCrit (mine crits pay +100% gold) |
| deathbill | Deathbill | legendary | fighter | 1.0 | 25 | 1.2 | 90 | 6 | +15% | +0.5 | streakShield (1 non-crit forgiven per 60s) |

- A duck's crit bonus applies to **its own hits only**. Passives apply team-wide while the duck is rostered (in the panel the passive affects).
- **Starting ducks:** new game grants Bill and Quackers, auto-rostered to mine and arena respectively.
- **Duplicates → shards** for that duck: common 1, uncommon 2, rare 3, epic 5, legendary 10 per duplicate.
- **Upgrading:** level N → N+1 costs N shards (level 10 total: 45 shards). Button in duck detail view.
- **Rostering:** each panel shows its slots; clicking a slot opens a picker of eligible owned ducks. A duck can only be in one roster at a time.

**Gacha (shop.ts):** Standard Pack **100 gold**, 1 duck. Five-Pack **450 gold**, 5 rolls with guaranteed uncommon-or-better. Odds per roll: common 60%, uncommon 25%, rare 10%, epic 4%, legendary 1%. Roll: pick rarity band, then uniform among that rarity's ducks. While T100 is active, pack price is 0 (unlimited during the window — reaching 100 earns it).

## 7. Mine (left panel, `src/game/mine.ts`)

- Ore veins: Copper (1 gold/ore, start), Silver (3), Crystal (8), Starmetal (20) — unlocked by skill nodes, selected via panel buttons. Higher veins strictly better.
- Per rostered mine duck per hit:
  - `isCrit = rng.next() < clamp(stats.critChance + duck.critChanceBonus, 0, 0.95)`
  - `ore = (stats.orePerHit + duck.miningPower) * stats.oreMult * (isCrit ? critMult(duck) : 1)`
  - `gold += ore * oreValue(selectedOre) * stats.goldMult` (crits pay ×2 more gold if Golden Goose rostered in mine)
  - `xp += 1 * stats.xpMult`; track ores mined; feed streak; emit hit event.
- Hit cadence: `duck.attacksPerSecond * stats.attackSpeedMult * stats.mineSpeedMult`.
- Early-game pacing: Bill alone ≈ 1.4 gold/sec expected → first node (50g) in under a minute, first pack (100g) in ~90 seconds.

## 8. Arena (right panel, `src/game/arena.ts`)

Simple auto-battler, always running:

- **Wave w:** enemy HP `= 30 * 1.18^(w-1)`, enemy attack `= 3 * 1.15^(w-1)`, attack speed 0.8 hits/s. Every 10th wave is a **boss**: 3x HP, 2x rewards, guaranteed shard drop. Enemy names cycle: Pond Slime, Angry Goose, Breadcrumb Golem, Rubber Shark, The Pondlord (boss).
- **Team:** `teamMaxHp = Σ rostered duck HP`; heals to full between waves. Per duck hit: damage `= (duck.attackDamage + stats.flatAttack) * stats.attackDamageMult * (crit ? critMult : 1)`; crits feed the global streak; XP +2 per hit.
- **Enemy hit:** `teamHp -= max(1, enemyAttack - (Σ duck defense + stats.flatDefense) * stats.defenseMult)`.
- **Victory:** gold `= 10 * 1.15^(w-1) * goldMult`, XP `= 15 * 1.12^(w-1) * xpMult`, 10% chance (100% on boss) of +1 shard for a random rostered arena duck. `wave++`, next enemy after 1s.
- **Defeat** (teamHp ≤ 0): 3s retry timer, team heals, same wave restarts at full enemy HP. No other penalty — the wall is the progression gate.
- Empty arena roster: panel shows "Assign a duck to fight"; enemy idles.

**XP / level curve:** `xpToNext(level) = 100 * 1.5^(level-1)`; on level-up, subtract and increment (handle multi-level). Level gates skill nodes (§4).

## 9. Offline Progress (`src/game/offline.ts`)

Pure function `computeOfflineProgress(state, elapsedSec, stats): OfflineReport`:

- `effective = min(elapsedSec, 8 * 3600)` (8h cap), `rate = stats.offlineRate` (0.5 base / 0.65 Night Shift / 0.8 Automated Carts).
- Expected mine income without streak, from the current mine roster: `goldPerSec = Σ ducks: hitsPerSec * (orePerHit + MP) * oreMult * oreValue * goldMult_noBuffs * (1 + critChance*(critMult - 1))`; `xpPerSec = Σ hitsPerSec * xpMult_noBuffs`.
- Grant `gold += goldPerSec * effective * rate`, `xp += xpPerSec * effective * rate` (then re-run level-ups). Arena does not progress offline.
- Returns `{ elapsedSec, cappedSec, rate, goldGained, xpGained, levelsGained }` for the Welcome Back modal ("While you were away (3h 12m), your ducks mined 4,812 gold at 65% efficiency...").
- Called on load when `now - lastSaved > 60s`, and by the frame-gap guard (§2) for hidden-tab gaps.

**Unit tests:** 8h cap, rate tiers, zero-roster returns zero, level-up rollover.

## 10. UI / Rendering Plan

**Layout (`style.css`):**

```
body → header.hud (fixed height ~56px) + main.panels
main.panels: display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 12px; height: calc(100vh - 56px)
```

Each panel: rounded card, title bar, scrollable body. Min supported width 1100px; below that, panels stack vertically (media query) — nice-to-have, not a milestone gate.

**Theme:** all colors via CSS custom properties on `:root` (light: `--bg: #ffffff; --fg: #1a1a1a; --card: #f5f5f5; --accent: #f5a623` duck orange; `--crit: #e0483e`). `html[data-theme="dark"]` overrides (`--bg: #14161a`, etc.). `theme.ts` toggles the attribute and writes `settings.darkMode`. Sun/moon SVG toggle in HUD right corner.

**HUD (top bar):** left cluster: gold (duck-coin SVG icon), gold/hr, XP bar with level, XP/hr; center: streak counter — big number that scales/pulses per crit, tier pips at 10/25/50/100 that light while each buff is active with a radial 10s countdown; right: shop button, dark mode toggle. Rates from `rates.ts`: `RateTracker` ring-buffers `(timestampMs, amount)`, prunes to a 120s window, reports `sum / windowSec * 3600`. Format numbers with `fmt()` (1.2K, 3.4M).

**Mine panel:** big ore-rock SVG (color per vein) that shakes on hits (CSS keyframe re-triggered via class toggle), vein selector buttons (locked ones show padlock + node hint), rostered duck SVGs in a row (idle bob, quick lunge on hit), roster slot buttons, lifetime ore counters.

**Duck art (`duckArt.ts`):** one parametric SVG function — body ellipse, circle head, triangle beak, dot eye, wing arc — with per-duck `{ bodyColor, beakColor, accessory }` (Deathbill: tiny scythe; Sir Quacksalot: helmet; Golden Goose: gold body + sparkle). Rarity = colored ring (gray/green/blue/purple/gold). ~40 lines, reused everywhere.

**Skill tree panel (middle):** single `<svg viewBox="0 0 400 600">`:
- Static art layers: ground line, trunk path, three main branch paths (left/right/crown) in muted brown; branch segments between purchased nodes re-stroke in a vivid color as nodes are bought.
- Each node = `<g>` at its `{x, y}`: circle (36px hit area) + icon glyph + cost label. States: hidden (parent unowned) → silhouette; affordable → accent pulse; owned → filled + **leaf cluster sprouts**: 3–5 small leaf ellipses around the node, `transform: scale(0→1)` pop with slight random rotation, so the tree visibly fills with foliage. 27/27 nodes = full canopy.
- Click → tooltip (name, effect, cost, level req) with Buy button; buying emits an event, treePanel re-renders that node + edge + spawns leaves.

**Arena panel:** enemy SVG blob with HP bar and name/wave label, team HP bar, rostered fighters facing it, hit flashes, wave counter, defeat overlay with 3s countdown, boss crown.

**Floating numbers (`floaters.ts`):** on `hit` events, spawn absolutely-positioned `<div class="floater">+12</div>` at the source panel's anchor with random x-jitter; CSS floats up 40px, fades 0.8s, removed. Crits: larger, `--crit` color, "!" suffix; star burst at tier crossings. Cap ~40 live floaters (drop oldest).

**Shop modal:** overlay with the two pack buttons (showing FREE during T100), pack-opening reveal (cards flip in sequence, rarity glow, "NEW!" or "+N shards"), and the collection grid of all 13 ducks (silhouettes if unowned) with level/shard status and upgrade buttons.

**Render strategy:** cheap parts (numbers, bars) re-rendered every frame via `textContent`/style widths; structural parts (rosters, tree nodes, collection) re-render only on events (`buy`, `gacha`, `roster-change`). No virtual DOM at this scale.

## 11. Save System (`src/game/save.ts`)

- Key `crittingDucks.save`. Format `JSON.stringify({ version: 1, state })`.
- `save(state)`: set `state.lastSaved = Date.now()`, write. Called every **15s** (real time), on `beforeunload`, and on `visibilitychange → hidden`.
- `load(): GameState | null`: parse, run `migrate(raw)` (a `switch (raw.version)` ladder — v1 passes through; future versions chain upward), then **merge onto `createInitialState()`** field-by-field so older saves get defaults for missing fields. Corrupt JSON → console warning + fresh state (stash the bad save at `crittingDucks.save.corrupt`, don't wipe it).
- Settings row (HUD overflow or shop modal footer): "Export save" (JSON to clipboard), "Import", "Hard reset" (with confirm).
- `localStorage` behind a `Storage`-like injectable so vitest (node env) can pass a Map-backed fake.

## 12. Verification & Testing

**Unit tests (vitest, colocated `*.test.ts`, `npm run test`):**
- `streak.test.ts` — tier crossing/refresh/reset, shield cooldown, gameSpeed cap.
- `mine.test.ts` — deterministic RNG (always-crit / never-crit fakes): ore/gold/xp math, vein values, crit multiplier.
- `arena.test.ts` — wave scaling, defeat/retry, victory rewards, boss multipliers.
- `offline.test.ts` — 8h cap, rate tiers, roster-based income math.
- `shop.test.ts` — gacha odds banding (seeded RNG at band edges), dupe→shard conversion, T100 free pricing, five-pack guarantee.
- `skilltree.test.ts` — prerequisite/level/gold gating, effect folding in `computeStats`.
- `save.test.ts` — round-trip, missing-field defaulting, corrupt-input fallback.

**Manual verification per phase:** `npm run dev` → open the printed localhost URL:
1. Bill mines; gold ticks up; floaters appear; gold/hr stabilizes near ~5K/hr.
2. Buy `crit1` → leaf pops on the tree, crit rate visibly rises.
3. Buy packs until a dupe → shard credit; upgrade a duck → stat change in tooltip.
4. Roster a high-crit team; streak climbs; at 10 the T10 pip lights and gold floaters grow; on a non-crit reset the pip stays lit ~10s.
5. Arena: waves clear; wipe on a wall → 3s retry; boss at wave 10 drops a shard.
6. Offline: save, edit `lastSaved` back 2h via devtools localStorage, reload → Welcome Back modal with ~correct gold at the right rate.
7. Toggle dark mode; reload; persists.
8. `npm run build` passes with zero TS errors.

## 13. Phased Build Order (each phase ends playable)

**Phase 0 — Skeleton:** scaffolding from §1 (already present at handoff); `types.ts`, `balance.ts`, `rng.ts`, `state.ts`, `events.ts`, `save.ts`, `main.ts` fixed-timestep loop; 3-panel CSS grid with placeholders; autosave. *Check: three empty panels render, save survives reload.*

**Phase 1 — Mine + HUD:** `ducks.ts` (definitions), `mine.ts`, `rates.ts`, `minePanel.ts`, `hud.ts`, `floaters.ts`, `duckArt.ts`. Bill mining copper. *Check: gold accumulates, floaters fly, gold/hr and xp/hr display.*

**Phase 2 — Streak:** `streak.ts` + HUD streak widget + game-speed wiring + tier buffs in `computeStats`. Tests. *Check: crits chain, speed visibly ramps, T10 pip works.*

**Phase 3 — Skill tree:** `skilltree.ts` + `treePanel.ts` (SVG tree, leaves, purchase flow, level gating). Tests. *Check: buy crit/ore nodes, effects apply, tree grows leaves.*

**Phase 4 — Shop, gacha, rosters:** `shop.ts`, `shopModal.ts`, roster pickers, duck levels/shards, slot nodes meaningful. Tests. *Check: buy packs, dupes→shards, roster 2–3 miners.*

**Phase 5 — Arena:** `arena.ts`, `arenaPanel.ts`, wave loop, rewards, boss shards, arena hits feeding streak. Tests. *Check: full three-panel loop; T50/T100 chase live.*

**Phase 6 — Offline + polish:** `offline.ts`, `welcomeBack.ts`, dark mode, frame-gap guard, export/import/reset, T100 free-shop flourish, number formatting, balance touch-up. *Check: full §12 manual list; `npm run build` clean.*

Commit and push at the end of each phase (push = auto-deploy to GitHub Pages).
