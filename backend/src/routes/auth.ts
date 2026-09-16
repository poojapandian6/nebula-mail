import { Router } from "express";
import jwt from "jsonwebtoken";
import { getAuthUrl, handleOAuthCallback } from "../services/authService.js";
import {
  issueSessionCookie,
  clearSessionCookie,
  requireAuth,
  type AuthedRequest,
} from "../middleware/auth.js";
import { prisma } from "../db/client.js";
import { env } from "../utils/env.js";
import { registerGmailWatch } from "../services/watchService.js";

export const authRouter = Router();

authRouter.get("/google", (_req, res) => {
  res.redirect(getAuthUrl());
});

authRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const user = await handleOAuthCallback(code);
    issueSessionCookie(res, user.id);

    registerGmailWatch(user.id).catch((err) =>
      console.warn(
        "[watch] failed to register Gmail watch on login:",
        err.message
      )
    );

    res.redirect(env.FRONTEND_URL);
  } catch (err: any) {
    console.error("[oauth] callback failed:", err);
    res.redirect(
      `${env.FRONTEND_URL}/?authError=${encodeURIComponent(
        err.message ?? "oauth_failed"
      )}`
    );
  }
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/**
 * Issue a short-lived token specifically for Socket.IO.
 *
 * The normal session cookie authenticates this request because it
 * goes through the frontend /api proxy. The returned token is then
 * sent through the Socket.IO handshake to the backend.
 */
authRouter.get("/socket-token", requireAuth, (req: AuthedRequest, res) => {
  const token = jwt.sign(
    {
      sub: req.userId!,
      type: "socket",
    },
    env.SESSION_JWT_SECRET,
    {
      expiresIn: "5m",
    }
  );

  res.json({ token });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, email: true },
  });

  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json(user);
});