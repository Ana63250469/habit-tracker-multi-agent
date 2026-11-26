import { apiClient } from "./client";
import type { Goal, GoalPeriod, GoalProgress } from "../types";

export async function listGoals(): Promise<Goal[]> {
  const res = await apiClient.get<{ data: Goal[] }>("/goals");
  return res.data.data;
}

export async function createGoal(data: { habitId: string; period: GoalPeriod; targetCount: number }): Promise<Goal> {
  const res = await apiClient.post<{ data: Goal }>("/goals", data);
  return res.data.data;
}

export async function updateGoal(id: string, data: { period?: GoalPeriod; targetCount?: number }): Promise<Goal> {
  const res = await apiClient.put<{ data: Goal }>(`/goals/${id}`, data);
  return res.data.data;
}

export async function deleteGoal(id: string): Promise<void> {
  await apiClient.delete(`/goals/${id}`);
}

export async function getGoalProgress(date: string): Promise<GoalProgress[]> {
  const res = await apiClient.get<{ data: GoalProgress[] }>("/goals/progress", { params: { date } });
  return res.data.data;
}
