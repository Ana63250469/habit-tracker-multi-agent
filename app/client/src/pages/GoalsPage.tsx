import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { GoalForm } from "../components/goals/GoalForm";
import { useHabits } from "../hooks/useHabits";
import { useGoals, useDeleteGoal, useGoalProgress } from "../hooks/useGoals";
import type { Goal, GoalProgress, Habit } from "../types";
import { PROGRESS_DATE_ERROR, isValidProgressDate, todayLocalISODate } from "../utils/progressDate";

function formatGoal(goal?: Goal): string {
  if (!goal) return "No goal";
  const unit = goal.targetCount === 1 ? "time" : "times";
  const period = goal.period === "WEEKLY" ? "week" : "month";
  return `${goal.targetCount} ${unit} per ${period}`;
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500";

function ProgressBlock({ habit, progress }: { habit: Habit; progress: GoalProgress }) {
  const periodWord = progress.period === "WEEKLY" ? "week" : "month";
  return (
    <div data-testid={`goal-progress-${habit.id}`} className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-zinc-900 dark:text-zinc-100 font-medium">
          {progress.completedCount} of {progress.targetCount} completed this {periodWord}
        </span>
        <span data-testid={`goal-progress-period-${habit.id}`} className="text-zinc-500 dark:text-zinc-400">
          {progress.periodStart} – {progress.periodEnd}
        </span>
        {progress.achieved && (
          <span data-testid={`goal-achieved-${habit.id}`} className="text-green-600 dark:text-green-400 font-medium">
            Goal reached
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={`Progress for ${habit.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percentage}
        data-testid={`goal-progress-bar-${habit.id}`}
        className="mt-2 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"
      >
        <div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${progress.percentage}%` }} />
      </div>
    </div>
  );
}

export function GoalsPage() {
  const { data: habits = [], isLoading: habitsLoading } = useHabits();
  const { data: goals = [] } = useGoals();
  const deleteGoal = useDeleteGoal();

  const [editing, setEditing] = useState<{ habit: Habit; goal?: Goal } | null>(null);

  // Selected progress reference date. Defaults to today (browser local calendar);
  // a fresh page load resets it. (No persistence.)
  const [progressDate, setProgressDate] = useState<string>(() => todayLocalISODate());
  const progressDateValid = isValidProgressDate(progressDate);

  const {
    data: progressItems = [],
    isFetching: progressFetching,
    isPending: progressPending,
    isError: progressError,
    refetch: refetchProgress,
  } = useGoalProgress(progressDate, progressDateValid);

  const progressLoading = progressDateValid && (progressFetching || progressPending);
  const showProgress = progressDateValid && !progressLoading && !progressError;
  const progressByHabit = new Map(progressItems.map((p) => [p.habitId, p]));

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

      {/* Progress reference date, above the habit list. */}
      <div className="mb-4 flex flex-col gap-1 max-w-xs">
        <label htmlFor="goal-progress-date" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Progress date
        </label>
        <input
          id="goal-progress-date"
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          data-testid="goal-progress-date"
          className={inputClass}
          value={progressDate}
          onChange={(e) => setProgressDate(e.target.value)}
        />
        {!progressDateValid && (
          <p data-testid="goal-progress-date-error" className="text-sm text-red-500" role="alert">
            {PROGRESS_DATE_ERROR}
          </p>
        )}
      </div>

      {progressDateValid && progressLoading && (
        <div data-testid="goal-progress-loading" className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Loading progress...
        </div>
      )}

      {progressDateValid && !progressLoading && progressError && (
        <div
          data-testid="goal-progress-error"
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 text-sm text-red-500"
        >
          <span>Could not load progress.</span>
          <Button variant="secondary" size="sm" data-testid="goal-progress-retry" onClick={() => { void refetchProgress(); }}>
            Retry
          </Button>
        </div>
      )}

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
            const progress = progressByHabit.get(habit.id);
            return (
              <div
                key={habit.id}
                data-testid={`goal-row-${habit.id}`}
                className="bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
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
                {goal && showProgress && progress && <ProgressBlock habit={habit} progress={progress} />}
              </div>
            );
          })}
        </div>
      )}

      <GoalForm open={!!editing} onClose={() => setEditing(null)} habit={editing?.habit} goal={editing?.goal} />
    </div>
  );
}
