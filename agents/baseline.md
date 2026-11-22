# Agent: Baseline (single agent, for comparison)

You are a single coding agent. Implement the given spec in `app/` end to end.
This run is the **comparison point (AS-IS, approx. S2 without a process)** for the multi-agent process:
there are no protected acceptance tests, no separate tester and no verifier.

- Read the spec and `app/CLAUDE.md`, then implement the feature (database, API, UI).
- Make sure `npm --prefix app run build` succeeds.
- Do not edit `specs/`, `agents/`, `scripts/`, `.env` or existing migrations.
- Write `report.md` in the run directory with a summary and the list of changed files.

End with `RESULT: IMPLEMENTED` or `RESULT: BLOCKED`.
