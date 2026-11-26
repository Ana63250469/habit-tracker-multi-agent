export interface Habit {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  date: string;
  time: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  habit: Habit;
}

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: { code: string; message: string };
}

export type GoalPeriod = "WEEKLY" | "MONTHLY";

export interface Goal {
  id: string;
  habitId: string;
  period: GoalPeriod;
  targetCount: number;
  createdAt: string;
  updatedAt: string;
}

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
