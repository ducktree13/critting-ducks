# Critting Ducks — Visual Style Guide (STYLE.md)

**Direction: "Storybook Picnic"** — warm, rounded, hand-drawn woodland. Ink-outlined shapes,
watercolor-soft fills, gentle saturation. Companion artifact: `Style Guide.dc.html` (interactive,
live-rendered components under every theme × mode). This file is the single source of truth for
implementation; where prose and the guide page disagree, fix the page.

Hard constraints (from the game):
- Plain DOM + SVG + CSS. No canvas, no frameworks, no external image assets. Static GitHub Pages.
- Fonts: Google Fonts (all OFL) — **self-host** the woff2 files in `/fonts/` with `@font-face`.
- Every color/border/font decision flows through CSS custom properties. A theme is a token swap.
- Per-frame animation: `transform` and `opacity` only (single exception: pip `stroke-dashoffset`).
- Every effect has a `prefers-reduced-motion` fallback.

---

## 1 · Token architecture

Three layers:

1. **Base tokens** (`:root`) — immutable primitives: radii, border width, motion, rarity hues,
   crit + heat ramp, gold/xp/hp. Never redefined by themes.
2. **Semantic tokens** — role names redefined by `[data-theme]` and `[data-mode]` selectors.
3. **Components** — consume semantic tokens only. Never raw hex, never `[data-theme]`-specific CSS.

State lives on the root element:

```html
<body data-theme="volcano" data-mode="night">
```

Selector order (later wins):

```css
:root { ... }                                  /* base + woodland-day fallback   */
[data-mode="night"] { ... }                    /* mode-level globals (crit, gold) */
[data-theme="volcano"] { ... }                 /* theme day values                */
[data-theme="volcano"][data-mode="night"] { }  /* theme night overrides           */
```

### Naming conventions

- Kebab-case, role-first: `--surface-border`, `--panel-head-ink`, `--rarity-epic`.
- `-ink` suffix = "text/icon color placed ON that thing" (`--accent-ink`, `--panel-head-ink`,
  `--crit-ink`, `--text-inverse`).
- `-soft` = tint of the same hue for tags/highlights. `-hover` = hover fill.
- Scene tokens: `--sky-top`, `--sky-bottom`, `--ground`, `--scene-detail` (clouds by day,
  stars/embers by night).
- Never introduce a component-named token (`--button-bg` ❌). Components map to roles.

### Semantic token set (complete)

| Token | Role |
|---|---|
| `--sky-top / --sky-bottom` | scene sky gradient |
| `--ground` | scene ground band |
| `--scene-detail` | clouds (day) / stars, embers (night) |
| `--surface` | panel & card fill |
| `--surface-raised` | chrome that floats above a surface |
| `--surface-sunken` | wells, meter tracks, empty slots |
| `--surface-border` | the ink outline (also drop-shadow ink) |
| `--shadow-drop` | offset-shadow color (rgba) |
| `--text / --text-muted / --text-inverse` | copy |
| `--accent / --accent-hover / --accent-ink / --accent-soft` | primary actions |
| `--panel-head / --panel-head-ink` | panel header band |
| `--font-display` | theme display face (body font never switches) |
| `--disabled-bg / --disabled-text` | disabled controls |
| `--locked-a / --locked-b / --locked-text` | locked stripe pair + label |
| `--crit / --crit-ink / --crit-glow` | crit identity (mode-switched, never theme-switched) |
| `--heat-1..4` | streak heat ramp (global) |
| `--gold / --xp / --hp` | meters (mode-switched only) |
| `--rarity-*` | 7 rarity hues (+ `--rarity-divine-grad`) — global |
| `--radius-s/m/l`, `--border-w` | shape |
| `--dur-1/2/3`, `--ease-out/snap/bounce` | motion |

### Full token sheet

The complete, canonical CSS (all 8 themes × 2 modes, ~16 semantic tokens each) lives in the
`<style>` block of `Style Guide.dc.html`. Copy it verbatim into the game as `tokens.css`.
Summary of day-mode identities:

