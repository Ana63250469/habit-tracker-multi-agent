# SPEC-002 Goal Progress — Implementer report

## 1. Summary

Implemented goal progress (SPEC-002) on top of SPEC-001.

**Server** (`app/server/src`, routes → controllers → services + Zod, no schema changes):
- New read-only endpoint `GET /api/goals/progress?date=YYYY-MM-DD`, JWT `requireAuth` first,
  `/progress` registered before any `:id` route. Returns `{ data, error }`.
- One item per goal of an active habit; ordered by habit `sortOrder`, `createdAt`, `id` ascending.
- Weekly period = Monday–Sunday inclusive; monthly = first–last calendar day inclusive.
- Counting uses `HabitEntry.date` calendar strings (no time-zone shifting); every entry counts once,
  multiple entries per date count individually, entries after the reference date but inside the period
  count, entries outside the period don't, entries logged before goal creation count, per-habit isolation.
- `completedCount` (actual, may exceed target), `remainingCount = max(targetCount - completedCount, 0)`,
  `percentage = min(100, floor(completedCount / targetCount * 100))`, `achieved = completedCount >= targetCount`.
- Strict `date` validation → 400 `{ code: "VALIDATION_ERROR", message: "Enter a valid date in YYYY-MM-DD format" }`:
  required, single string (repeated params rejected), strict `YYYY-MM-DD`, real calendar date,
  years 0001–9999, complete containing week AND month boundaries within range. Authentication runs first.
- Pure proleptic-Gregorian calendar math in `app/server/src/lib/calendar.ts` (no `Date`, no time zones,
  no JS year-0–99 pitfalls).

**Client** (`app/client/src`, API → TanStack Query → page):
- `Progress date` text input above the habit list, `data-testid="goal-progress-date"`, defaults to today in
  the browser's local calendar, resets to today on fresh load, not persisted. Invalid/empty input shows
  `Enter a valid date in YYYY-MM-DD format` (`goal-progress-date-error`), hides progress, sends no request.
- Per active habit with a goal: `{completedCount} of {targetCount} completed this week|month`,
  `{periodStart} – {periodEnd}` (`goal-progress-period-*`, en dash, `YYYY-MM-DD`), `Goal reached` (`goal-achieved-*`),
  and a `role="progressbar"` named `Progress for {habit name}`, `aria-valuemin=0`, `aria-valuemax=100`,
  `aria-valuenow={percentage}` (`goal-progress-bar-*`); container `goal-progress-*`. `No goal` unchanged;
  archived hidden; habit order kept; SPEC-001 goal wording and Set goal / Edit / Remove controls unchanged.
- Loading: `Loading progress...` (`goal-progress-loading`), previous values hidden. Failure: `Could not load
  progress.` (`goal-progress-error`) + `Retry` (`goal-progress-retry`) which re-requests the currently selected
  valid date; habit list and goal controls stay available; no unhandled exceptions.
- Separate query-key family `goalProgress` = `['goal-progress', date]`; progress invalidated after successful
  goal create/update/remove and entry create/update/delete (plus habit archive/rename/delete/reorder);
  returning to Goals shows current progress without reload; `staleTime: 0`, `retry: false`, auto-retry disabled.
- All required `data-testid`s added.

## 2. Changed and new files

### Server
- **NEW** `app/server/src/lib/calendar.ts` — pure calendar-date library (`parseCalendarDate`, `weeklyPeriod`,
  `monthlyPeriod`, `isValidProgressDate`, day-number conversions, weekday, leap-year, range checks).
- **NEW** `app/server/src/services/progress.service.ts` — progress computation + read-only Prisma query
  (`getGoalProgress`, `PROGRESS_DATE_ERROR`, `computeRemainingCount`, `computePercentage`, `computeAchieved`,
  `periodBoundsFor`).
