import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as goalsController from "../controllers/goals.controller";

const router = Router();

router.use(requireAuth);

// Register /progress before any route that could interpret "progress" as a goal id.
router.get("/progress", goalsController.progress);
router.get("/", goalsController.list);
router.post("/", goalsController.create);
router.put("/:id", goalsController.update);
router.delete("/:id", goalsController.remove);

export default router;
