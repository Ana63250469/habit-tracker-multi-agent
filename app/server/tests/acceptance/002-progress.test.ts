import { describe, it, expect, beforeEach } from "vitest";
import { api, auth, resetDb, createHabit } from "../support/helpers";

// Acceptance tests for SPEC-002 (Goal Progress). Black-box: HTTP API only.
// Feature under test: GET /api/goals/progress?date=YYYY-MM-DD

type Period = "WEEKLY" | "MONTHLY";

type ProgressItem = {
  goalId: string;
  habitId: string;
  period: Period;
  targetCount: number;
  periodStart: string;
  periodEnd: string;
  completedCount: number;
  remainingCount: number;
  percentage: number;
  achieved: boolean;
};

type CreatedGoal = { id: string; habitId: string; period: string; targetCount: number };
type CreatedEntry = { id: string; habitId: string; date: string; time: string | null; notes: string | null };

// Fixed reference date used throughout (never the computer's current date).
const REF = "2026-11-24";
// Reference 2026-11-24 is a Tuesday; weekly period is Monday-Sunday.
const WEEK_START = "2026-11-23";
const WEEK_END = "2026-11-29";
// Monthly period for November 2026.
const MONTH_START = "2026-11-01";
const MONTH_END = "2026-11-30";

const VALIDATION_ERROR = {
  code: "VALIDATION_ERROR",
  message: "Enter a valid date in YYYY-MM-DD format",
};

const PROGRESS_PATH = "/api/goals/progress";