| Theme | surface | border/ink | accent | panel-head | display font |
|---|---|---|---|---|---|
| Woodland | `#faf3e3` | `#5b4636` | `#eaa63c` | `#8aa86f` | Chelsea Market |
| Forest | `#eef2e0` | `#3b4829` | `#6f9a4e` | `#5f8a52` | Grandstander |
| Volcano | `#f5e0cc` | `#48231a` | `#e0632e` | `#b5502e` | Titan One |
| Castle | `#e9e5da` | `#3e3a4c` | `#7d5bb0` | `#5a5470` | Grenze Gotisch |
| Swamp | `#e9ecd0` | `#3c4824` | `#8a9a3e` | `#6b7a3c` | Chewy |
| Island | `#fbf0d8` | `#2e5560` | `#2ea8b8` | `#3592a0` | Boogaloo |
| Prairie | `#f8efd8` | `#5c4426` | `#cf8f2e` | `#a5793a` | Sniglet |
| Western | `#f2e2c4` | `#47301e` | `#b5502e` | `#7a4a2c` | Rye |

Night mode rules of thumb (already encoded in the sheet):
- Sky goes deep + `--scene-detail` becomes star/ember color; ground darkens ~55%.
- Surfaces become dark warm tints of the theme hue; `--text` becomes the theme's cream.
- `--accent` brightens one step (never darkens) so buttons keep punch on dark surfaces.
- Mode-global lifts: `--crit → #ff6752`, `--gold → #e8c25a`, rarity hues brighten one step.

---

## 2 · Type

- **Display** = `var(--font-display)` (theme token). Headings, buttons, streak counter,
  panel titles, crit floaters. Never for paragraphs.
- **Body & numbers** = Nunito, always. Numerals always `font-variant-numeric: tabular-nums`
  and weight 800–900 so 60fps counters never jitter in width.
- **Mono** = JetBrains Mono, dev/debug and token labels only, never in-game.
- Scale: display 44 / 30 / 20 · body 16 / 14 · caption 12 (minimum on screen).

## 3 · Shape & chrome

- Radii: 8 / 14 / 22px (`--radius-s/m/l`). Border: 2px solid `var(--surface-border)` on every
  surface, button, and meter. Cartoon offset shadow: `0 3px 0 var(--shadow-drop)` (4–6px for
  floating chrome/modals).
- **Buttons**: display face; press = translateY(2px) + shadow collapses to 1px; hover =
  translateY(-2px) + `--accent-hover` + shadow grows (all `--dur-1`/`--dur-2`, `--ease-out`).
  Disabled = `--disabled-*`, no shadow. **Locked ≠ disabled**: 45° stripe pair
  `--locked-a/b`, dashed border, padlock glyph, `--locked-text`.
- **Panels**: `--surface` body, `--panel-head` header band with display-face title, minimize
  button collapses panel into a 52px vertical rail (title in `writing-mode: vertical-rl`).
- **Tooltips**: `--surface-border` fill (ink bubble), `--text-inverse` copy, 45°-rotated square
  tail. 240ms fade/rise, pointer-events none.
- **Modal**: panel chrome + full-viewport scrim = `--surface-border` @ ~32% opacity.
- **Meter bars**: 12–14px tall, sunken track, 1.5px inner border-right on the fill edge.
  Fill colors: `--xp`, `--hp`, `--accent` (progress), `--gold` (currency-related).
  Shard bars add repeating tick overlay every 24px.

## 4 · Rarity (7 tiers)

Hue is never the only cue — each tier has a **shape signature** + label:

