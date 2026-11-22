import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as goalsApi from "../api/goals";
import { queryKeys } from "../api/queryKeys";

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals.all,
    queryFn: goalsApi.listGoals,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.createGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof goalsApi.updateGoal>[1] }) =>
      goalsApi.updateGoal(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.deleteGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}
