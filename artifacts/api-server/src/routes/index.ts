import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import initiativesRouter from "./initiatives";
import milestonesRouter from "./milestones";
import usersRouter from "./users";
import spmoRouter from "./spmo";
import importRouter from "./import";
import bulkImportRouter from "./bulk-import";
import dependenciesRouter from "./dependencies";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(initiativesRouter);
router.use(milestonesRouter);
router.use(usersRouter);
router.use(spmoRouter);
router.use(importRouter);
router.use(bulkImportRouter);
router.use(dependenciesRouter);
router.use("/spmo/reports", reportsRouter);

export default router;
