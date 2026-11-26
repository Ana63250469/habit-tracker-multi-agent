# Tester report — SPEC-002 Goal Progress

**Run:** `runs/002-progress/2026-11-26T16-38-42_tester/`
**Spec:** `specs/002-progress/spec.md` (id `002-progress`, depends on SPEC-001 Habit Goals, which is implemented)
**Test file created:** `app/server/tests/acceptance/002-progress.test.ts` (the only file added; no application code, helpers, spec, or package files changed; SPEC-001 tests untouched)

## Step 1 — Spec review

**No blocking gaps.** Every API acceptance criterion (AC1–AC10 in §6) has a precise expected
status code, body shape, and values; error contract is exact (`400` + `VALIDATION_ERROR` +
`Enter a valid date in YYYY-MM-DD format`, `401` existing auth format); period rules, counting
rules, and arithmetic (`remainingCount`, `achieved`, `percentage`) are unambiguous; response
ordering and exclusions are specified. Non-blocking observations are listed under **Spec remarks**.

## Step 2/3 — Tests written and run

Black-box Vitest + Supertest through `api()`; setup uses `resetDb()` + `createHabit()` and existing
HTTP APIs (`POST/PUT/DELETE /api/goals`, `POST/PUT/DELETE /api/entries`, `PUT/DELETE /api/habits`,
`PUT /api/habits/reorder`); `resetDb()` in `beforeEach`; **fixed dates** (`2026-11-24`, etc., never
the machine's current date); status code **and** relevant body fields asserted; every test name
prefixed with its criterion number; tests independent.

Command run from repo root: `npm --prefix app/server run test:acceptance`
(also cross-checked with `npm --prefix app/server test` for full regression).

## Results

### New tests (SPEC-002, `tests/acceptance/002-progress.test.ts`)

- **62 tests total.**
- **58 failed** because `GET /api/goals/progress` does not exist yet (`404` where `200`/`400`
  expected) — i.e. failure due to **missing feature**, **not** syntax or import errors (no
  collection/transform errors; every test's setup through the existing APIs succeeds).
- **4 passed** already: the **AC10 authentication** tests. SPEC-002 §6 explicitly allows this:
  *"New SPEC-002 tests should fail before implementation because the progress feature is missing.
  Already working behaviour, such as authentication, may produce passing new tests."* Authentication
  (`requireAuth`, `401`, auth before date validation) already works on `/api/goals`.
- No test was weakened or changed to force failure.

### Existing tests (regression, reported separately)

- **`npm --prefix app/server run test:acceptance`:** `tests/acceptance/001-goals.test.ts`
  **31/31 passed** (SPEC-001). With my file added, acceptance totals **93 tests: 35 passed / 58 failed**,
  the 58 being only my new SPEC-002 tests.
- **`npm --prefix app/server test` (full suite):** **95 tests: 37 passed / 58 failed** —
  SPEC-001 **31 passed** + `tests/harness.test.ts` **2 passed** + my new file **4 passed / 58 failed**.
  **No pre-existing test regressed.**

Per SPEC-002 §6, run SPEC-001 as regression; it passes unchanged.

## Criterion → test names

All tests are in `app/server/tests/acceptance/002-progress.test.ts`, inside
`describe("SPEC-002 goal progress API")`. (Full Vitest name = `SPEC-002 goal progress API > <suite> > <name>`.)

### AC1 — Weekly progress
Suite `AC1: weekly progress`:
- `AC1: weekly target 3 with two entries returns completed 2, remaining 1, percentage 66, achieved false, correct ids and period`
  — asserts status 200, `error: null`, exactly one item, `goalId`, `habitId`, `period: "WEEKLY"`,
  `targetCount: 3`, `periodStart: "2026-11-23"`, `periodEnd: "2026-11-29"`, `completedCount: 2`,
  `remainingCount: 1`, `percentage: 66`, `achieved: false`. Reference `2026-11-24`, two matching
  entries on `2026-11-23` + `2026-11-26`.
- `AC1: two entries on the same date both count` — two entries on `2026-11-24`, weekly target 3 →
  `completedCount 2`, `remainingCount 1`, `percentage 66`, `achieved false`.

### AC2 — Monthly progress
- `AC2: monthly target 4 with two entries returns completed 2, remaining 2, percentage 50, achieved false, correct period dates`
  — `period: "MONTHLY"`, `targetCount: 4`, `periodStart: "2026-11-01"`, `periodEnd: "2026-11-30"`,
  `completedCount: 2`, `remainingCount: 2`, `percentage: 50`, `achieved: false`, correct ids;
  reference `2026-11-24`; entries `2026-11-05` + `2026-11-24`.

### AC3 — Counts / remaining / percentage / achieved
Suite `AC3: counts, remaining, percentage, achieved`:
- `AC3: zero entries gives completed 0, remaining equal to target, percentage 0, achieved false`
- `AC3: a goal with no matching entries has zero progress (entries outside the period do not count)`
  — entries `2026-11-22` + `2026-11-30` around a weekly period `2026-11-23`..`2026-11-29` → zero.
- `AC3: exactly reaching the target gives remaining 0, percentage 100, achieved true`
  — weekly target 2, two entries → `completedCount 2`, `remainingCount 0`, `percentage 100`, `achieved true`.
- `AC3: exceeding the target preserves the actual count and caps percentage at 100`
  — weekly target 3, **four** entries (two on the same date) → `completedCount 4`, `remainingCount 0`,
  `percentage 100`, `achieved true` (actual count preserved, e.g. "4 of 3").

### AC4 — Weekly boundaries
- `AC4: reference 2026-11-24 gives weekly bounds 2026-11-23..2026-11-29; boundary entries count, Nov 22 and Nov 30 do not; entry on Nov 29 counts though after reference date`
  — `periodStart "2026-11-23"`, `periodEnd "2026-11-29"`; entries on `2026-11-23` (Mon) & `2026-11-29`
  (Sun, after reference) count; entries on `2026-11-22` & `2026-11-30` do not → `completedCount 2`.

### AC5 — Period boundaries
Suite `AC5: period boundaries`:
- `AC5: monthly boundaries for November 2026 include Nov 1 and Nov 30, exclude Oct 31 and Dec 1`
  — `2026-11-01` & `2026-11-30` count; `2026-10-31` & `2026-12-01` excluded; bounds `2026-11-01`..`2026-11-30`.
- `AC5: February 2028 monthly period includes February 29 (leap year)`
  — reference `2028-02-15`, bounds `2028-02-01`..`2028-02-29`; `2028-02-29` counts; `2028-01-31` & `2028-03-01` excluded.
- `AC5: reference 2027-01-01 gives weekly bounds 2026-12-28..2027-01-03`
  — `periodStart "2026-12-28"`, `periodEnd "2027-01-03"`; `2026-12-28` & `2027-01-03` count;
  `2026-12-27` & `2027-01-04` excluded; weekly target 7.

### AC6 — Which habits appear & order
Suite `AC6: which habits appear and in which order`:
- `AC6: ordered by habit sortOrder, then createdAt, then id, ascending`
  — order follows habit `sortOrder` regardless of goal-creation order; `PUT /api/habits/reorder` reorders;
  (the `id` tie-break cannot be forced black-box — see remarks).
- `AC6: equal sortOrder falls back to createdAt order, ascending` — both `sortOrder 0`, created first → first.
- `AC6: only active habits with goals appear; archived habits are excluded` — archived-with-goal and no-goal excluded.
- `AC6: counts do not leak between habits` — entries on habit A don't affect habit B; `goalId`/`habitId` correct per item.
- `AC6: no goals returns an empty array` — `{ data: [], error: null }`.
- `AC6: habits without goals do not produce progress items even with entries`.
- `AC6: progress request does not modify habits, goals, or entries` — snapshot via `GET /api/habits`
  (`includeArchived=true`), `GET /api/goals`, `GET /api/entries` before/after identical.

### AC7 — Recalculation (progress calculated when requested; no stored counters)
Suite `AC7: recalculation`:
- `AC7: adding an entry changes the next response` — 0→1, `remaining`/`percentage` recomputed (1/3 → `percentage 33`).
- `AC7: deleting an entry changes the next response`.
- `AC7: editing only an entry's notes does not change the completion count` — `PUT /api/entries/:id`, count stable.
- `AC7: editing only an entry's time does not change the completion count`.
- `AC7: editing time/notes does not move an entry between periods (date unchanged)`.
- `AC7: changing the goal's target recalculates progress` — `PUT /api/goals/:id` target 3→2→4 (`PUT`, not a stored counter).
- `AC7: changing the goal's period recalculates progress` — `WEEKLY→MONTHLY` recalculates bounds/count.
- `AC7: entries created before the goal was created still count` — entry created, then goal; counts by `HabitEntry.date`, not `createdAt`.

(UI-level refresh/invalidation in §2/§7 — invalidate progress queries after entry/goal changes, `Loading progress...`,
`Could not load progress.` + `Retry`, etc. — is for the Verifier/Implementer, not this API test.)

### AC8 — Archiving / removing
Suite `AC8: archiving, removing goals, deleting habits`:
- `AC8: archiving a habit excludes its goal from progress` — `PUT /api/habits/:id {archived:true}`.
- `AC8: unarchiving restores the goal with its progress` — `archived:false`, counts intact.
- `AC8: removing a goal removes it from progress results` — `DELETE /api/goals/:id`.
- `AC8: deleting a habit removes it from progress results` — `DELETE /api/habits/:id`.

### AC9 — Date validation (`GET /api/goals/progress?date=YYYY-MM-DD`)
Suite `AC9: date validation`. Invalid input → **400**, `data: null`, `error.code "VALIDATION_ERROR"`,
`error.message "Enter a valid date in YYYY-MM-DD format"`. Rejected cases (26 generated):
**all values the criterion lists**, plus extras from §5:
- `AC9: rejects missing date with 400 VALIDATION_ERROR`
- `AC9: rejects missing date with empty query with 400 VALIDATION_ERROR`
- `AC9: rejects empty date with 400 VALIDATION_ERROR` (`?date=`)
- `AC9: rejects empty date without value with 400 VALIDATION_ERROR` (`?date`)
- `AC9: rejects wrong order format 24-11-2026 with 400 VALIDATION_ERROR`
- `AC9: rejects impossible date 2026-02-30 with 400 VALIDATION_ERROR`
- `AC9: rejects impossible month 2026-13-01 with 400 VALIDATION_ERROR`
- `AC9: rejects repeated date parameters with 400 VALIDATION_ERROR` (`?date=2026-11-24&date=2026-11-25`)
- `AC9: rejects repeated identical date parameters with 400 VALIDATION_ERROR` (`?date=2026-11-24&date=2026-11-24`)
- `AC9: rejects no separators 20261124 with 400 VALIDATION_ERROR`
- `AC9: rejects single-digit month 2026-1-01 with 400 VALIDATION_ERROR`
- `AC9: rejects single-digit day 2026-01-1 with 400 VALIDATION_ERROR`
- `AC9: rejects year only 2026 with 400 VALIDATION_ERROR`
- `AC9: rejects month only 2026-11 with 400 VALIDATION_ERROR`
- `AC9: rejects extra time component with 400 VALIDATION_ERROR` (`2026-11-24T00:00:00Z`)
- `AC9: rejects trailing whitespace with 400 VALIDATION_ERROR`
- `AC9: rejects leading whitespace with 400 VALIDATION_ERROR`
- `AC9: rejects trailing junk with 400 VALIDATION_ERROR`
- `AC9: rejects non-date string with 400 VALIDATION_ERROR`
- `AC9: rejects non-leap-year Feb 29 2026-02-29 with 400 VALIDATION_ERROR`
- `AC9: rejects day 00 with 400 VALIDATION_ERROR`
- `AC9: rejects day 32 with 400 VALIDATION_ERROR`
- `AC9: rejects month 00 with 400 VALIDATION_ERROR`
- `AC9: rejects year 0000 with 400 VALIDATION_ERROR`
- `AC9: rejects non-string object value with 400 VALIDATION_ERROR` (`?date[a]=2026-11-24`)
- `AC9: rejects non-string array value with 400 VALIDATION_ERROR` (`?date[]=2026-11-24`)
Accepted:
- `AC9: 2028-02-29 (leap day) is accepted with 200` — `{ data: [], error: null }`.
- `AC9: a plain valid date is accepted with 200`.
  (SPEC-002 §5 registration order `/progress` before `/:id` is exercised by every `GET /api/goals/progress`
  succeeding; see remarks re. the not-in-AC year-range clause.)

### AC10 — Authentication
Suite `AC10: authentication` (JWT `requireAuth`, `{ data: null, error: { code: "UNAUTHORIZED", ... } }`;
**these 4 already pass** on current code, per §6):
- `AC10: request without a token returns 401 with a valid date`
- `AC10: request without a token returns 401 with no date`
- `AC10: request with an invalid token returns 401`
- `AC10: authentication runs before date validation (no token + invalid date returns 401, not 400)`

## Spec remarks (non-blocking)

1. **§5 year-range clause not mapped to a numbered AC.** *"Accept years from `0001` to `9999` only when
   the complete containing week or month also has boundaries within that range."* Intent is clear
   (reject e.g. year `0000`, and reject in-range years whose complete Monday–Sunday week would extend
   into year `0000`/`10000`, since `periodStart`/`periodEnd` must stay in range). But it is not
   attached to AC1–AC10, and three sub-points are unpinned: (a) check containing **week**, **month**,
   or **both**; (b) containing **month** can never fall outside `0001`–`9999` once the date itself is
   in range, while a **week** can straddle the boundary, so in practice only the week check bites;
   (c) whether it applies when no goals exist / regardless of goal period. AC9's explicit reject list
   (which my tests fully cover) doesn't include these edge years. **Suggest:** confirm reading and add
   an AC (e.g. `0001-01-01`, `9999-12-31`, plus a day adjacent to `0001`/`9999` week boundaries).
   Not blocking; my tests don't assert it. *(My reading: strict `YYYY-MM-DD`, year `0001`–`9999`,
   complete containing week in range, containing month trivially in range.)*
2. **Ordering `id` tie-break not black-box testable.** §5 orders by habit `sortOrder`, then `createdAt`,
   then `id`, ascending. `id`s are server-generated CUIDs not settable via API, and forcing equal
   `sortOrder` + equal `createdAt` isn't reliable over HTTP. I test `sortOrder`, then `createdAt`, then
   reorder; not `id`. **Suggest:** note that implementations must add `id` as final sort key.
3. **`PUT /api/entries/:id` requires `time`.** Existing SPEC-001 endpoint: `time` is `.nullable()` but
   not `.optional()`, so an "edit notes only" request must resend the current `time`. §2 says editing
   only time or only notes must not change counts (it doesn't; counts key off `date`). §5 says existing
   entry endpoints retain current behaviour. My tests resend `time`. **Suggest:** clarify wording or
   consider `time.optional()` in the existing endpoint.
4. **`PUT /api/goals/:id` re-validates combined period+target** (SPEC-001): changing period can fail
   (e.g. `MONTHLY→WEEKLY` with `targetCount > 7` → `400`). Not contradicting SPEC-002; my period test
   uses target 3. **Suggest:** nothing; just noting interaction.
5. **Existing `POST /api/entries` validates `date` only as `YYYY-MM-DD` shape**, not real calendar
   dates, so impossible entry dates (e.g. `2026-02-30`) can be stored. SPEC-002's `date`-param
   validation is stricter and unaffected; progress math says treat `HabitEntry.date` as calendar dates.
   My tests create valid entries only. **Suggest:** remark for implementer; not a blocker.
6. **No gap in status codes/wording.** All required strings (`Loading progress...`, `Could not load progress.`,
   `Retry`, `Goal reached`, `No goal`, period wording, `Progress for {habit name}`, `progressbar`,
   `Enter a valid date in YYYY-MM-DD format`, `Progress date`, `data-testid`s) are explicit in §2/§7.
7. **"Already working behaviour may pass"** (§6) reconciles with my agent instruction that all new tests
   should fail: my 4 AC10 auth tests pass already; **no test was altered to force failure.**
8. **UI section** (`Progress date`, invalidation, loading/error/retry, mobile, `data-testid`s) is for the
   Verifier (Playwright); my deliverable is API-only.

## What was not done

- No application code, schema, migrations, auth, helpers (`tests/support/*`), spec, agents, scripts, or
  package files were modified. No commits. No `questions.md` (no blocking gaps).
- SPEC-001 acceptance file unchanged.