- **MOD** `app/server/src/controllers/goals.controller.ts` — `progress` controller + Zod `date` validation.
- **MOD** `app/server/src/routes/goals.routes.ts` — `router.get("/progress", ...)` registered first.
- **NEW** `app/server/tests/unit/calendar.test.ts` — 35 unit tests (optional; does not touch protected tests).

### Client
- **NEW** `app/client/src/utils/progressDate.ts` — client mirror of progress-date rules + `todayLocalISODate`.
- **MOD** `app/client/src/types/index.ts` — `GoalProgress` type.
- **MOD** `app/client/src/api/goals.ts` — `getGoalProgress`.
- **MOD** `app/client/src/api/queryKeys.ts` — `goalProgress` key family incl. reference date.
- **MOD** `app/client/src/hooks/useGoals.ts` — `useGoalProgress`; progress invalidation on goal mutations.
- **MOD** `app/client/src/hooks/useEntries.ts` — progress invalidation on entry mutations.
- **MOD** `app/client/src/hooks/useHabits.ts` — progress invalidation on habit update/delete/reorder.
- **MOD** `app/client/src/pages/GoalsPage.tsx` — progress date input, per-habit progress block, loading/error/Retry,
  all `data-testid`s; existing markup/controls preserved.

No changes to `app/server/prisma/schema.prisma`, no migrations, no protected acceptance/support files,
no `specs/`, `agents/`, `scripts/`, auth, Docker, or `.env`. No new dependencies. No schema changes / no data migration.

## 3. Final results

- `npm --prefix app/server test` → **130 passed (4 files)**. Protected acceptance: SPEC-001 `001-goals` 31/31,
  SPEC-002 `002-progress` 62/62, `harness` 2/2; plus my 35 new unit tests. `test:acceptance` → 93/93.
- `npm --prefix app run build` → **success** (server `tsc` + client `tsc` + Vite + PWA build).
- Protected tests in `app/server/tests/acceptance/` and `app/server/tests/support/` unchanged.

## 4. Decisions the spec did not state explicitly

- **Progress date input type**: `type="text"` + own `YYYY-MM-DD` validation (label `Progress date`,
  `inputmode="numeric"`, placeholder) rather than native `type="date"`, so empty/invalid input reliably
  renders `Enter a valid date in YYYY-MM-DD format`, hides progress, and suppresses requests (native
  `type="date"` would silently clear invalid input and cannot be filled with garbage in automated tests).
- **Client mirror of validation**: same rules client-side purely to avoid sending requests; server remains
  authoritative. `retry: false` + explicit Retry for progress, overriding the app-wide `retry: 1`.
- **Loading semantics**: show `Loading progress...` whenever `isFetching || isPending` and hide progress;
  hide progress + loading when date invalid or progress request failed.
- **Habit-change invalidation**: also invalidate `goalProgress` on habit update/delete/reorder (archiving,
  renames, ordering affect progress) — not required but consistent.
- **Defensive counting**: entries whose stored `date` string is not a strict valid calendar date are not
  counted (SPEC-001 entry creation only regex-checks `YYYY-MM-DD`; impossible dates can't reach a period
  anyway for normal `YYYY-MM-DD` strings, this guards pathological stored values).
- **Year-range reading**: `date` valid iff year 0001–9999 AND complete containing week (Monday–Sunday)
  AND complete containing month have boundaries within 0001-01-01..9999-12-31 (the spec's
  "containing week or month"; containing month is always in range, containing week can overflow at edges).
- **`Goal reached`** driven by server `achieved`; **period wording** week/month from `period`.
- **Keep habit order** from the habit list (server progress separately ordered per spec).

## 5. Open problems

- No Playwright/browser tooling in this environment, so UI1–UI10 scenarios and screenshots were **not
  executed** here; UI behaviour was implemented to spec (texts, `data-testid`s, navigation/refresh,
  mobile-friendly wrapping) and server + build verified. The Verifier should run UI1–UI10 and produce
  `screenshots/` + `verification.json`.
- UI checks are reasoned, not browser-verified, in this run.

RESULT: IMPLEMENTED
