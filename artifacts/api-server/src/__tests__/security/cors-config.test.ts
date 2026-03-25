import { describe, it, expect } from "vitest";

// Re-implement the CORS origin validation logic for isolated testing

type CorsCallback = (err: Error | null, allow?: boolean) => void;

function createOriginChecker(allowedOriginsEnv?: string) {
  return function checkOrigin(
    origin: string | undefined,
    callback: CorsCallback,
  ) {
    // Same-origin requests or empty origin (e.g. server-to-server) are allowed
    if (!origin) {
      callback(null, true);
      return;
    }

    // If ALLOWED_ORIGINS is set, only allow those
    if (allowedOriginsEnv) {
      const allowedList = allowedOriginsEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowedList.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
      return;
    }

    // Default: allow Replit domains
    const replitPattern =
      /^https?:\/\/.*\.(repl\.co|replit\.dev|replit\.app)(:\d+)?$/;
    if (replitPattern.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  };
}

function checkOriginAsync(
  checker: ReturnType<typeof createOriginChecker>,
  origin: string | undefined,
): Promise<{ allowed: boolean; error: Error | null }> {
  return new Promise((resolve) => {
    checker(origin, (err, allow) => {
      resolve({ allowed: !!allow, error: err });
    });
  });
}

describe("CORS Origin Validation", () => {
  describe("same-origin / no origin header", () => {
    it("allows requests with no origin (same-origin)", async () => {
      const checker = createOriginChecker();
      const { allowed, error } = await checkOriginAsync(checker, undefined);
      expect(allowed).toBe(true);
      expect(error).toBeNull();
    });

    it("allows requests with empty string origin", async () => {
      const checker = createOriginChecker();
      // Empty string is falsy so treated same as undefined
      const { allowed, error } = await checkOriginAsync(
        checker,
        "" as unknown as undefined,
      );
      expect(allowed).toBe(true);
      expect(error).toBeNull();
    });
  });

  describe("default Replit domain handling (no ALLOWED_ORIGINS)", () => {
    const checker = createOriginChecker();

    it("allows *.repl.co domains", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "https://my-app.repl.co",
      );
      expect(allowed).toBe(true);
    });

    it("allows *.replit.dev domains", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "https://my-app.replit.dev",
      );
      expect(allowed).toBe(true);
    });

    it("allows *.replit.app domains", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "https://my-app.replit.app",
      );
      expect(allowed).toBe(true);
    });

    it("allows deeply nested Replit subdomains", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "https://a.b.c.replit.dev",
      );
      expect(allowed).toBe(true);
    });

    it("allows Replit domains with port", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "https://my-app.replit.dev:3000",
      );
      expect(allowed).toBe(true);
    });

    it("blocks non-Replit domains", async () => {
      const { allowed, error } = await checkOriginAsync(
        checker,
        "https://evil.com",
      );
      expect(allowed).toBe(false);
      expect(error).toBeInstanceOf(Error);
    });

    it("blocks domains that contain replit but are not subdomains", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "https://fake-replit.dev.evil.com",
      );
      expect(allowed).toBe(false);
    });

    it("blocks localhost by default", async () => {
      const { allowed } = await checkOriginAsync(
        checker,
        "http://localhost:3000",
      );
      expect(allowed).toBe(false);
    });
  });

  describe("custom ALLOWED_ORIGINS", () => {
    it("allows origins in the allowed list", async () => {
      const checker = createOriginChecker(
        "https://myapp.com,https://admin.myapp.com",
      );
      const { allowed } = await checkOriginAsync(
        checker,
        "https://myapp.com",
      );
      expect(allowed).toBe(true);
    });

    it("allows second origin in the list", async () => {
      const checker = createOriginChecker(
        "https://myapp.com,https://admin.myapp.com",
      );
      const { allowed } = await checkOriginAsync(
        checker,
        "https://admin.myapp.com",
      );
      expect(allowed).toBe(true);
    });

    it("blocks origins not in the allowed list", async () => {
      const checker = createOriginChecker("https://myapp.com");
      const { allowed, error } = await checkOriginAsync(
        checker,
        "https://evil.com",
      );
      expect(allowed).toBe(false);
      expect(error).toBeInstanceOf(Error);
    });

    it("blocks Replit domains when custom ALLOWED_ORIGINS is set", async () => {
      const checker = createOriginChecker("https://myapp.com");
      const { allowed } = await checkOriginAsync(
        checker,
        "https://my-app.replit.dev",
      );
      expect(allowed).toBe(false);
    });

    it("handles whitespace in ALLOWED_ORIGINS", async () => {
      const checker = createOriginChecker(
        " https://myapp.com , https://other.com ",
      );
      const { allowed } = await checkOriginAsync(
        checker,
        "https://myapp.com",
      );
      expect(allowed).toBe(true);
    });

    it("still allows no-origin requests even with ALLOWED_ORIGINS set", async () => {
      const checker = createOriginChecker("https://myapp.com");
      const { allowed } = await checkOriginAsync(checker, undefined);
      expect(allowed).toBe(true);
    });
  });
});
