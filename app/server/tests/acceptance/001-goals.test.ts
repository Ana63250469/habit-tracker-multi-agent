import { describe, it, expect, beforeEach } from "vitest";
import { api, auth, resetDb, createHabit } from "../support/helpers";

// Acceptance tests for SPEC-001 (Habit Goals). Black-box: HTTP API only.

type Goal = { id: string; habitId: string; period: string; targetCount: number };

async function postGoal(body: Record<string, unknown>) {
  return api().post("/api/goals").set(auth()).send(body);
}

async function createGoal(habitId: string, period: string, targetCount: number): Promise<Goal> {
  const res = await postGoal({ habitId, period, targetCount });
  expect(res.status).toBe(201);
  return res.body.data as Goal;
}

async function listGoals(): Promise<Goal[]> {
  const res = await api().get("/api/goals").set(auth());
  expect(res.status).toBe(200);
  return res.body.data as Goal[];
}

function expectError(res: { status: number; body: any }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body.data).toBeNull();
  expect(res.body.error?.code).toBe(code);
}

describe("SPEC-001 goals API", () => {
  beforeEach(resetDb);

  // AC1
  it("AC1: POST a valid weekly goal returns 201 and GET returns it", async () => {
    const habit = await createHabit("Run");
    const res = await postGoal({ habitId: habit.id, period: "WEEKLY", targetCount: 3 });
    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({ habitId: habit.id, period: "WEEKLY", targetCount: 3 });
    expect(typeof res.body.data.id).toBe("string");

    const goals = await listGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ id: res.body.data.id, habitId: habit.id, period: "WEEKLY", targetCount: 3 });
  });

  // AC2
  describe("AC2: target validation", () => {
    for (const targetCount of [0, 8, 2.5]) {
      it(`AC2: rejects weekly target ${targetCount} with 400`, async () => {
        const habit = await createHabit("Run");
        const res = await postGoal({ habitId: habit.id, period: "WEEKLY", targetCount });
        expectError(res, 400, "VALIDATION_ERROR");
        expect(await listGoals()).toHaveLength(0);
      });
    }

    it("AC2: rejects weekly goal with missing target with 400", async () => {
      const habit = await createHabit("Run");
      const res = await postGoal({ habitId: habit.id, period: "WEEKLY" });
      expectError(res, 400, "VALIDATION_ERROR");
      expect(await listGoals()).toHaveLength(0);
    });

    for (const targetCount of [0, 32]) {
      it(`AC2: rejects monthly target ${targetCount} with 400`, async () => {
        const habit = await createHabit("Run");
        const res = await postGoal({ habitId: habit.id, period: "MONTHLY", targetCount });
        expectError(res, 400, "VALIDATION_ERROR");
        expect(await listGoals()).toHaveLength(0);
      });
    }

    for (const [period, targetCount] of [
      ["WEEKLY", 1],
      ["WEEKLY", 7],
      ["MONTHLY", 1],
      ["MONTHLY", 31],
    ] as const) {
      it(`AC2: accepts boundary ${period} ${targetCount} with 201`, async () => {
        const habit = await createHabit("Run");
        const res = await postGoal({ habitId: habit.id, period, targetCount });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ habitId: habit.id, period, targetCount });
      });
    }
  });

  // AC3
  describe("AC3: period validation", () => {
    for (const period of ["DAILY", "", 7]) {
      it(`AC3: rejects invalid period ${JSON.stringify(period)} with 400`, async () => {
        const habit = await createHabit("Run");
        const res = await postGoal({ habitId: habit.id, period, targetCount: 3 });
        expectError(res, 400, "VALIDATION_ERROR");
        expect(await listGoals()).toHaveLength(0);
      });
    }

    it("AC3: rejects missing period with 400", async () => {
      const habit = await createHabit("Run");
      const res = await postGoal({ habitId: habit.id, targetCount: 3 });
      expectError(res, 400, "VALIDATION_ERROR");
      expect(await listGoals()).toHaveLength(0);
    });
  });

  // AC4
  it("AC4: POST for a non-existent habit returns 404 HABIT_NOT_FOUND", async () => {
    const res = await postGoal({ habitId: "does-not-exist", period: "WEEKLY", targetCount: 3 });
    expectError(res, 404, "HABIT_NOT_FOUND");
    expect(await listGoals()).toHaveLength(0);
  });

  it("AC4: POST for a habit that already has a goal returns 409 GOAL_EXISTS", async () => {
    const habit = await createHabit("Run");
    await createGoal(habit.id, "WEEKLY", 3);
    const res = await postGoal({ habitId: habit.id, period: "MONTHLY", targetCount: 10 });
    expectError(res, 409, "GOAL_EXISTS");
    const goals = await listGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ period: "WEEKLY", targetCount: 3 });
  });

  // AC5
  describe("AC5: update", () => {
    it("AC5: PUT changes period and target together with 200", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const res = await api().put(`/api/goals/${goal.id}`).set(auth()).send({ period: "MONTHLY", targetCount: 12 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: goal.id, habitId: habit.id, period: "MONTHLY", targetCount: 12 });
      expect((await listGoals())[0]).toMatchObject({ period: "MONTHLY", targetCount: 12 });
    });

    it("AC5: PUT changes only the target with 200", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const res = await api().put(`/api/goals/${goal.id}`).set(auth()).send({ targetCount: 5 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: goal.id, period: "WEEKLY", targetCount: 5 });
      expect((await listGoals())[0]).toMatchObject({ period: "WEEKLY", targetCount: 5 });
    });

    it("AC5: PUT changes only the period with 200", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const res = await api().put(`/api/goals/${goal.id}`).set(auth()).send({ period: "MONTHLY" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: goal.id, period: "MONTHLY", targetCount: 3 });
      expect((await listGoals())[0]).toMatchObject({ period: "MONTHLY", targetCount: 3 });
    });

    it('AC5: PUT {period: "WEEKLY"} on MONTHLY 20 returns 400 and keeps the goal', async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "MONTHLY", 20);
      const res = await api().put(`/api/goals/${goal.id}`).set(auth()).send({ period: "WEEKLY" });
      expectError(res, 400, "VALIDATION_ERROR");
      expect((await listGoals())[0]).toMatchObject({ id: goal.id, period: "MONTHLY", targetCount: 20 });
    });
  });

  // AC6
  describe("AC6: delete and unknown ids", () => {
    it("AC6: DELETE returns 200 { success: true } and the goal is gone", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const res = await api().delete(`/api/goals/${goal.id}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ success: true });
      expect(res.body.error).toBeNull();
      expect(await listGoals()).toHaveLength(0);
    });

    it("AC6: PUT an unknown id returns 404 GOAL_NOT_FOUND", async () => {
      const res = await api().put("/api/goals/unknown-id").set(auth()).send({ targetCount: 3 });
      expectError(res, 404, "GOAL_NOT_FOUND");
    });

    it("AC6: DELETE an unknown id returns 404 GOAL_NOT_FOUND", async () => {
      const res = await api().delete("/api/goals/unknown-id").set(auth());
      expectError(res, 404, "GOAL_NOT_FOUND");
    });
  });

  // AC7
  describe("AC7: habit lifecycle", () => {
    it("AC7: deleting a habit removes its goal", async () => {
      const habit = await createHabit("Run");
      const other = await createHabit("Read");
      await createGoal(habit.id, "WEEKLY", 3);
      await createGoal(other.id, "MONTHLY", 10);
      const del = await api().delete(`/api/habits/${habit.id}`).set(auth());
      expect(del.status).toBe(200);
      const goals = await listGoals();
      expect(goals).toHaveLength(1);
      expect(goals[0]).toMatchObject({ habitId: other.id });
    });

    it("AC7: archiving a habit keeps its goal (GET includes goals of archived habits)", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const arch = await api().put(`/api/habits/${habit.id}`).set(auth()).send({ archived: true });
      expect(arch.status).toBe(200);
      const goals = await listGoals();
      expect(goals).toHaveLength(1);
      expect(goals[0]).toMatchObject({ id: goal.id, habitId: habit.id, period: "WEEKLY", targetCount: 3 });
    });

    it("AC7: unarchiving a habit keeps its goal", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      await api().put(`/api/habits/${habit.id}`).set(auth()).send({ archived: true });
      await api().put(`/api/habits/${habit.id}`).set(auth()).send({ archived: false });
      const goals = await listGoals();
      expect(goals).toHaveLength(1);
      expect(goals[0]).toMatchObject({ id: goal.id, period: "WEEKLY", targetCount: 3 });
    });
  });

  // AC8
  describe("AC8: authentication", () => {
    it("AC8: GET /api/goals without a token returns 401", async () => {
      const res = await api().get("/api/goals");
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
    });

    it("AC8: POST /api/goals without a token returns 401", async () => {
      const habit = await createHabit("Run");
      const res = await api().post("/api/goals").send({ habitId: habit.id, period: "WEEKLY", targetCount: 3 });
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
    });

    it("AC8: PUT /api/goals/:id without a token returns 401", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const res = await api().put(`/api/goals/${goal.id}`).send({ targetCount: 4 });
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
      expect((await listGoals())[0]).toMatchObject({ targetCount: 3 });
    });

    it("AC8: DELETE /api/goals/:id without a token returns 401", async () => {
      const habit = await createHabit("Run");
      const goal = await createGoal(habit.id, "WEEKLY", 3);
      const res = await api().delete(`/api/goals/${goal.id}`);
      expect(res.status).toBe(401);
      expect(res.body.data).toBeNull();
      expect(await listGoals()).toHaveLength(1);
    });
  });
});
