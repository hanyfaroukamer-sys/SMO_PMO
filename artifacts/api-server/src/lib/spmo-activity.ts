import { db } from "@workspace/db";
import { spmoActivityLogTable } from "@workspace/db";
import { logger } from "./logger";

export async function logSpmoActivity(
  actorId: string,
  actorName: string | null,
  action: (typeof spmoActivityLogTable.$inferInsert)["action"],
  entityType: string,
  entityId: number,
  entityName: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.insert(spmoActivityLogTable).values({
      actorId,
      actorName,
      action,
      entityType,
      entityId,
      entityName,
      details,
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to write SPMO activity log entry");
  }
}
