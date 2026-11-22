# Tester report: SPEC-001 Habit Goals

Test file: `app/server/tests/acceptance/001-goals.test.ts`

## 1. Criterion → tests

| AC  | Tests |
| --- | ----- |
| AC1 | `AC1: POST a valid weekly goal returns 201 and GET returns it` |
| AC2 | `AC2: rejects weekly target 0 / 8 / 2.5 with 400`, `AC2: rejects weekly goal with missing target with 400`, `AC2: rejects monthly target 0 / 32 with 400`, `AC2: accepts boundary WEEKLY 1 / WEEKLY 7 / MONTHLY 1 / MONTHLY 31 with 201` (11 tests) |
| AC3 | `AC3: rejects invalid period "DAILY" / "" / 7 with 400`, `AC3: rejects missing period with 400` (4 tests) |
| AC4 | `AC4: POST for a non-existent habit returns 404 HABIT_NOT_FOUND`, `AC4: POST for a habit that already has a goal returns 409 GOAL_EXISTS` |
| AC5 | `AC5: PUT changes period and target together with 200`, `AC5: PUT changes only the target with 200`, `AC5: PUT changes only the period with 200`, `AC5: PUT {period: "WEEKLY"} on MONTHLY 20 returns 400 and keeps the goal` |
| AC6 | `AC6: DELETE returns 200 { success: true } and the goal is gone`, `AC6: PUT an unknown id returns 404 GOAL_NOT_FOUND`, `AC6: DELETE an unknown id returns 404 GOAL_NOT_FOUND` |
| AC7 | `AC7: deleting a habit removes its goal`, `AC7: archiving a habit keeps its goal (GET includes goals of archived habits)`, `AC7: unarchiving a habit keeps its goal` |
| AC8 | `AC8: GET / POST / PUT / DELETE ... without a token returns 401` (4 tests) |

Every test checks the status code. Error tests also check `data === null` and `error.code`, and success tests check the `data` fields. Rejected writes also re-read the data through GET to confirm nothing changed.

## 2. Test run

`npm --prefix app/server run test:acceptance` → **31 tests, 31 failed, 0 passed** (as expected).
All of them fail because the feature is missing (`/api/goals` returns 404 instead of 201/400/401). None fail from syntax, import or setup errors.

## 3. Spec remarks (non-blocking)

1. **§5 API: period values.** The API table doesn't say what `period` values to send. The tests assume the values from the §4 data model comment: `"WEEKLY"` / `"MONTHLY"` (uppercase). The spec doesn't say whether lowercase `"weekly"` is accepted, so it isn't tested. Suggestion: state in §5 that `period` is `"WEEKLY" | "MONTHLY"` (case-sensitive).
2. **§5 API: 401 error code.** No code is given for 401. The tests check only the status and `data: null`. The existing middleware returns `UNAUTHORIZED`.
3. **§5 API: shape of the `Goal` response.** It isn't specified. The tests check only `id`, `habitId`, `period` and `targetCount` (the fields from the §4 model).
4. **§5 API: errors on other invalid input.** The spec doesn't say what POST should return when `habitId` is missing or not a string (presumably 400 `VALIDATION_ERROR`). This isn't tested because no criterion covers it.
5. **§3 / §5: PUT with an empty body `{}`.** Behaviour is undefined. This isn't tested.
6. **AC6:** PUT to an unknown id is tested with a valid body (`{ targetCount: 3 }`), so the expected 404 can't be confused with a 400 from validation. The spec doesn't say which check comes first.
