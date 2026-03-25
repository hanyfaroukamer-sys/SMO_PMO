import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-create the env schema from lib/env.ts to test it in isolation (no DB connection)
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

const validBase = { DATABASE_URL: "postgres://localhost:5432/test" };

describe("Environment Variable Validation (Zod Schema)", () => {
  describe("DATABASE_URL", () => {
    it("throws ZodError when DATABASE_URL is missing", () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const dbIssue = result.error.issues.find(
          (i) => i.path[0] === "DATABASE_URL"
        );
        expect(dbIssue).toBeDefined();
      }
    });

    it("throws ZodError when DATABASE_URL is empty string", () => {
      const result = envSchema.safeParse({ DATABASE_URL: "" });
      expect(result.success).toBe(false);
    });

    it("accepts a valid DATABASE_URL", () => {
      const result = envSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });
  });

  describe("PORT", () => {
    it("defaults to 3000 when not provided", () => {
      const result = envSchema.parse(validBase);
      expect(result.PORT).toBe(3000);
    });

    it("coerces string to number", () => {
      const result = envSchema.parse({ ...validBase, PORT: "8080" });
      expect(result.PORT).toBe(8080);
    });

    it("coerces numeric value directly", () => {
      const result = envSchema.parse({ ...validBase, PORT: 5000 });
      expect(result.PORT).toBe(5000);
    });
  });

  describe("COOKIE_SAMESITE", () => {
    it("defaults to 'lax' when not provided", () => {
      const result = envSchema.parse(validBase);
      expect(result.COOKIE_SAMESITE).toBe("lax");
    });

    it("accepts 'strict'", () => {
      const result = envSchema.parse({
        ...validBase,
        COOKIE_SAMESITE: "strict",
      });
      expect(result.COOKIE_SAMESITE).toBe("strict");
    });

    it("accepts 'lax'", () => {
      const result = envSchema.parse({ ...validBase, COOKIE_SAMESITE: "lax" });
      expect(result.COOKIE_SAMESITE).toBe("lax");
    });

    it("accepts 'none'", () => {
      const result = envSchema.parse({
        ...validBase,
        COOKIE_SAMESITE: "none",
      });
      expect(result.COOKIE_SAMESITE).toBe("none");
    });

    it("rejects invalid value", () => {
      const result = envSchema.safeParse({
        ...validBase,
        COOKIE_SAMESITE: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = envSchema.safeParse({
        ...validBase,
        COOKIE_SAMESITE: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("all optional fields are truly optional", () => {
      const result = envSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it("accepts optional fields when provided", () => {
      const result = envSchema.parse({
        ...validBase,
        OIDC_CLIENT_ID: "my-client-id",
        OIDC_CLIENT_SECRET: "my-secret",
        REPL_ID: "repl-123",
        ANTHROPIC_API_KEY: "sk-ant-xxx",
        AI_INTEGRATIONS_ANTHROPIC_API_KEY: "sk-ant-yyy",
        AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://api.anthropic.com",
        ALLOWED_ORIGINS: "https://example.com",
        APP_URL: "https://myapp.com",
        INITIAL_ADMIN_EMAIL: "admin@example.com",
        PRIVATE_OBJECT_DIR: "/tmp/private",
        PUBLIC_OBJECT_SEARCH_PATHS: "/public",
        FORCE_RESEED: "true",
      });
      expect(result.OIDC_CLIENT_ID).toBe("my-client-id");
      expect(result.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
    });
  });

  describe("defaults", () => {
    it("ISSUER_URL defaults to Replit OIDC", () => {
      const result = envSchema.parse(validBase);
      expect(result.ISSUER_URL).toBe("https://replit.com/oidc");
    });

    it("BASE_PATH defaults to '/strategy-pmo/'", () => {
      const result = envSchema.parse(validBase);
      expect(result.BASE_PATH).toBe("/strategy-pmo/");
    });

    it("LOG_LEVEL defaults to 'info'", () => {
      const result = envSchema.parse(validBase);
      expect(result.LOG_LEVEL).toBe("info");
    });

    it("allows overriding ISSUER_URL", () => {
      const result = envSchema.parse({
        ...validBase,
        ISSUER_URL: "https://custom-oidc.example.com",
      });
      expect(result.ISSUER_URL).toBe("https://custom-oidc.example.com");
    });

    it("allows overriding BASE_PATH", () => {
      const result = envSchema.parse({ ...validBase, BASE_PATH: "/api/" });
      expect(result.BASE_PATH).toBe("/api/");
    });
  });
});
