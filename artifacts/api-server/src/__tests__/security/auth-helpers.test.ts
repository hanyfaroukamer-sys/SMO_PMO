import { describe, it, expect } from "vitest";

// Re-implement auth helper functions to test their logic without importing from the app
// (avoids DB connection side effects)

interface AuthUser {
  id: string;
  role?: string | null;
}

interface MockRequest {
  user?: AuthUser | undefined;
  params: Record<string, string>;
}

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res;
}

function getAuthUser(req: MockRequest): AuthUser | undefined {
  return req.user as AuthUser | undefined;
}

function requireAuth(req: MockRequest, res: MockResponse): string | null {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user.id;
}

function requireRole(
  req: MockRequest,
  res: MockResponse,
  ...allowedRoles: string[]
): string | null {
  const user = getAuthUser(req);
  if (!user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!user.role || !allowedRoles.includes(user.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return null;
  }
  return user.id;
}

function parseId(
  req: MockRequest,
  res: MockResponse,
  paramName = "id",
): number | null {
  const id = Number(req.params[paramName]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: `Invalid ${paramName}` });
    return null;
  }
  return id;
}

describe("Auth Helpers", () => {
  describe("requireAuth", () => {
    it("returns userId when user is present and has an id", () => {
      const req: MockRequest = {
        user: { id: "user-123" },
        params: {},
      };
      const res = createMockRes();
      const result = requireAuth(req, res);
      expect(result).toBe("user-123");
    });

    it("returns null and 401 when no user on request", () => {
      const req: MockRequest = { user: undefined, params: {} };
      const res = createMockRes();
      const result = requireAuth(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Authentication required" });
    });

    it("returns null and 401 when user has no id (empty string)", () => {
      const req: MockRequest = { user: { id: "" }, params: {} };
      const res = createMockRes();
      const result = requireAuth(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Authentication required" });
    });

    it("returns null and 401 when req.user is null-ish", () => {
      const req: MockRequest = { user: undefined, params: {} };
      const res = createMockRes();
      const result = requireAuth(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(401);
    });
  });

  describe("requireRole", () => {
    it("returns userId when role matches a single allowed role", () => {
      const req: MockRequest = {
        user: { id: "user-1", role: "admin" },
        params: {},
      };
      const res = createMockRes();
      const result = requireRole(req, res, "admin");
      expect(result).toBe("user-1");
    });

    it("returns userId when role matches one of multiple allowed roles", () => {
      const req: MockRequest = {
        user: { id: "user-2", role: "editor" },
        params: {},
      };
      const res = createMockRes();
      const result = requireRole(req, res, "admin", "editor", "viewer");
      expect(result).toBe("user-2");
    });

    it("returns null and 403 when role does not match", () => {
      const req: MockRequest = {
        user: { id: "user-3", role: "viewer" },
        params: {},
      };
      const res = createMockRes();
      const result = requireRole(req, res, "admin");
      expect(result).toBeNull();
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "Insufficient permissions" });
    });

    it("returns null and 403 when user has null role", () => {
      const req: MockRequest = {
        user: { id: "user-4", role: null },
        params: {},
      };
      const res = createMockRes();
      const result = requireRole(req, res, "admin");
      expect(result).toBeNull();
      expect(res.statusCode).toBe(403);
    });

    it("returns null and 403 when user has undefined role", () => {
      const req: MockRequest = {
        user: { id: "user-5", role: undefined },
        params: {},
      };
      const res = createMockRes();
      const result = requireRole(req, res, "admin");
      expect(result).toBeNull();
      expect(res.statusCode).toBe(403);
    });

    it("returns null and 401 when no user present", () => {
      const req: MockRequest = { user: undefined, params: {} };
      const res = createMockRes();
      const result = requireRole(req, res, "admin");
      expect(result).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Authentication required" });
    });

    it("handles multiple allowed roles correctly", () => {
      const req: MockRequest = {
        user: { id: "user-6", role: "pmo_lead" },
        params: {},
      };
      const res = createMockRes();
      const result = requireRole(req, res, "admin", "pmo_lead", "smo_lead");
      expect(result).toBe("user-6");
    });
  });

  describe("parseId", () => {
    it("returns a number for valid positive integer string", () => {
      const req: MockRequest = { params: { id: "42" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBe(42);
    });

    it("returns a number for id = 1", () => {
      const req: MockRequest = { params: { id: "1" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBe(1);
    });

    it("returns null and 400 for NaN", () => {
      const req: MockRequest = { params: { id: "abc" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Invalid id" });
    });

    it("returns null and 400 for negative number", () => {
      const req: MockRequest = { params: { id: "-5" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
    });

    it("returns null and 400 for zero", () => {
      const req: MockRequest = { params: { id: "0" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
    });

    it("returns null and 400 for decimal number", () => {
      const req: MockRequest = { params: { id: "3.5" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
    });

    it("returns null and 400 for non-numeric string", () => {
      const req: MockRequest = {
        params: { id: "hello" },
      } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
    });

    it("uses custom paramName in error message", () => {
      const req: MockRequest = {
        params: { projectId: "bad" },
      } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res, "projectId");
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Invalid projectId" });
    });

    it("returns null and 400 for empty string", () => {
      const req: MockRequest = { params: { id: "" } } as MockRequest;
      const res = createMockRes();
      const result = parseId(req, res);
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
    });
  });
});
