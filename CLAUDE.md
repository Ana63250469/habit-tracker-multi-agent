# CLAUDE.md

This repo is a university project: a **multi-agent development process**.
Agents implement features in an existing app from a spec. A human reviews the evidence and the PR.

## Layout

| Path              | What                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `app/`            | The Habit Tracker app (see `app/CLAUDE.md` for architecture/commands). |
| `specs/<id>/spec.md` | Feature specs, the single source of truth for agents.               |
| `agents/`         | Instructions (`*.md`) and tool permissions (`settings/*.json`) per agent. |
| `scripts/agent.mjs` | Runner: starts one agent, runs checks, logs metrics.                 |
| `runs/`           | Evidence per run: prompt, result, report, screenshots, `metrics.csv`. |
| `docs/`           | Project documents (Slovenian).                                         |

## Rules for every agent

- The spec is the source of truth. If it is unclear, report a question; do not guess.
- Stay inside the files your role allows (see your instructions).
- Never edit `specs/`, `agents/`, `scripts/`, `app/server/tests/support/` or `.env`.
- Do not commit, push or switch branches. The runner commits after the human-visible checks.
- End your final message with one line `RESULT: <STATUS>` as defined in your instructions.

## Useful commands (run from repo root)

- Acceptance tests: `npm --prefix app/server run test:acceptance`
- All server tests: `npm --prefix app/server test`
- Build everything: `npm --prefix app run build`