| Tier | Token (day) | Signature |
|---|---|---|
| Common | `#a89a83` | thin 3px plain ring |
| Uncommon | `#6f9a4e` | ring + leaf notch at 12 o'clock |
| Rare | `#4a7fb5` | double ring |
| Epic | `#8f6bb5` | 4px ring + 4 diamond studs (N/E/S/W) + 12px glow |
| Legendary | `#d6a336` | 5px ring + crown crest + 16px glow |
| Mythic | `#c23a3a` | 5px flame-scallop ring + 18px glow |
| Divine | `#cfd8ee` + `--rarity-divine-grad` | slowly-rotating iridescent conic ring + rays + 22px glow |

- Circled portrait = **inventory/card treatment only**; ducks in scenes have no ring.
- Card frames reuse the same signature (crest badge on frame top for legendary+).
- Pack-reveal drama scales the same way: flip → ring draw-on → signature element pops in
  (`--ease-bounce`) → glow. Divine adds a full-screen soft ray burst.
- Night mode brightens each hue one step (encoded in sheet) to hold contrast on dark surfaces.

## 5 · Duck construction (the "Duckling" rig)

One parametric SVG build, viewBox `0 0 100 100`, facing left. Layers back→front:
legs (2 rounded rects) → webbed feet (2 wedges) → **body+tail single path** → wing teardrop →
head circle (r 14.5 @ 36,24) → hair curl → bill upper+lower wedges → eye + highlight + blush →
accessory slot. Canonical path data is in `Style Guide.dc.html` §08 / `Direction Options.dc.html` 2a.

- Duck ink is **always `#5b4636` at 2px** (divide stroke width by group scale). Duck outlines do
  NOT theme-switch — ducks read as the same critters in every world.
- Params: `bodyScaleX/Y` (chubby↔slim), `overallScale` (tiny↔tall), `headRatio`, `palette`
  (species: pekin cream `#f4ecd9`, golden `#eaa63c`, mallard = `#5f8a52` head + neck-ring
  ellipse + `#cfc0a4` body…), `accessories[]`, `blush`, `hairCurl`.
- Complexity budget by rarity: common drops layers (no feet off-scene, no blush, muted palette);
  standard = full rig; legendary+ stacks accessories (crown, mustache, monocle…), sparkle
  polygons, and a dashed aura ellipse; divine adds iridescent aura.
- Silly variants (chubby/tall/tiny/mustache/hats) are transform + accessory swaps on the same rig
  — never new drawings. Style stays repeatable because geometry is shared.

## 6 · Skill trees — growth & species

The skill tree is scenery + UI in one, and it **starts barren and grows in size and complexity**
with every purchased node. Live samples: guide §09.

**Procedural generator (species-independent).** Trees are *generated, not drawn* — the most
realistic layer of the game. One recursive module:

```
branch(pos, angle, len, width, depth):
  walk 4 steps; each step: angle += (rnd-0.5)*wiggle; angle += (UP - angle)*pull
  emit tapered ink-outlined stroke (ink underlay = width+3, round caps/joins)
  if depth < maxDepth: spawn kids[depth] children fanned across ±spread,
    len ×0.76 (primaries ×~1.05), width ×0.6; plus mid-branch forks (midProb) for gnarl
```

`rnd` is a seeded PRNG (mulberry32) — same seed, same tree, every load. Per-branch pull
variance makes limbs sweep differently in every direction. The finished tree is auto-fit to its
canvas (base pinned to the ground line). Base-type parameters (gnarled oak): `trunkLen 44,
trunkW 21, spread 1.2, wiggle 0.6, pull 0.04 ± 0.12, kids [4,3,2,2], lenK 0.75, primK 1.1,
midProb 0.35, maxDepth 4` + four tapered root-flare limbs.

**Rendering (flat two-tone, no gradients).** Each limb is a *tapered polygon* — width eases
base→tip (×0.58); children inherit the parent's tip width (×0.78–0.86), so the trunk stays
thick while twigs run fine. All limb polygons draw first as a merged ink silhouette (+2.6px),
then bark fills, then a darker core-shadow ribbon (30% width, offset to the shade side) on major
limbs only. Ground shadow ellipse under the crown.