async function createGoal(habitId: string, period: Period, targetCount: number): Promise<CreatedGoal> {
  const res = await api().post("/api/goals").set(auth()).send({ habitId, period, targetCount });
  if (res.status !== 201) throw new Error(`createGoal failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as CreatedGoal;
}

async function updateGoal(goalId: string, body: { period?: Period; targetCount?: number }) {
  const res = await api().put(`/api/goals/${goalId}`).set(auth()).send(body);
  if (res.status !== 200) throw new Error(`updateGoal failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as CreatedGoal;
}

async function deleteGoal(goalId: string) {
  const res = await api().delete(`/api/goals/${goalId}`).set(auth());
  if (res.status !== 200) throw new Error(`deleteGoal failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function addEntry(
  habitId: string,
  date: string,
  opts: { time?: string; notes?: string } = {}
): Promise<CreatedEntry> {
  const res = await api().post("/api/entries").set(auth()).send({ habitId, date, ...opts });
  if (res.status !== 201) throw new Error(`addEntry failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as CreatedEntry;
}

async function updateEntry(entryId: string, body: { time?: string | null; notes?: string | null }) {
  const res = await api().put(`/api/entries/${entryId}`).set(auth()).send(body);
  if (res.status !== 200) throw new Error(`updateEntry failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as CreatedEntry;
}

async function deleteEntry(entryId: string) {
  const res = await api().delete(`/api/entries/${entryId}`).set(auth());
  if (res.status !== 200) throw new Error(`deleteEntry failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function setArchived(habitId: string, archived: boolean) {
  const res = await api().put(`/api/habits/${habitId}`).set(auth()).send({ archived });
  if (res.status !== 200) throw new Error(`setArchived failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function deleteHabit(habitId: string) {
  const res = await api().delete(`/api/habits/${habitId}`).set(auth());
  if (res.status !== 200) throw new Error(`deleteHabit failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function reorderHabits(ids: string[]) {
  const res = await api().put("/api/habits/reorder").set(auth()).send({ ids });
  if (res.status !== 200) throw new Error(`reorder failed: ${res.status} ${JSON.stringify(res.body)}`);
}

/** GET /api/goals/progress with an authenticated request and a `date` query param. */
function progress(date: string) {
  return api().get(PROGRESS_PATH).set(auth()).query({ date });
}

/** GET /api/goals/progress with an authenticated request and a raw query string. */
function progressRaw(queryString: string) {
  return api().get(`${PROGRESS_PATH}${queryString}`).set(auth());
}

/** GET /api/goals/progress WITHOUT authentication. */
function progressNoAuth(queryString: string) {
  return api().get(`${PROGRESS_PATH}${queryString}`);
}

async function progressItems(date: string): Promise<ProgressItem[]> {
  const res = await progress(date);
  if (res.status !== 200) throw new Error(`progress failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as ProgressItem[];
}

function expectValidationError(res: { status: number; body: any }) {
  expect(res.status).toBe(400);
  expect(res.body.data).toBeNull();
  expect(res.body.error).toMatchObject(VALIDATION_ERROR);
}

/** Creates a habit plus a goal in one step. */
async function habitWithGoal(name: string, period: Period, targetCount: number) {
  const habit = await createHabit(name);
  const goal = await createGoal(habit.id, period, targetCount);
  return { habit, goal };
}

describe("SPEC-002 goal progress API", () => {
  beforeEach(resetDb);

  // ---------------------------------------------------------------- AC1
  describe("AC1: weekly progress", () => {
    it("AC1: weekly target 3 with two entries returns completed 2, remaining 1, percentage 66, achieved false, correct ids and period", async () => {
      const { habit, goal } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, "2026-11-23");
      await addEntry(habit.id, "2026-11-26");

      const res = await progress(REF);

      expect(res.status).toBe(200);
      expect(res.body.error).toBeNull();
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        goalId: goal.id,
        habitId: habit.id,
        period: "WEEKLY",
        targetCount: 3,
        periodStart: WEEK_START,
        periodEnd: WEEK_END,
        completedCount: 2,
        remainingCount: 1,
        percentage: 66,
        achieved: false,
      });
    });

    it("AC1: two entries on the same date both count", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, REF);
      await addEntry(habit.id, REF);

      const items = await progressItems(REF);

      expect(items).toHaveLength(1);
      expect(items[0].completedCount).toBe(2);
      expect(items[0].remainingCount).toBe(1);
      expect(items[0].percentage).toBe(66);
      expect(items[0].achieved).toBe(false);
    });
  });

  // ---------------------------------------------------------------- AC2
  it("AC2: monthly target 4 with two entries returns completed 2, remaining 2, percentage 50, achieved false, correct period dates", async () => {
    const { habit, goal } = await habitWithGoal("Read", "MONTHLY", 4);
    await addEntry(habit.id, "2026-11-05");
    await addEntry(habit.id, "2026-11-24");

    const res = await progress(REF);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      goalId: goal.id,
      habitId: habit.id,
      period: "MONTHLY",
      targetCount: 4,
      periodStart: MONTH_START,
      periodEnd: MONTH_END,
      completedCount: 2,
      remainingCount: 2,
      percentage: 50,
      achieved: false,
    });
  });

  // ---------------------------------------------------------------- AC3
  describe("AC3: counts, remaining, percentage, achieved", () => {
    it("AC3: zero entries gives completed 0, remaining equal to target, percentage 0, achieved false", async () => {
      await habitWithGoal("Run", "WEEKLY", 3);

      const items = await progressItems(REF);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ completedCount: 0, remainingCount: 3, percentage: 0, achieved: false });
    });

    it("AC3: a goal with no matching entries has zero progress (entries outside the period do not count)", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, "2026-11-22"); // Sunday before the period
      await addEntry(habit.id, "2026-11-30"); // Monday after the period

      const items = await progressItems(REF);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ completedCount: 0, remainingCount: 3, percentage: 0, achieved: false });
    });

    it("AC3: exactly reaching the target gives remaining 0, percentage 100, achieved true", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 2);
      await addEntry(habit.id, "2026-11-23");
      await addEntry(habit.id, "2026-11-29");

      const items = await progressItems(REF);

      expect(items[0]).toMatchObject({ completedCount: 2, remainingCount: 0, percentage: 100, achieved: true });
    });

    it("AC3: exceeding the target preserves the actual count and caps percentage at 100", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      // 4 entries for a target of 3, two sharing the same date.
      await addEntry(habit.id, "2026-11-23");
      await addEntry(habit.id, "2026-11-24");
      await addEntry(habit.id, "2026-11-24");
      await addEntry(habit.id, "2026-11-26");

      const items = await progressItems(REF);

      expect(items[0]).toMatchObject({ completedCount: 4, remainingCount: 0, percentage: 100, achieved: true });
    });
  });

  // ---------------------------------------------------------------- AC4
  it("AC4: reference 2026-11-24 gives weekly bounds 2026-11-23..2026-11-29; boundary entries count, Nov 22 and Nov 30 do not; entry on Nov 29 counts though after reference date", async () => {
    const { habit } = await habitWithGoal("Run", "WEEKLY", 7);
    await addEntry(habit.id, "2026-11-23"); // Monday boundary: counts
    await addEntry(habit.id, "2026-11-29"); // Sunday boundary, after reference date: counts
    await addEntry(habit.id, "2026-11-22"); // Sunday before period: does not count
    await addEntry(habit.id, "2026-11-30"); // Monday after period: does not count

    const res = await progress(REF);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      periodStart: WEEK_START,
      periodEnd: WEEK_END,
      completedCount: 2,
    });
  });

  // ---------------------------------------------------------------- AC5
  describe("AC5: period boundaries", () => {
    it("AC5: monthly boundaries for November 2026 include Nov 1 and Nov 30, exclude Oct 31 and Dec 1", async () => {
      const { habit } = await habitWithGoal("Run", "MONTHLY", 31);
      await addEntry(habit.id, "2026-11-01"); // first day: counts
      await addEntry(habit.id, "2026-11-30"); // last day: counts
      await addEntry(habit.id, "2026-10-31"); // day before period: does not count
      await addEntry(habit.id, "2026-12-01"); // day after period: does not count

      const items = await progressItems(REF);

      expect(items[0]).toMatchObject({
        periodStart: MONTH_START,
        periodEnd: MONTH_END,
        completedCount: 2,
      });
    });

    it("AC5: February 2028 monthly period includes February 29 (leap year)", async () => {
      const { habit } = await habitWithGoal("Run", "MONTHLY", 28);
      await addEntry(habit.id, "2028-02-01"); // first day: counts
      await addEntry(habit.id, "2028-02-29"); // leap day, last day: counts
      await addEntry(habit.id, "2028-01-31"); // day before period: does not count
      await addEntry(habit.id, "2028-03-01"); // day after period: does not count

      const items = await progressItems("2028-02-15");

      expect(items[0]).toMatchObject({
        periodStart: "2028-02-01",
        periodEnd: "2028-02-29",
        completedCount: 2,
      });
    });

    it("AC5: reference 2027-01-01 gives weekly bounds 2026-12-28..2027-01-03", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 7);
      await addEntry(habit.id, "2026-12-28"); // Monday boundary (previous year): counts
      await addEntry(habit.id, "2027-01-03"); // Sunday boundary: counts
      await addEntry(habit.id, "2026-12-27"); // Sunday before period: does not count
      await addEntry(habit.id, "2027-01-04"); // Monday after period: does not count

      const items = await progressItems("2027-01-01");

      expect(items[0]).toMatchObject({
        periodStart: "2026-12-28",
        periodEnd: "2027-01-03",
        completedCount: 2,
      });
    });
  });

  // ---------------------------------------------------------------- AC6
  describe("AC6: which habits appear and in which order", () => {
    it("AC6: ordered by habit sortOrder, then createdAt, then id, ascending", async () => {
      const a = await createHabit("A");
      const b = await createHabit("B");
      const c = await createHabit("C");
      // Create goals in reverse order to prove ordering comes from the habit, not the goal.
      await createGoal(c.id, "WEEKLY", 3);
      await createGoal(b.id, "WEEKLY", 3);
      await createGoal(a.id, "WEEKLY", 3);

      // Default order follows creation (sortOrder ascending).
      expect((await progressItems(REF)).map((i) => i.habitId)).toEqual([a.id, b.id, c.id]);

      // Explicit reordering changes progress order.
      await reorderHabits([c.id, a.id, b.id]);
      expect((await progressItems(REF)).map((i) => i.habitId)).toEqual([c.id, a.id, b.id]);
    });

    it("AC6: equal sortOrder falls back to createdAt order, ascending", async () => {
      const first = await createHabit("First");
      const second = await createHabit("Second");
      await createGoal(first.id, "WEEKLY", 3);
      await createGoal(second.id, "WEEKLY", 3);
      // Force identical sortOrder on both habits.
      await api().put(`/api/habits/${first.id}`).set(auth()).send({ sortOrder: 0 });
      await api().put(`/api/habits/${second.id}`).set(auth()).send({ sortOrder: 0 });

      const items = await progressItems(REF);

      expect(items.map((i) => i.habitId)).toEqual([first.id, second.id]);
    });

    it("AC6: only active habits with goals appear; archived habits are excluded", async () => {
      const active = await createHabit("Run");
      await createGoal(active.id, "WEEKLY", 3);
      const noGoal = await createHabit("Read"); // no goal: excluded
      const archived = await createHabit("Old", { archived: true });
      await createGoal(archived.id, "WEEKLY", 3); // goal on archived habit: excluded

      const items = await progressItems(REF);

      expect(items.map((i) => i.habitId)).toEqual([active.id]);
      expect(items.map((i) => i.habitId)).not.toContain(noGoal.id);
      expect(items.map((i) => i.habitId)).not.toContain(archived.id);
    });

    it("AC6: counts do not leak between habits", async () => {
      const a = await createHabit("A");
      const b = await createHabit("B");
      const goalA = await createGoal(a.id, "WEEKLY", 3);
      const goalB = await createGoal(b.id, "WEEKLY", 3);
      await addEntry(a.id, REF);
      await addEntry(a.id, REF);

      const items = await progressItems(REF);

      expect(items).toHaveLength(2);
      const itemA = items.find((i) => i.habitId === a.id);
      const itemB = items.find((i) => i.habitId === b.id);
      expect(itemA).toMatchObject({ goalId: goalA.id, completedCount: 2, remainingCount: 1, percentage: 66 });
      expect(itemB).toMatchObject({ goalId: goalB.id, completedCount: 0, remainingCount: 3, percentage: 0 });
    });

    it("AC6: no goals returns an empty array", async () => {
      const res = await progress(REF);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });

    it("AC6: habits without goals do not produce progress items even with entries", async () => {
      const habit = await createHabit("Run");
      await addEntry(habit.id, REF);

      const res = await progress(REF);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });

    it("AC6: progress request does not modify habits, goals, or entries", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, REF);

      const snapshot = async () => ({
        habits: (await api().get("/api/habits").set(auth()).query({ includeArchived: "true" })).body.data,
        goals: (await api().get("/api/goals").set(auth())).body.data,
        entries: (await api().get("/api/entries").set(auth()).query({ startDate: "0001-01-01", endDate: "9999-12-31" }))
          .body.data,
      });

      const before = await snapshot();
      const res = await progress(REF);
      expect(res.status).toBe(200);
      const after = await snapshot();

      expect(after).toEqual(before);
    });
  });

  // ---------------------------------------------------------------- AC7
  describe("AC7: recalculation", () => {
    it("AC7: adding an entry changes the next response", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);

      expect((await progressItems(REF))[0].completedCount).toBe(0);
      await addEntry(habit.id, REF);
      const items = await progressItems(REF);
      expect(items[0].completedCount).toBe(1);
      expect(items[0].remainingCount).toBe(2);
      expect(items[0].percentage).toBe(33);
    });

    it("AC7: deleting an entry changes the next response", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      const entry = await addEntry(habit.id, REF);
      expect((await progressItems(REF))[0].completedCount).toBe(1);

      await deleteEntry(entry.id);

      const items = await progressItems(REF);
      expect(items[0].completedCount).toBe(0);
      expect(items[0].remainingCount).toBe(3);
      expect(items[0].percentage).toBe(0);
      expect(items[0].achieved).toBe(false);
    });

    it("AC7: editing only an entry's notes does not change the completion count", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      const entry = await addEntry(habit.id, REF, { notes: "morning" });
      expect((await progressItems(REF))[0].completedCount).toBe(1);

      // Keep time as-is; change notes only (existing endpoint requires `time`).
      await updateEntry(entry.id, { time: entry.time, notes: "evening run, felt great" });

      expect((await progressItems(REF))[0].completedCount).toBe(1);
    });

    it("AC7: editing only an entry's time does not change the completion count", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      const entry = await addEntry(habit.id, REF, { time: "07:00" });
      expect((await progressItems(REF))[0].completedCount).toBe(1);

      // Change time only (notes field untouched).
      await updateEntry(entry.id, { time: "21:45" });

      expect((await progressItems(REF))[0].completedCount).toBe(1);
    });

    it("AC7: editing time/notes does not move an entry between periods (date unchanged)", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      const entry = await addEntry(habit.id, REF);
      await updateEntry(entry.id, { time: "23:59", notes: "note" });

      const items = await progressItems(REF);
      expect(items[0].completedCount).toBe(1);
      expect(items[0].periodStart).toBe(WEEK_START);
      expect(items[0].periodEnd).toBe(WEEK_END);
    });

    it("AC7: changing the goal's target recalculates progress", async () => {
      const { habit, goal } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, "2026-11-23");
      await addEntry(habit.id, "2026-11-24");

      let items = await progressItems(REF);
      expect(items[0]).toMatchObject({ targetCount: 3, completedCount: 2, remainingCount: 1, percentage: 66, achieved: false });

      await updateGoal(goal.id, { targetCount: 2 });
      items = await progressItems(REF);
      expect(items[0]).toMatchObject({ targetCount: 2, completedCount: 2, remainingCount: 0, percentage: 100, achieved: true });

      await updateGoal(goal.id, { targetCount: 4 });
      items = await progressItems(REF);
      expect(items[0]).toMatchObject({ targetCount: 4, completedCount: 2, remainingCount: 2, percentage: 50, achieved: false });
    });

    it("AC7: changing the goal's period recalculates progress", async () => {
      const { habit, goal } = await habitWithGoal("Run", "WEEKLY", 3);
      // 2026-11-10 is in November 2026 but not in the week of 2026-11-24.
      await addEntry(habit.id, "2026-11-10");
      await addEntry(habit.id, REF);

      let items = await progressItems(REF);
      expect(items[0]).toMatchObject({ period: "WEEKLY", periodStart: WEEK_START, periodEnd: WEEK_END, completedCount: 1 });

      await updateGoal(goal.id, { period: "MONTHLY" });
      items = await progressItems(REF);
      expect(items[0]).toMatchObject({ period: "MONTHLY", periodStart: MONTH_START, periodEnd: MONTH_END, completedCount: 2 });
    });

    it("AC7: entries created before the goal was created still count", async () => {
      const habit = await createHabit("Run");
      await addEntry(habit.id, REF); // entry exists before the goal
      await createGoal(habit.id, "WEEKLY", 3);

      const items = await progressItems(REF);

      expect(items[0].completedCount).toBe(1);
      expect(items[0].remainingCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------- AC8
  describe("AC8: archiving, removing goals, deleting habits", () => {
    it("AC8: archiving a habit excludes its goal from progress", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, REF);
      expect(await progressItems(REF)).toHaveLength(1);

      await setArchived(habit.id, true);

      const res = await progress(REF);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });

    it("AC8: unarchiving restores the goal with its progress", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, REF);
      await addEntry(habit.id, REF);

      await setArchived(habit.id, true);
      expect(await progressItems(REF)).toHaveLength(0);

      await setArchived(habit.id, false);
      const items = await progressItems(REF);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ habitId: habit.id, completedCount: 2, remainingCount: 1, percentage: 66 });
    });

    it("AC8: removing a goal removes it from progress results", async () => {
      const { habit, goal } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, REF);
      expect(await progressItems(REF)).toHaveLength(1);

      await deleteGoal(goal.id);

      const res = await progress(REF);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });

    it("AC8: deleting a habit removes it from progress results", async () => {
      const { habit } = await habitWithGoal("Run", "WEEKLY", 3);
      await addEntry(habit.id, REF);
      expect(await progressItems(REF)).toHaveLength(1);

      await deleteHabit(habit.id);

      const res = await progress(REF);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });
  });

  // ---------------------------------------------------------------- AC9
  describe("AC9: date validation", () => {
    // Every invalid input returns 400 with the specified code and message.
    const invalidQueries: Array<[string, string]> = [
      ["missing date", ""],
      ["missing date with empty query", "?"],
      ["empty date", "?date="],
      ["empty date without value", "?date"],
      ["wrong order format 24-11-2026", "?date=24-11-2026"],
      ["impossible date 2026-02-30", "?date=2026-02-30"],
      ["impossible month 2026-13-01", "?date=2026-13-01"],
      ["repeated date parameters", "?date=2026-11-24&date=2026-11-25"],
      ["repeated identical date parameters", "?date=2026-11-24&date=2026-11-24"],
      // Additional format violations from section 5.
      ["no separators 20261124", "?date=20261124"],
      ["single-digit month 2026-1-01", "?date=2026-1-01"],
      ["single-digit day 2026-01-1", "?date=2026-01-1"],
      ["year only 2026", "?date=2026"],
      ["month only 2026-11", "?date=2026-11"],
      ["extra time component", "?date=2026-11-24T00:00:00Z"],
      ["trailing whitespace", "?date=2026-11-24%20"],
      ["leading whitespace", "?date=%202026-11-24"],
      ["trailing junk", "?date=2026-11-24x"],
      ["non-date string", "?date=not-a-date"],
      ["non-leap-year Feb 29 2026-02-29", "?date=2026-02-29"],
      ["day 00", "?date=2026-01-00"],
      ["day 32", "?date=2026-01-32"],
      ["month 00", "?date=2026-00-10"],
      ["year 0000", "?date=0000-01-01"],
      ["non-string object value", "?date[a]=2026-11-24"],
      ["non-string array value", "?date[]=2026-11-24"],
    ];

    for (const [label, queryString] of invalidQueries) {
      it(`AC9: rejects ${label} with 400 VALIDATION_ERROR`, async () => {
        const res = await progressRaw(queryString);
        expectValidationError(res);
      });
    }

    it("AC9: 2028-02-29 (leap day) is accepted with 200", async () => {
      const res = await progressRaw("?date=2028-02-29");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });

    it("AC9: a plain valid date is accepted with 200", async () => {
      const res = await progressRaw("?date=2026-11-24");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], error: null });
    });
  });

  // ---------------------------------------------------------------- AC10
  describe("AC10: authentication", () => {
    it("AC10: request without a token returns 401 with a valid date", async () => {
      const res = await progressNoAuth("?date=2026-11-24");
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
      expect(res.body.error?.code).toBe("UNAUTHORIZED");
    });

    it("AC10: request without a token returns 401 with no date", async () => {
      const res = await progressNoAuth("");
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
      expect(res.body.error?.code).toBe("UNAUTHORIZED");
    });

    it("AC10: request with an invalid token returns 401", async () => {
      const res = await api().get(`${PROGRESS_PATH}?date=2026-11-24`).set({ Authorization: "Bearer not-a-real-token" });
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
      expect(res.body.error?.code).toBe("UNAUTHORIZED");
    });

    it("AC10: authentication runs before date validation (no token + invalid date returns 401, not 400)", async () => {
      const res = await progressNoAuth("?date=not-a-date&date=also-bad");
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
      expect(res.body.error?.code).toBe("UNAUTHORIZED");
    });
  });
});
