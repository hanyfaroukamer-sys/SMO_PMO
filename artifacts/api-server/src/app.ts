import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust proxy for correct IP behind load balancer
app.set("trust proxy", 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// CORS - restrict origins
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",");
app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS) {
      return cb(null, ALLOWED_ORIGINS.includes(origin));
    }
    // Default: allow Replit domains
    if (/\.repl\.co$/.test(origin) || /\.replit\.dev$/.test(origin) || /\.replit\.app$/.test(origin)) {
      return cb(null, true);
    }
    cb(null, false);
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Global rate limit: 200 requests per minute
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

app.use(authMiddleware);

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.use("/api", router);

// Serve frontend static files in production
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "../../strategy-pmo/dist/public");
app.use("/strategy-pmo", express.static(frontendDir, { maxAge: "1d", etag: true }));
// SPA fallback — serve index.html for all non-API, non-asset routes under /strategy-pmo
app.get("/strategy-pmo/*path", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});
// Redirect root to frontend
app.get("/", (_req, res) => { res.redirect("/strategy-pmo/"); });

export default app;
