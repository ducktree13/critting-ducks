# Handoff: Critting Ducks — Visual Style Guide

## Overview
Complete visual style system for **Critting Ducks**, a browser idle/incremental game about
critical strikes (one screen: top HUD + Mine / Skill-tree / Arena panels, plus overlays).
Direction: **"Storybook Picnic"** — warm, rounded, hand-drawn woodland; ink outlines,
watercolor-soft fills. This package defines the token architecture (8 unlockable themes ×
day/night), typography, every core component treatment, the 7-tier rarity system, the
parametric duck rig, the procedural skill-tree system, and the crit/streak escalation ladder.

## About the Design Files
The files in this bundle are **design references created in HTML** — living prototypes showing
intended look and behavior, not production code to copy directly. The task is to **recreate
these designs in the game's actual environment**: plain DOM + SVG + CSS, no framework, no
canvas, no external image assets, static GitHub Pages hosting (constraints in STYLE.md §0).
The one thing you SHOULD lift near-verbatim is the **token sheet**: the `<style>` block at the
top of `Style Guide.dc.html` is the canonical `tokens.css` (all 8 themes × 2 modes).

**`STYLE.md` is the single source of truth.** Where this README and STYLE.md disagree, follow
STYLE.md.

## Fidelity
- **High-fidelity**: token sheet (every color for every theme × mode), typography, buttons,
  panels, tooltips, modal chrome, meters, streak pips, rarity ring signatures, duck rig
  construction, crit/streak triggers-durations-easings, motion + reduced-motion rules.
  Implement these exactly.
- **Directional (not final art)**: the procedural skill trees. The *system* is settled —
  seeded recursive generator, parameter-set-per-theme, ~30 typed node anchors placed by math,
  growth stages S0–S3 from barren sprout to mature — but the tree art itself needs a polish
  pass. STYLE.md §6 "Status: directional, not final" lists the agreed next-pass ideas
  (silhouette envelopes / space colonization, curated seeds, sibling separation, phyllotaxis
  angles, single light source, co-generated node layout, hybrid hand-drawn hero limbs).

## What's in the Guide (Style Guide.dc.html)
Open it in a browser; use the sticky controls to switch any of the 8 themes and day/night —
every component reskins from tokens alone.
1. **Cover + live HUD sample** — gold chip, XP bar, hot streak counter with tier pips, shop
   button, day/night scene (drifting clouds / twinkling stars).
2. **Token architecture** — base → semantic → component; attribute-swap pattern
   (`<body data-theme="volcano" data-mode="night">`).
3. **Palettes** — live semantic swatches + all 16 theme×mode strips.
4. **Typography** — per-theme display faces (body = Nunito always, tabular numerals).
5. **Buttons & controls** — primary/secondary/crit/ghost; default/hover/active/disabled/locked
   (locked = stripes + padlock, never gray alone).
6. **Panels, tooltips, modal** — panel chrome + pinned mission, minimized vertical rail,
   ink-bubble tooltip, Welcome-back modal with contained scrim demo.
7. **Meters & streak pips** — xp/hp/shard bars; 10/25/50/100 pips with radial drain.
8. **Rarity system** — 7 tiers, shape signature beyond hue; full inventory duck-card anatomy
   (stats, trait, 3 gear slots, shard bar, ascension stars, favorite heart).
9. **Duck construction** — the "Duckling" rig: layer stack, params, complexity-by-rarity.
   (`Direction Options.dc.html` holds the approved species/silly-variant exploration.)
10. **Skill trees** — procedural generator, growth stages, all 8 themed species, typed nodes
    (Mining pickaxe / Attack sword / Defense shield / Crit spark / Passive leaf), node-type
    key, and the "directional, not final" note with next-pass ideas.
11. **Crit & streak escalation** — heat states (Cold→Warm→Hot→Blazing→QUACKENING), per-crit
    floater anatomy + budget (pool of 12), exact trigger/duration/easing ladder.
12. **Motion rules** — duration/easing tokens, transform/opacity-only rule,
    prefers-reduced-motion fallbacks.
13. **Exemplars** — Woodland/Volcano/Castle × day/night rendered from identical markup.

## Interactions & Behavior
All exact values (durations, easings, triggers, spawn rates, shake amplitudes, QUACKENING
sequence, streak-break behavior, 2× game-speed rule) are specified in STYLE.md §7–8.
Non-negotiables: per-frame animation is `transform`/`opacity` only (single exception: pip
`stroke-dashoffset`); every effect has a reduced-motion fallback; floaters come from a pooled
set of 12 nodes.

## State Management (theming)
One attribute pair on the root element drives everything:
`document.body.dataset.theme = 'volcano'; document.body.dataset.mode = 'night';`
No component may carry theme-conditional styles. New-theme checklist in STYLE.md §10.

## Design Tokens
Canonical sheet = the `<style>` block in `Style Guide.dc.html` (copy to `tokens.css`).
Schema, naming conventions (`-ink`, `-soft`, `-hover` suffixes), and the full semantic-token
table are in STYLE.md §1. Rarity + crit hues are global (mode-adjusted, never theme-switched).

## Assets
None. Everything is inline SVG / CSS. Fonts are Google Fonts (OFL) — **self-host the woff2
files** (`@font-face`) for GitHub Pages: Nunito (body, always), JetBrains Mono (dev only), and
per-theme display faces: Chelsea Market, Grandstander, Titan One, Grenze Gotisch, Chewy,
Boogaloo, Sniglet, Rye.

## Files
- `STYLE.md` — the written contract (source of truth).
- `Style Guide.dc.html` — interactive guide; open directly in a browser (needs `support.js`
  beside it). All rendered examples, live theme/mode switching.
- `Direction Options.dc.html` — approved art-direction exploration: Storybook Picnic (1a) and
  the Duckling duck rig (2a) with species/silly/rarity variants. Reference only.
- `support.js` — runtime for the .dc.html files (viewing convenience only; not part of the
  deliverable to implement).
