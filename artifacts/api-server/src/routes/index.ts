import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import initiativesRouter from "./initiatives";
import milestonesRouter from "./milestones";
import usersRouter from "./users";
import spmoRouter from "./spmo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(initiativesRouter);
router.use(milestonesRouter);
router.use(usersRouter);
router.use(spmoRouter);

export default router;
