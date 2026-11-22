# Implementer report: 001-goals

## 1. Summary

Built habit goals (weekly or monthly target per habit) as described in `specs/001-goals/spec.md`:

- **DB:** `Goal` model (exactly as in spec §4) plus `goal Goal?` on `Habit`; migration `add_goals`
  (`20261122182616_add_goals`) with a unique `habitId` and `ON DELETE CASCADE`.
- **Server:** `GET/POST /api/goals`, `PUT/DELETE /api/goals/:id`. All behind `requireAuth`, using the
  `{ data, error }` format. Pattern is routes → controller (zod) → service. Error codes: `VALIDATION_ERROR` (400),
  `HABIT_NOT_FOUND` (404), `GOAL_EXISTS` (409), `GOAL_NOT_FOUND` (404).
  For PUT, validation runs on the merged goal (existing values + body), so `MONTHLY 20` → `{period:"WEEKLY"}` returns 400.
- **Client:** new `/goals` page (`GoalsPage`), `GoalForm` modal (react-hook-form + zod, `noValidate`),
  `api/goals.ts`, `hooks/useGoals.ts` (TanStack Query), `Goal` type, and a `Goals` nav item with the lucide `Target`
  icon after "Habits" in `SideNav` and `BottomNav`. All `data-testid`s from spec §7 are present.

## 2. Changed / new files

New:
- `app/server/prisma/migrations/20261122182616_add_goals/migration.sql`
- `app/server/src/services/goals.service.ts`
- `app/server/src/controllers/goals.controller.ts`
- `app/server/src/routes/goals.routes.ts`
- `app/client/src/api/goals.ts`
- `app/client/src/hooks/useGoals.ts`
- `app/client/src/components/goals/GoalForm.tsx`
- `app/client/src/pages/GoalsPage.tsx`

Changed:
- `app/server/prisma/schema.prisma`: `Goal` model, `Habit.goal`
- `app/server/src/routes/index.ts`: mounts `/goals`
- `app/client/src/App.tsx`: route `goals`
- `app/client/src/api/queryKeys.ts`: `goals.all`
- `app/client/src/types/index.ts`: `Goal`, `GoalPeriod`
- `app/client/src/hooks/useHabits.ts`: `useDeleteHabit` also invalidates the goals cache, because the cascade delete removes the goal
- `app/client/src/components/layout/SideNav.tsx`, `BottomNav.tsx`: Goals nav item
- `app/server/prisma/migrations/migration_lock.toml`: **line endings only** (LF vs CRLF), rewritten by
  `prisma migrate dev`. The content is the same. I could not revert it (`git checkout` is not permitted for this agent).

## 3. Final results

- `npm --prefix app/server test`: **2 files, 33 tests passed** (31 in `tests/acceptance/001-goals.test.ts`, 2 in harness).
- `npm --prefix app run build`: **succeeds** (server `tsc`; client `tsc` + Vite build + PWA).

UI scenarios UI1–UI9 were not clicked through; the verifier agent does that.

## 4. Decisions not explicitly stated in the spec

1. **Test id for `Set goal`:** the spec lists `goal-edit-{habitId}` but no separate id for `Set goal`. The `Set goal`
   button uses `goal-edit-{habitId}` too (only one of the two buttons is shown at a time).
2. **Client "whole number" check:** after trimming, the input must match `^-?\d+$`, otherwise it shows `Enter a whole number`.
   So a negative whole number such as `-3` shows the range message (`Weekly goal must be between 1 and 7`).
3. **Server error messages** use the same texts as the UI table (e.g. `Weekly goal must be between 1 and 7`). Non-integer
   or missing `targetCount` → `Enter a whole number`. Invalid period → zod's enum message. If the server rejects a save,
   the form shows the server's `error.message` in `goal-error` and the modal stays open.
4. **Modal title:** `Goal for {habit name}` (the spec does not give one).
5. **Empty state link text:** `Go to Habits`, linking to `/habits`, under the text `No habits yet.`.
6. **Order:** the page uses `useHabits()` (active habits, same `sortOrder, createdAt` order as the Habits page).
   `GET /api/goals` is ordered by `createdAt asc`.
7. **Number input:** `<input type="number">` with `noValidate` on the form, as the spec requires.
   Some browsers report a non-numeric value as an empty string, which also maps to `Enter a whole number`.

## 5. Open problems

- `migration_lock.toml` has a line-ending-only change (see §2). The runner or reviewer can revert it with
  `git checkout -- app/server/prisma/migrations/migration_lock.toml` before committing, or keep it (no functional effect).
- No unit tests added. The validation logic is small and fully covered by the acceptance tests.

RESULT: IMPLEMENTED
