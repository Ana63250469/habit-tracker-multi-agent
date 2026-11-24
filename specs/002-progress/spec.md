# SPEC-002: Goal Progress

**Status:** Ready · **App:** `app/` (React + Express + Prisma/SQLite)
**Depends on:** SPEC-001 Habit Goals

## 1. Goal

Show progress toward each habit's weekly or monthly target on the existing Goals page.

Each habit entry counts as one completion, including multiple entries on the same date.
For example, two Run entries on Monday and one on Wednesday count as 3 completions.

Keep the existing goal wording, target limits, and Set goal / Edit / Remove controls.
Streaks are not part of this spec.

## 2. Behaviour

### Reference date

Add a date input above the habit list, labelled `Progress date`.

- Default to today's date in the browser's local calendar.
- The selected date determines the week or month whose progress is displayed.
- Changing to a valid date fetches progress without reloading the page.
- Empty or invalid input shows `Enter a valid date in YYYY-MM-DD format`.
  Hide progress while the date is invalid and do not send a progress request.
- A fresh page load resets the selected date to today.

### Progress display

For each active habit with a goal, show:

- Weekly: `{completedCount} of {targetCount} completed this week`
- Monthly: `{completedCount} of {targetCount} completed this month`
- Period dates: `{periodStart} – {periodEnd}`, both formatted as `YYYY-MM-DD`
- A progress bar using the percentage calculated by the server
- `Goal reached` when the completion count meets or exceeds the target

"This week/month" refers to the selected reference date.

Habits without goals continue to show `No goal`, without a progress display.
Archived habits remain hidden. Keep the existing habit order.

If there are 4 entries for a target of 3, show `4 of 3 completed this week`,
a full progress bar, and `Goal reached`.

The progress bar must have:

- role `progressbar`
- accessible name `Progress for {habit name}`
- minimum 0, maximum 100, and current value equal to `percentage`

### Refresh

- Refresh progress after successfully creating, updating, or removing a goal.
- Invalidate progress queries after successfully creating, updating, or deleting an entry.
- Returning to Goals after changing entries must show current progress without a manual reload.
- Editing only an entry's time or notes must not change the completion count.

### Loading and errors

- While fetching progress, show `Loading progress...` and hide previous progress values.
- If fetching fails, show `Could not load progress.` with a `Retry` button.
- Retry repeats the request for the currently selected valid date.
- Keep the habit list and existing goal controls available during a progress-request failure.
- Handle failures without an unhandled application exception.

## 3. Counting and date rules

- Weekly periods run Monday–Sunday, inclusive.
- Monthly periods run from the first through the last calendar day, inclusive.
- Use `HabitEntry.date` to assign entries to periods, not `createdAt`.
- Treat dates as calendar dates; do not shift entry dates between time zones.
- Count each entry separately, even when several entries share the same date.
- Count all entries within the selected period, including entries after the reference date
  but still within that period.
- Entries outside the period do not count.
- Entries logged before the goal was created still count.
- Calculate using the goal's current period and target.
- Keep counts independent between habits.
- A goal with no matching entries has zero progress.

Calculations:

- `completedCount`: actual number of matching entries; may exceed the target.
- `remainingCount = max(targetCount - completedCount, 0)`
- `achieved = completedCount >= targetCount`
- `percentage = min(100, floor(completedCount / targetCount * 100))`

Existing target limits remain unchanged: weekly 1–7, monthly 1–31.
These limits restrict the target, not the number of entries a user can log.

## 4. Data model

Use the existing `Goal`, `Habit`, and `HabitEntry` models.

Progress is calculated when requested. Do not store progress counters.
No schema changes, database migrations, or changes to existing data are required.

## 5. API

Add:

`GET /api/goals/progress?date=YYYY-MM-DD`

Use existing JWT authentication (`requireAuth`) and the `{ data, error }` response format.
Authentication must run before date validation.

Register `/progress` before any route that could interpret `progress` as a goal ID.

### Query validation

