import { prisma } from "../lib/prisma";
import {
  isValidCalendarDateString,
  monthlyPeriod,
  parseCalendarDate,
  weeklyPeriod,
  type PeriodBounds,
} from "../lib/calendar";
import type { GoalPeriod } from "./goals.service";

export const PROGRESS_DATE_ERROR = "Enter a valid date in YYYY-MM-DD format";

export interface GoalProgress {
  goalId: string;
  habitId: string;
  period: GoalPeriod;
  targetCount: number;
  periodStart: string;
  periodEnd: string;
  completedCount: number;
  remainingCount: number;
  percentage: number;
  achieved: boolean;
}

/** remainingCount = max(targetCount - completedCount, 0) */
export function computeRemainingCount(targetCount: number, completedCount: number): number {
  return Math.max(targetCount - completedCount, 0);
}

/** percentage = min(100, floor(completedCount / targetCount * 100)) */
export function computePercentage(targetCount: number, completedCount: number): number {
  return Math.min(100, Math.floor((completedCount / targetCount) * 100));
}

/** achieved = completedCount >= targetCount */
export function computeAchieved(targetCount: number, completedCount: number): boolean {
  return completedCount >= targetCount;
}

/** Period bounds for a goal period containing `referenceDate`. */
export function periodBoundsFor(period: GoalPeriod, referenceDate: string): PeriodBounds {
  const ref = parseCalendarDate(referenceDate);
  if (!ref) throw new Error(`Invalid reference date: ${referenceDate}`);
  return period === "MONTHLY" ? monthlyPeriod(ref) : weeklyPeriod(ref);
}

/**
 * Compute progress for every goal belonging to an active (not archived) habit,
 * for the period containing `referenceDate`. Ordered by habit sortOrder, then
 * habit createdAt, then habit id, ascending. Read-only.
 */
export async function getGoalProgress(referenceDate: string): Promise<GoalProgress[]> {
  const goals = await prisma.goal.findMany({
    where: { habit: { archived: false } },
    orderBy: [
      { habit: { sortOrder: "asc" } },
      { habit: { createdAt: "asc" } },
      { habit: { id: "asc" } },
    ],
  });

  const results: GoalProgress[] = [];
  for (const goal of goals) {
    const period: GoalPeriod = goal.period === "MONTHLY" ? "MONTHLY" : "WEEKLY";
    const { start, end } = periodBoundsFor(period, referenceDate);

    // Count every entry separately; assign by HabitEntry.date calendar string;
    // include entries inside the period even after the reference date; ignore
    // entries outside the period and entries with non-calendar dates.
    const entries = await prisma.habitEntry.findMany({
      where: { habitId: goal.habitId },
      select: { date: true },
    });
    const completedCount = entries.filter(
      (entry) => isValidCalendarDateString(entry.date) && entry.date >= start && entry.date <= end
    ).length;

    results.push({
      goalId: goal.id,
      habitId: goal.habitId,
      period,
      targetCount: goal.targetCount,
      periodStart: start,
      periodEnd: end,
      completedCount,
      remainingCount: computeRemainingCount(goal.targetCount, completedCount),
      percentage: computePercentage(goal.targetCount, completedCount),
      achieved: computeAchieved(goal.targetCount, completedCount),
    });
  }
  return results;
}
