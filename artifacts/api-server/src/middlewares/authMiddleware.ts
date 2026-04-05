import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  // Token expired — try to refresh, but NEVER log user out on failure
  if (session.refresh_token) {
    try {
      const config = await getOidcConfig();
      const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
      session.access_token = tokens.access_token;
      session.refresh_token = tokens.refresh_token ?? session.refresh_token;
      session.expires_at = tokens.expiresIn()
        ? now + tokens.expiresIn()!
        : now + 8 * 60 * 60; // fallback: 8 h
      await updateSession(sid, session);
      return session;
    } catch {
      // Refresh failed — extend session locally so we don't retry every request
      session.expires_at = now + 8 * 60 * 60;
      await updateSession(sid, session);
    }
  } else {
    // No refresh token — extend so we don't check on every request
    session.expires_at = now + 8 * 60 * 60;
    await updateSession(sid, session);
  }

  // Fall back to existing session data — user stays logged in
  return session;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  req.user = refreshed.user;
  next();
}
