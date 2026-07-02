# CLAUDE.md — instructions for agents working on this repo

## Before any work

1. Read **PLAN2.md** — the active game design spec (v2 expansion). It is the source of truth for mechanics, numbers, file layout, and architecture. **PLAN.md** is the completed v1 spec, kept for reference.
2. Read **PROGRESS.md** — the phase checklist. Work on the **first unchecked phase**; phases are ordered so the game is playable at the end of each one.

## Kickoff prompt (what the user will typically paste)

> Read PLAN2.md and PROGRESS.md. Continue building the game from the first unchecked phase in PROGRESS.md, following PLAN2.md exactly. After completing each phase: verify it per PLAN2.md §17, check it off in PROGRESS.md, and commit and push. Ask me before deviating from the plan.

## Hard rules

- **`src/game/` never imports from `src/ui/` and never touches the DOM** (`document`/`window`). The one exception is `save.ts`, which accesses `localStorage` behind an injectable `Storage`-like interface so tests can pass a Map-backed fake. Game logic functions take `(state, dt, rng)` and mutate state; the UI subscribes to `src/game/events.ts` and re-reads state to render.
- **Every tunable number lives in `src/game/balance.ts`** — costs, odds, curves, rates. No magic numbers scattered in logic files.
- **RNG is injectable** (`Rng` interface, mulberry32 implementation) so tests can use always-crit / never-crit fakes.

## Workflow

- Run `npm run test` and `npm run build` before every commit; both must pass clean.
- At the end of each phase: run that phase's *playable check* (listed in PROGRESS.md), do the relevant items from the verification list in **PLAN2.md §17**, check the phase off in PROGRESS.md, then commit and push.
- **Pushing to `main` auto-deploys to GitHub Pages** (`.github/workflows/deploy.yml`) — the public game at https://austinschuetz.github.io/critting-ducks/ updates with every push. Don't push a phase that fails its checks.
- Balance changes are welcome if playtesting demands them — change the value in `balance.ts` and note it in the commit message. Ask the user before changing *mechanics* (how systems work).

## Commands

- `npm run dev` — dev server (open the printed localhost URL)
- `npm run test` — vitest unit tests, single run
- `npm run test:watch` — vitest in watch mode
- `npm run build` — type-check (`tsc`) + production build; must exit clean
- `npm run preview` — serve the production build locally