**Leaves are individual.** A leaf = two quadratic curves meeting at a point + a center vein
stroke, ink-outlined. Foliage = seeded fans of 4–7 leaves sprayed around the outermost owned
anchors, alternating two greens — never plain circles.

**Node placement (computed, ~30 anchors).** Candidates sit at fixed fractions along every
branch (trunk carries only 2); sorted by distance-from-root; greedily thinned to a minimum
separation (adaptive 30→14px); capped at 30. First ~19 by root-distance are owned, the next
2–3 are the affordable frontier (pulsing + cost), the outer reach is hidden — progress reads
inner→outer across the whole crown.

**Growth model.** Stage = f(owned count): S0 barren sprout (0) → S1 sapling (1–7) → S2 young
tree (8–17) → S3 mature (18–30). Stages reveal deeper recursion levels of the *same* tree
(same seed), scaled 0.5→1. New segments scale in from their parent joint, 480ms `--ease-out`
(reduced motion: appear instantly). **Branches arrive bare one stage before their nodes become
purchasable** — room to grow is always visible.

**Theming = a parameter set + dressing, never new drawing code.**

| Theme | Generator params vs base | Dressing on outermost owned nodes |
|---|---|---|
| Woodland | base (gnarled oak) | leaf clusters |
| Forest | pull 0.3, spread 0.5, kids [4,3,2] (conical) | needle tufts |
| Volcano | wiggle 0.88, kids [3,3,2,2], charcoal | ember flames (`--crit-glow` halo) + lava-vein crack |
| Castle | wiggle 0.05, symmetric fan, pull 0.2, no roots, stone planter | clipped formal ovals |
| Swamp | trunkLen 64, spread 1.35, pull −0.03 (droop), water band + knees | feathery flat tufts + moss drapes |
| Island | special: arc trunk + 7 math-placed frond arcs | owned fronds unfurl w/ leaflet ticks; unpurchased = dry stubs |
| Prairie | spread 1.2, maxDepth 3, low wide crown | leaf clusters + grass tufts |
| Western | trunkW 11, wiggle 1.0, kids [2,2,2,2], midProb 0.5 | green desert-bloom shoots |

**Node types.** Every anchor carries a type, read by icon shape first, hue second:
Mining/gold = pickaxe on `--gold` · Attack = sword on `--accent` · Defense/health = shield on
`--xp` · Crit = 4-point spark on `--crit` · Passive = leaf on `--rarity-uncommon`.
Hidden nodes stay typeless silhouettes until revealed, so the reveal carries information.
Where a species has a signature feature, the feature seats the node (palm fronds + coconuts,
topiary balls, ember knots) — the node sits ON the thing you grew.

**Node states** (tokens, identical everywhere): hidden = `--surface-sunken` @ 50% opacity,
no icon · affordable = `--surface` fill, pulsing type-colored ring (1.2s), type icon + cost
pill below · owned = type-colored fill + icon, species growth rendering behind it.

**Status: directional, not final.** The current trees prove the approach (generated,
parameterized, feature-seated typed nodes) but the art is not lock-worthy. Next-pass ideas —
keep the sprawl, gain coherence:
- **Silhouette envelope**: hand-draw one crown outline per species; grow via space-colonization
  (attraction points inside the envelope) or reject-and-regrow so every seed fills the designed
  shape.
- **Curated seeds**: generate hundreds, hand-pick one per species; ship `seed + params` as data.
- **Sibling separation**: minimum angle between children; reject limb overlaps at generation.
- **Phyllotaxis**: golden-angle child distribution for natural-but-ordered spread.
- **One light source**: core-shadow ribbons on the same world side across all themes.
- **Co-generate layout**: reserve node seats during growth (branch spacing driven by node
  min-separation) instead of placing nodes after.
- **Hybrid authoring**: hand-draw trunk + 2–3 hero limbs per species; grow twigs procedurally.

