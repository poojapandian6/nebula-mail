import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../utils/env.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

const COOKIE_NAME = "nebula_session";

export function issueSessionCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.SESSION_JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

// Every mail/assistant route runs through this. Frontend never holds a
// Google token — only this signed, httpOnly session cookie, which we
// resolve to a userId and then to a server-side-refreshed OAuth client.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, env.SESSION_JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}
