import { prisma } from "../lib/prisma";

export type GoalPeriod = "WEEKLY" | "MONTHLY";

export const GOAL_LIMITS: Record<GoalPeriod, number> = { WEEKLY: 7, MONTHLY: 31 };

export class GoalError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

/** Returns an error message if the target is not valid for the period, otherwise null. */
export function validateTarget(period: GoalPeriod, targetCount: number): string | null {
  if (!Number.isInteger(targetCount)) return "Enter a whole number";
  const max = GOAL_LIMITS[period];
  if (targetCount < 1 || targetCount > max) {
    return period === "WEEKLY" ? "Weekly goal must be between 1 and 7" : "Monthly goal must be between 1 and 31";
  }
  return null;
}

export async function listGoals() {
  return prisma.goal.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createGoal(data: { habitId: string; period: GoalPeriod; targetCount: number }) {
  const habit = await prisma.habit.findUnique({ where: { id: data.habitId }, include: { goal: true } });
  if (!habit) throw new GoalError(404, "HABIT_NOT_FOUND", "Habit not found");
  if (habit.goal) throw new GoalError(409, "GOAL_EXISTS", "This habit already has a goal");
  return prisma.goal.create({ data });
}

export async function updateGoal(id: string, data: { period?: GoalPeriod; targetCount?: number }) {
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) throw new GoalError(404, "GOAL_NOT_FOUND", "Goal not found");
  const period = data.period ?? (goal.period as GoalPeriod);
  const targetCount = data.targetCount ?? goal.targetCount;
  const error = validateTarget(period, targetCount);
  if (error) throw new GoalError(400, "VALIDATION_ERROR", error);
  return prisma.goal.update({ where: { id }, data: { period, targetCount } });
}

export async function deleteGoal(id: string) {
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) throw new GoalError(404, "GOAL_NOT_FOUND", "Goal not found");
  await prisma.goal.delete({ where: { id } });
}
