import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { GoalForm } from "../components/goals/GoalForm";
import { useHabits } from "../hooks/useHabits";
import { useGoals, useDeleteGoal } from "../hooks/useGoals";
import type { Goal, Habit } from "../types";

function formatGoal(goal?: Goal): string {
  if (!goal) return "No goal";
  const unit = goal.targetCount === 1 ? "time" : "times";
  const period = goal.period === "WEEKLY" ? "week" : "month";
  return `${goal.targetCount} ${unit} per ${period}`;
}

export function GoalsPage() {
  const { data: habits = [], isLoading: habitsLoading } = useHabits();
  const { data: goals = [] } = useGoals();
  const deleteGoal = useDeleteGoal();

  const [editing, setEditing] = useState<{ habit: Habit; goal?: Goal } | null>(null);

  const goalByHabit = new Map(goals.map((g) => [g.habitId, g]));

  const handleRemove = async (habit: Habit, goal: Goal) => {
    if (window.confirm(`Remove goal for "${habit.name}"?`)) {
      await deleteGoal.mutateAsync(goal.id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Goals</h1>
      </div>

      {!habitsLoading && habits.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <p className="mb-4">No habits yet.</p>
          <Link to="/habits" className="text-sm underline hover:text-zinc-600 dark:hover:text-zinc-200">
            Go to Habits
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {habits.map((habit) => {
            const goal = goalByHabit.get(habit.id);
            return (
              <div
                key={habit.id}
                data-testid={`goal-row-${habit.id}`}
                className="flex items-center gap-3 bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 px-4 py-3"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: habit.color }} />
                <span className="flex-1 min-w-0 text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {habit.emoji && <span className="mr-1">{habit.emoji}</span>}
                  {habit.name}
                </span>
                <span data-testid={`goal-text-${habit.id}`} className="text-sm text-zinc-500 dark:text-zinc-400">
                  {formatGoal(goal)}
                </span>
                {goal ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`goal-edit-${habit.id}`}
                      onClick={() => setEditing({ habit, goal })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`goal-remove-${habit.id}`}
                      onClick={() => handleRemove(habit, goal)}
                      className="text-red-400 hover:text-red-600"
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`goal-edit-${habit.id}`}
                    onClick={() => setEditing({ habit })}
                  >
                    Set goal
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <GoalForm open={!!editing} onClose={() => setEditing(null)} habit={editing?.habit} goal={editing?.goal} />
    </div>
  );
}
