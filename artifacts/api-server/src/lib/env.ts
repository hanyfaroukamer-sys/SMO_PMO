import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ISSUER_URL: z.string().default("https://replit.com/oidc"),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  REPL_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_ANTHROPIC_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  APP_URL: z.string().optional(),
  INITIAL_ADMIN_EMAIL: z.string().optional(),
  PRIVATE_OBJECT_DIR: z.string().optional(),
  PUBLIC_OBJECT_SEARCH_PATHS: z.string().optional(),
  BASE_PATH: z.string().default("/strategy-pmo/"),
  LOG_LEVEL: z.string().default("info"),
  FORCE_RESEED: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("lax"),
});

export const env = envSchema.parse(process.env);
