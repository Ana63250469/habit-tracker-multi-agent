import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as goalsApi from "../api/goals";
import { queryKeys } from "../api/queryKeys";

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals.all,
    queryFn: goalsApi.listGoals,
  });
}

function invalidateGoalsAndProgress(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.goals.all });
  // Refresh progress after successfully creating, updating, or removing a goal.
  qc.invalidateQueries({ queryKey: queryKeys.goalProgress.all });
}

export function useGoalProgress(date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.goalProgress.forDate(date),
    queryFn: () => goalsApi.getGoalProgress(date),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.createGoal,
    onSuccess: () => invalidateGoalsAndProgress(qc),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof goalsApi.updateGoal>[1] }) =>
      goalsApi.updateGoal(id, data),
    onSuccess: () => invalidateGoalsAndProgress(qc),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.deleteGoal,
    onSuccess: () => invalidateGoalsAndProgress(qc),
  });
}