**Act 2 forest**: tree felled; four saplings (Mining / Combat / Crit / Passive) restart at S0 of
the same species above the duck pond. Clickable bonus leaves detach from owned clusters, drift
down ~4s (transform + opacity, `--ease-out`); reduced-motion: appear at rest on the pond edge.

## 7 · Crit & streak escalation

**Per-crit (must read at several/sec):** normal hit = Nunito-800 floater, 480ms, rise 36px,
`--ease-out`, fade last 40%. Crit = display-face `--crit` floater + glow, spawn 1.45× scale →
1× in 120ms, 640ms life, 6-particle wedge burst (300ms). Floater pool of 12 nodes, round-robin
reuse; transform/opacity only.

**Heat states (streak counter):**

| State | Streak | Border/color | Pulse | Extras |
|---|---|---|---|---|
| Cold | 0–9 | `--surface-border` | none | quiet chrome |
| Warm | 10–24 | `--heat-1` | 1.4s | pip 1 lit, 8px glow |
| Hot | 25–49 | `--heat-2` | 1.0s | embers ~2/s |
| Blazing | 50–99 | `--heat-3` | 0.7s | +6% scene saturation (stepped filter, scene layer only), embers ~6/s |
| QUACKENING | 100+ | `--heat-4` + iridescent sweep | 0.5s | rays, vignette, max particles |

**Exact triggers:**
- Tier cross (10/25/50/100): pip lights + radial ring starts draining (SVG `stroke-dashoffset`,
  one prop/frame) · counter scale-pop 1→1.3→1 (280ms `--ease-bounce`) · screen shake 220ms ±4px
  decaying · 12-particle ring burst.
- Heat shift: border/glow retint 400ms `--ease-snap`.
- 100 — THE QUACKENING: 120ms white flash (opacity overlay) → 400ms shake → banner scale-in
  900ms `--ease-bounce` → iridescent border sweep (1.6s linear loop) on HUD + panel borders +
  golden-duck confetti; persists while streak holds.
- Streak break: desaturate counter 600ms, pips drain. Calm — never a punishment flash.
- Pack crits (bonus packs) reuse the tier-cross recipe at card scale: flash → bounce-pop
  "PACK CRIT!" ribbon → burst; a bonus pack slides in with `--ease-bounce`.
- Game speed 2× scales *pulse frequencies*, not one-shot durations.

## 8 · Motion & performance

- `--dur-1` 120ms (press/flash/pip) · `--dur-2` 240ms (hover/tooltip/tab) · `--dur-3` 480ms
  (modal/floater/retint).
- `--ease-out` cubic-bezier(.22,1,.36,1) · `--ease-snap` (.65,0,.35,1) · `--ease-bounce`
  (.34,1.56,.64,1).
- Per-frame: transform/opacity only. Loops >2s = CSS animations, not rAF. Bars re-render via
  `transform: scaleX()` on an inner fill (transform-origin left), not width.
- `prefers-reduced-motion`: floaters fade in place, zero shake, static heat colors, pips light
  without pulse, QUACKENING = static banner, clouds/stars freeze. State never conveyed by
  motion alone.

## 9 · Accessibility

- Body text and numerals ≥ 4.5:1 against their surface in **every theme × mode** (the sheet is
  tuned for this; verify when touching values).
- Disabled ≥ 3:1 against its background; locked adds stripes + padlock (never gray alone).
- Rarity = hue + shape signature + label (§4). Crit floaters differ from normal by face, size,
  and glow — not color alone.
- All interactive targets ≥ 32px in the desktop UI; focus-visible = 2px `--accent` outer ring
  offset 2px.

## 10 · File conventions

- `tokens.css` — the token sheet, copied from the guide. `components.css` — component rules.
- Theme/mode switching = one line of JS: `document.body.dataset.theme = 'volcano'`.
- New theme checklist: 16 semantic tokens × 2 modes + display font + `@font-face`; verify §8;
  add exemplar cluster to the guide page.
