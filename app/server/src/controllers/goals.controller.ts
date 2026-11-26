import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as goalsService from "../services/goals.service";
import * as progressService from "../services/progress.service";
import { isValidProgressDate } from "../lib/calendar";

const period = z.enum(["WEEKLY", "MONTHLY"]);
const targetCount = z.number({ required_error: "Enter a whole number" }).int("Enter a whole number");

const createSchema = z
  .object({
    habitId: z.string().min(1),
    period,
    targetCount,
  })
  .superRefine((data, ctx) => {
    const error = goalsService.validateTarget(data.period, data.targetCount);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetCount"], message: error });
  });

const updateSchema = z.object({
  period: period.optional(),
  targetCount: targetCount.optional(),
});

function handleError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof z.ZodError) {
    const message = err.issues[0]?.message ?? err.message;
    res.status(400).json({ data: null, error: { code: "VALIDATION_ERROR", message } });
    return;
  }
  if (err instanceof goalsService.GoalError) {
    res.status(err.status).json({ data: null, error: { code: err.code, message: err.message } });
    return;
  }
  next(err);
}

const progressQuerySchema = z.object({
  // `date` must be a single valid calendar date string in YYYY-MM-DD format;
  // repeated params (arrays) and non-string values are rejected.
  date: z.unknown().refine(isValidProgressDate, { message: progressService.PROGRESS_DATE_ERROR }),
});

export async function progress(req: Request, res: Response, next: NextFunction) {
  try {
    const { date } = progressQuerySchema.parse(req.query);
    const items = await progressService.getGoalProgress(date);
    res.json({ data: items, error: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        data: null,
        error: { code: "VALIDATION_ERROR", message: progressService.PROGRESS_DATE_ERROR },
      });
      return;
    }
    next(err);
  }
}

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    const goals = await goalsService.listGoals();
    res.json({ data: goals, error: null });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    const goal = await goalsService.createGoal(data);
    res.status(201).json({ data: goal, error: null });
  } catch (err) {
    handleError(err, res, next);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const goal = await goalsService.updateGoal(req.params.id, data);
    res.json({ data: goal, error: null });
  } catch (err) {
    handleError(err, res, next);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await goalsService.deleteGoal(req.params.id);
    res.json({ data: { success: true }, error: null });
  } catch (err) {
    handleError(err, res, next);
  }
}
