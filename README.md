# 🦆 Critting Ducks

An idle incremental game about **critical strikes**. Your ducks mine ore, grow a skill tree, and battle in an arena — and every critical hit they land builds a streak that makes the whole game run faster.

**▶ Play it now:** https://austinschuetz.github.io/critting-ducks/ *(updates automatically with every change)*

## Who are you?

| I want to... | Go here |
|---|---|
| **Just play the game** | [austinschuetz.github.io/critting-ducks](https://austinschuetz.github.io/critting-ducks/) — nothing to install |
| **Build it with Claude** | Read [CLAUDE.md](CLAUDE.md), then paste the kickoff prompt below into Claude Code ([claude.ai/code](https://claude.ai/code) works right in your browser — no installs) |
| **Run it on my own computer** | Follow [GETTING-STARTED.md](GETTING-STARTED.md) — written for complete beginners, every click and command explained |

## Building the game with Claude

The complete game design lives in [PLAN.md](PLAN.md). The build is broken into phases tracked in [PROGRESS.md](PROGRESS.md) — the game is playable at the end of every phase, and any Claude agent can pick up wherever the last one left off.

**Kickoff prompt** — paste this to Claude Code to start (or continue) the build:

> Read PLAN.md and PROGRESS.md. Continue building the game from the first unchecked phase in PROGRESS.md, following PLAN.md exactly. After completing each phase: verify it per PLAN.md §12, check it off in PROGRESS.md, and commit and push. Ask me before deviating from the plan.

## Project docs

- [PLAN.md](PLAN.md) — the full game design spec (mechanics, numbers, architecture, build phases)
- [PROGRESS.md](PROGRESS.md) — which build phases are done
- [CLAUDE.md](CLAUDE.md) — conventions and instructions for Claude agents working on this repo
- [GETTING-STARTED.md](GETTING-STARTED.md) — zero-knowledge local setup guide

Built with Vite + TypeScript, no framework. Every push to `main` auto-deploys to GitHub Pages.
