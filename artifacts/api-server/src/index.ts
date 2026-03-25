import "./lib/env"; // validate env vars at startup
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";
import { pool } from "@workspace/db";
import { db, sessionsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

const port = Number(process.env.PORT) || 3000;

// Periodic session cleanup (every hour)
const sessionCleanup = setInterval(async () => {
  try {
    await db.delete(sessionsTable).where(lt(sessionsTable.expire, new Date()));
  } catch (err) {
    logger.error({ err }, "Session cleanup failed");
  }
}, 60 * 60 * 1000);

seedIfEmpty()
  .then(() => {
    const server = app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });

    // Graceful shutdown
    const shutdown = () => {
      logger.info("Shutting down gracefully...");
      clearInterval(sessionCleanup);
      server.close(() => {
        pool.end().then(() => process.exit(0)).catch(() => process.exit(1));
      });
      setTimeout(() => process.exit(1), 10_000);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((err) => {
    logger.error({ err }, "Seed failed — starting server anyway");
    app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  });
