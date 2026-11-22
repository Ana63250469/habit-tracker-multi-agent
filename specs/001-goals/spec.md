# SPEC-001: Habit Goals

**Status:** Ready · **App:** `app/` (React + Express + Prisma/SQLite) · **Next:** SPEC-002 (progress and streaks)

## 1. Goal

The user can give each habit a **weekly or monthly target**, e.g. "Run: 3 times per week".
The user can set, edit and remove the target on a new **Goals** page.
Progress and streaks are **not** part of this spec.

## 2. Behaviour

- A new page `/goals` is added. It appears in `SideNav` and `BottomNav` after "Habits" and uses the `Target` icon from `lucide-react`.
- The page lists all **active** (not archived) habits in the same order as the Habits page.
- Each row shows the habit's color dot, emoji and name, plus the goal text:
  - `No goal`, or
  - `{n} times per week` / `{n} times per month` (`1 time per week` / `1 time per month` when n = 1).
- Each row has buttons:
  - a habit **without** a goal shows `Set goal`;
  - a habit **with** a goal shows `Edit` and `Remove`.
- `Set goal` / `Edit` opens a modal (existing `Modal` component) with:
  - **Period:** a `<select>` with `Weekly` / `Monthly`; default `Weekly`;
  - **Target:** a number input; default `1`;
  - buttons `Save` and `Cancel`.

  When editing, the fields are pre-filled with the current goal.
- `Save` with valid input closes the modal and the row updates immediately, without a page reload.
- `Save` with invalid input shows the error message from section 3. The modal stays open and nothing is saved.
- `Remove` asks `window.confirm('Remove goal for "{name}"?')`. On OK the goal is deleted and the row shows `No goal`.
- If there are no active habits, the page shows `No habits yet.` with a link to `/habits`.
- One habit has **at most one** goal.
- Deleting a habit deletes its goal. Archiving a habit keeps the goal: the habit is hidden from `/goals` and the goal shows again after unarchiving.

## 3. Validation (server and client)

| Rule                                   | UI message                              |
| -------------------------------------- | --------------------------------------- |
| target is empty or not a whole number  | `Enter a whole number`                  |
| Weekly: target must be 1–7             | `Weekly goal must be between 1 and 7`   |
| Monthly: target must be 1–31           | `Monthly goal must be between 1 and 31` |

The form uses `noValidate`, so these messages replace the browser's own validation messages.

## 4. Data model

Add to `app/server/prisma/schema.prisma` with a new migration `add_goals`. Add `goal Goal?` to `Habit`.
No other model changes.

```prisma
model Goal {
  id          String   @id @default(cuid())
  habitId     String   @unique
  period      String   // "WEEKLY" | "MONTHLY"
  targetCount Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  habit       Habit    @relation(fields: [habitId], references: [id], onDelete: Cascade)
}
```

## 5. API

All endpoints require JWT (`requireAuth`) and use the existing `{ data, error }` response format.
Errors look like `{ data: null, error: { code, message } }`.

| Method | Path             | Body                               | Success                | Errors                                            |
| ------ | ---------------- | ---------------------------------- | ---------------------- | ------------------------------------------------- |
| GET    | `/api/goals`     | –                                  | 200 `Goal[]`           | 401                                               |
| POST   | `/api/goals`     | `{ habitId, period, targetCount }` | 201 `Goal`             | 400 `VALIDATION_ERROR`, 404 `HABIT_NOT_FOUND`, 409 `GOAL_EXISTS` |
| PUT    | `/api/goals/:id` | `{ period?, targetCount? }`        | 200 `Goal`             | 400 `VALIDATION_ERROR`, 404 `GOAL_NOT_FOUND`       |
| DELETE | `/api/goals/:id` | –                                  | 200 `{ success: true }`| 404 `GOAL_NOT_FOUND`                               |

- `GET` returns all goals, including goals of archived habits.
- For `PUT`, validation applies to the resulting goal. For example, `MONTHLY 20` changed to `{ period: "WEEKLY" }` returns 400.

## 6. Acceptance criteria

**API**: the tester agent writes these as automated tests in `app/server/tests/acceptance/001-goals.test.ts`
(vitest + supertest via the helpers in `app/server/tests/support/`, separate test DB).

1. POST a valid weekly goal → 201; GET returns it.
2. POST with target 0, 8, 2.5 or missing (weekly), or 0 or 32 (monthly) → 400. Boundaries 1, 7 and 31 → 201.
3. POST with an invalid or missing period → 400.
4. POST for a non-existent habit → 404. POST for a habit that already has a goal → 409.
5. PUT changes period and/or target → 200. PUT `{period: "WEEKLY"}` on `MONTHLY 20` → 400.
6. DELETE → 200 and the goal is gone. PUT or DELETE an unknown id → 404.
7. Deleting a habit removes its goal. Archiving a habit keeps it.
8. Any goals endpoint without a token → 401.

**UI**: the verifier agent clicks through these with Playwright MCP. It saves a screenshot and records PASS/FAIL per scenario.

Seed data: user `test` / `test1234`; habits `Run` and `Read` (active) and `Old` (archived); no goals.

| #   | Steps                                                                 | Expected                                              |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| UI1 | Log in → click `Goals`                                                 | URL `/goals`; rows `Run`, `Read` with `No goal`; no `Old` |
| UI2 | `Run` → `Set goal` → Weekly, 3 → `Save`                                | Modal closes; `3 times per week`; buttons `Edit` and `Remove` |
| UI3 | Reload the page                                                        | `Run` still shows `3 times per week`                  |
| UI4 | `Run` → `Edit`                                                          | Form pre-filled with Weekly, 3                         |
| UI5 | Change to Monthly, 12 → `Save`                                          | `12 times per month`                                  |
| UI6 | `Read` → `Set goal` → Weekly, 8 → `Save`                                 | Error `Weekly goal must be between 1 and 7`; modal stays open |
| UI7 | `Cancel`                                                                | `Read` still shows `No goal`                          |
| UI8 | `Run` → `Remove` → OK                                                   | `Run` shows `No goal`                                 |
| UI9 | Open Today, Week, Month and Habits                                      | All pages work as before; no console errors           |

## 7. Rules for agents

- Follow the existing structure: server `routes → controllers → services` with zod validation; client `api → hooks (TanStack Query) → pages`, with react-hook-form for forms.
- Add these `data-testid`s: `goal-row-{habitId}`, `goal-text-{habitId}`, `goal-edit-{habitId}`, `goal-remove-{habitId}`, `goal-period`, `goal-target`, `goal-save`, `goal-cancel`, `goal-error`.
- Work on branch `feature/spec-001-goals`.
- The implementer **must not modify** `tests/acceptance/`.
- Only test libraries may be added as new dependencies.
- Do not touch `.env`, existing migrations, auth or Docker files.
- If something in this spec is unclear, stop and report the question. Do not guess.

## 8. Done when

- All acceptance tests pass.
- UI1–UI9 pass, with screenshots as evidence.
- `npm run build` succeeds.
- A PR with this evidence is ready for human review.

## 9. Out of scope

Progress and streaks (SPEC-002), multiple goals per habit, reminders, and changes to the existing habit form.