`date` is required and must be a single valid calendar date in `YYYY-MM-DD` format.

Accept years from `0001` to `9999` only when the complete containing week or month
also has boundaries within that range. Otherwise return the validation error below.

Reject:

- missing or empty date
- non-string values or repeated date parameters
- incorrectly formatted dates
- impossible dates such as `2026-02-30`

Invalid input returns status 400:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Enter a valid date in YYYY-MM-DD format"
  }
}
```

Without a valid token, return status 401 using the existing authentication error format.

### Success

Return status 200 with one item for each goal belonging to an active habit.

Order by the habit's `sortOrder`, then `createdAt`, then `id`, ascending.

Example: reference date `2026-11-24`, weekly target 3, and 2 matching entries:

```json
{
  "data": [
    {
      "goalId": "goal-id",
      "habitId": "habit-id",
      "period": "WEEKLY",
      "targetCount": 3,
      "periodStart": "2026-11-23",
      "periodEnd": "2026-11-29",
      "completedCount": 2,
      "remainingCount": 1,
      "percentage": 66,
      "achieved": false
    }
  ],
  "error": null
}
```

A monthly goal for the same reference date uses `2026-11-01` through `2026-11-30`.

- Exclude archived habits and habits without goals.
- No matching goals returns `{ "data": [], "error": null }`.
- The endpoint must not modify data.
- Existing goal and entry endpoints retain their current behaviour.

## 6. Acceptance criteria

### API

The Tester creates:

`app/server/tests/acceptance/002-progress.test.ts`

Use Vitest, Supertest, the existing helpers, and the separate test database.
Create habits, goals, and entries through the existing HTTP APIs.
Use fixed dates rather than the computer's current date.

Each test checks the status code and relevant response fields.
Prefix test names with the criterion number, for example `AC1: ...`.

| AC | Required checks |
| --- | --- |
| AC1 | Weekly target 3 with two entries returns completed 2, remaining 1, percentage 66, achieved false, and correct goal/habit IDs and period. Two entries on the same date both count. |
| AC2 | Monthly target 4 with two entries returns completed 2, remaining 2, percentage 50, achieved false, and correct period dates. |
| AC3 | Zero entries gives completed 0, remaining equal to target, percentage 0, achieved false. Exactly reaching the target gives remaining 0, percentage 100, achieved true. Exceeding it preserves the actual count and caps percentage at 100. |
| AC4 | Reference `2026-11-24` gives weekly bounds `2026-11-23`–`2026-11-29`. Entries on both boundaries count; entries on November 22 and 30 do not. An entry on November 29 counts even though it is after the reference date. |
| AC5 | Check monthly boundaries using November 2026, including November 1 and 30 and excluding October 31 and December 1. Check February 2028 including February 29. Reference `2027-01-01` gives weekly bounds `2026-12-28`–`2027-01-03`. |
| AC6 | Only active habits with goals appear, in the specified order. Counts do not leak between habits. No goals returns an empty array. |
| AC7 | Adding or deleting an entry changes the next response. Editing notes/time does not change the count. Changing the goal's target or period recalculates progress. Entries created before the goal also count. |
| AC8 | Archiving excludes a goal; unarchiving restores it with its progress. Removing a goal or deleting its habit removes it from progress results. |
| AC9 | Missing date, empty date, `24-11-2026`, `2026-02-30`, `2026-13-01`, and repeated date parameters return 400 with the specified error code/message. `2028-02-29` is accepted. |
| AC10 | Requests without a token return 401, both with a valid date and with no date. |

Run the existing SPEC-001 tests as regression checks; they should continue passing.
New SPEC-002 tests should fail before implementation because the progress feature is missing.
Already working behaviour, such as authentication, may produce passing new tests.

Do not change tests merely to force every new test to fail.
Report existing and new test results separately.

### UI

The Verifier uses Playwright MCP and runs scenarios in order.
Save one screenshot per scenario and record PASS/FAIL with expected and observed behaviour.

Fresh seed:

- User: `test` / `test1234`
- Active habits: `Run`, `Read`
- Archived habit: `Old`
- No goals or entries

At the start, record the browser's local calendar date as D.
Use D for entry dates and the Progress date throughout verification.
If the date changes during the run, report the run as incomplete and restart with fresh data.

| ID | Steps | Expected |
| --- | --- | --- |
| UI1 | Log in and open Goals. | Progress date defaults to D. Run and Read show `No goal`; Old is hidden. |
| UI2 | Set Run to Weekly, target 3. | `0 of 3 completed this week`, correct Monday–Sunday dates, progress value 0, and no `Goal reached`. |
| UI3 | Open Today at D, add two Run entries, and return to Goals. | Without a manual reload, Run shows `2 of 3 completed this week`; progress value is 66. |
| UI4 | Add a third Run entry at D and return to Goals. | `3 of 3 completed this week`, progress value 100, and `Goal reached`. |
| UI5 | Add a fourth Run entry at D and return to Goals. | `4 of 3 completed this week`; progress remains 100 and `Goal reached` remains visible. |
| UI6 | Delete one Run entry and return to Goals; then delete another and return again. | After the first deletion: 3 of 3 and achieved. After the second: 2 of 3, progress 66, and no achieved label. Save the screenshot of the final state and record both observations. |
| UI7 | Edit Run's goal to Monthly, target 4. Reload after checking the updated row. | `2 of 4 completed this month`, correct calendar-month dates, and progress 50. The same progress appears after reload. |
| UI8 | Change Progress date to the first day of the next month, then back to D. | Next month shows 0 of 4; returning to D shows 2 of 4. Save the screenshot after returning to D and record both observations. |
| UI9 | Remove Run's goal and confirm. | Run shows `No goal`; its progress display disappears. Read remains unchanged. |
| UI10 | Set viewport to 390 × 844 and open Goals through mobile navigation. Then visit Today, Week, Month, and Habits. | Goals controls fit without horizontal page overflow. Existing pages remain usable, with no application JavaScript errors. Save the Goals screenshot before visiting the other pages. |

Save screenshots in the run's `screenshots/` directory as `UI1.png` through `UI10.png`.
Produce `verification.json` and `report.md` using the existing Verifier output format.

## 7. Rules for agents

- Follow the existing server structure: routes → controllers → services, with Zod validation.
- Follow the existing client structure: API → TanStack Query hooks → pages.
- Keep progress calculations on the server.
- Use a separate query-key family for progress, including the reference date.
- Preserve SPEC-001 goal controls, wording, validation, and API behaviour.
- Add these `data-testid`s:
  - `goal-progress-date`
  - `goal-progress-date-error`
  - `goal-progress-{habitId}`
  - `goal-progress-period-{habitId}`
  - `goal-progress-bar-{habitId}`
  - `goal-achieved-{habitId}`
  - `goal-progress-loading`
  - `goal-progress-error`
  - `goal-progress-retry`
- Work on branch `feature/spec-002-progress`.
- The Tester may create only the new SPEC-002 acceptance file and its run outputs.
  Do not modify SPEC-001 acceptance tests.
- The Implementer must not modify acceptance tests or test-support files.
- Do not change schema, migrations, authentication, Docker files, or `.env`.
- Do not modify `agents/`, `scripts/`, or specifications during implementation.
- New dependencies are not allowed except test-only development dependencies.
- If requirements conflict or block implementation, stop and report the question.

The SPEC-002 testing guidance in section 6 takes precedence over generic wording
that expects every acceptance test to fail before implementation.

## 8. Done when

- All existing and new server tests pass.
- UI1–UI10 pass, with screenshots and observations as evidence.
- `npm run build` succeeds from `app/`.
- Protected tests remain unchanged during implementation.
- Reports and metrics are saved for human review.
- A PR with the implementation and evidence is ready for human review.
- A human decides whether to merge.

## 9. Out of scope

Streaks, reminders, historical target tracking, editing entry dates, changing target limits,
new database models, automatic merging, and unrelated refactoring.