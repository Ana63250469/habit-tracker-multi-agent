import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as goalsController from "../controllers/goals.controller";

const router = Router();

router.use(requireAuth);

router.get("/", goalsController.list);
router.post("/", goalsController.create);
router.put("/:id", goalsController.update);
router.delete("/:id", goalsController.remove);

export default router;
