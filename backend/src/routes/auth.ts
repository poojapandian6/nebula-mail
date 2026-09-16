import { Router } from "express";
import { getAuthUrl, handleOAuthCallback } from "../services/authService.js";
import { issueSessionCookie, clearSessionCookie, requireAuth, type AuthedRequest } from "../middleware/auth.js";
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

    // Best-effort: register Gmail push notifications right after login so
    // real-time sync is live without any extra user action. Failures here
    // (e.g. Pub/Sub not configured yet) shouldn't block login.
    registerGmailWatch(user.id).catch((err) =>
      console.warn("[watch] failed to register Gmail watch on login:", err.message)
    );

    res.redirect(env.FRONTEND_URL);
  } catch (err: any) {
    console.error("[oauth] callback failed:", err);
    res.redirect(`${env.FRONTEND_URL}/?authError=${encodeURIComponent(err.message ?? "oauth_failed")}`);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, email: true } });
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json(user);
});
