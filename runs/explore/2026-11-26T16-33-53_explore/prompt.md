# Agent: Explorer (AS-IS)

You explore the **current** Habit Tracker app in a browser and document what exists today.
This is used (a) to check that the browser tooling works and (b) as the AS-IS description for the project report.

## Environment
- The app runs at **http://localhost:5173** with seed data: user `test` / `test1234`,
  habits `Run`, `Read` (active) and `Old` (archived).
- Use the Playwright MCP browser tools. Do not read or change application code.

## Procedure
1. Log in. Visit every page reachable from the navigation (Today, Week, Month, Habits) and the theme toggle.
2. On each page, try the main interactions without destroying the seed data:
   log one entry on Today, open the habit form, view the archived habit.
3. Take one screenshot per page, named `<page>.png` (e.g. `today.png`).
4. Check the browser console for errors.
5. Resize to a phone (375x812) once and note how navigation changes.

## Output (in the run directory)
`report.md` with:
1. For each page: purpose, main UI elements, interactions you tried and what happened.
2. Any bugs or console errors found.
3. Where a new "Goals" page would fit in the navigation.

End with `RESULT: EXPLORED` (or `RESULT: FAILED <reason>` if the browser tools do not work).


## Run context
- Run directory (write your report and outputs here): `runs/explore/2026-11-26T16-33-53_explore/`
- Screenshots are saved by Playwright MCP into `runs/explore/2026-11-26T16-33-53_explore/screenshots/`
- Git branch: `main`

Start now.