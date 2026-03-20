import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { db } from "@workspace/db";
import {
  uploadIntentsTable,
  fileAttachmentsTable,
  milestonesTable,
  initiativesTable,
  usersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Requires authentication + initiative ownership (or admin).
 * Records an upload intent tied to (user, milestone, objectPath, 15min expiry).
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { milestoneId } = parsed.data;

  const [milestone] = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.id, milestoneId));

  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const [initiative] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, milestone.initiativeId));

  const role = req.user.role;
  if (role !== "admin" && initiative?.ownerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden — only the initiative owner or an admin can upload files" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.insert(uploadIntentsTable).values({
      userId: req.user.id,
      milestoneId,
      objectPath,
      expiresAt,
    });

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities.
 * Access control: must be authenticated; requester must be uploader,
 * initiative owner, approver role, or admin.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const role = req.user.role;

    if (role !== "admin" && role !== "approver") {
      const [attachment] = await db
        .select({
          uploadedById: fileAttachmentsTable.uploadedById,
          ownerId: initiativesTable.ownerId,
        })
        .from(fileAttachmentsTable)
        .innerJoin(milestonesTable, eq(fileAttachmentsTable.milestoneId, milestonesTable.id))
        .innerJoin(initiativesTable, eq(milestonesTable.initiativeId, initiativesTable.id))
        .where(eq(fileAttachmentsTable.objectPath, objectPath));

      if (!attachment) {
        res.status(404).json({ error: "Object not found" });
        return;
      }

      if (attachment.uploadedById !== req.user.id && attachment.ownerId !== req.user.id) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
