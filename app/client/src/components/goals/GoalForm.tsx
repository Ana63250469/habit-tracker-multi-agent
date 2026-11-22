import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAxiosError } from "axios";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useCreateGoal, useUpdateGoal } from "../../hooks/useGoals";
import type { Goal, Habit } from "../../types";

const schema = z
  .object({
    period: z.enum(["WEEKLY", "MONTHLY"]),
    target: z.string(),
  })
  .superRefine((data, ctx) => {
    const raw = data.target.trim();
    if (!/^-?\d+$/.test(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["target"], message: "Enter a whole number" });
      return;
    }
    const n = Number(raw);
    const max = data.period === "WEEKLY" ? 7 : 31;
    if (n < 1 || n > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message:
          data.period === "WEEKLY" ? "Weekly goal must be between 1 and 7" : "Monthly goal must be between 1 and 31",
      });
    }
  });

type FormData = z.infer<typeof schema>;

interface GoalFormProps {
  open: boolean;
  onClose: () => void;
  habit?: Habit;
  goal?: Goal;
}

const selectClass =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500";

export function GoalForm({ open, onClose, habit, goal }: GoalFormProps) {
  const isEdit = !!goal;
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { period: "WEEKLY", target: "1" },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        period: goal?.period ?? "WEEKLY",
        target: String(goal?.targetCount ?? 1),
      });
    }
  }, [open, goal, reset]);

  const onSubmit = async (data: FormData) => {
    if (!habit) return;
    setServerError(null);
    const targetCount = Number(data.target.trim());
    try {
      if (isEdit) {
        await updateGoal.mutateAsync({ id: goal.id, data: { period: data.period, targetCount } });
      } else {
        await createGoal.mutateAsync({ habitId: habit.id, period: data.period, targetCount });
      }
      onClose();
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setServerError(message ?? "Could not save goal");
    }
  };

  const errorMessage = errors.target?.message ?? errors.period?.message ?? serverError;

  return (
    <Modal open={open} onClose={onClose} title={habit ? `Goal for ${habit.name}` : "Goal"}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="goal-period" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Period
          </label>
          <select id="goal-period" data-testid="goal-period" className={selectClass} {...register("period")}>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="goal-target" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Target
          </label>
          <input
            id="goal-target"
            type="number"
            data-testid="goal-target"
            className={selectClass}
            {...register("target")}
          />
        </div>

        {errorMessage && (
          <p data-testid="goal-error" className="text-sm text-red-500" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1" data-testid="goal-cancel">
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting} data-testid="goal-save">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
