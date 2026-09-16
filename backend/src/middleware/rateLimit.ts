import rateLimit from "express-rate-limit";

// Two intentionally different limits: the assistant endpoint calls an LLM
// and can be chatted with quickly, so it gets a slightly higher ceiling;
// sending mail is the one truly consequential, externally-visible action in
// the app, so it gets a tighter one. Both are scoped per-IP, which is
// adequate for a single-tenant demo deployment; a real multi-tenant
// deployment would key this off the authenticated userId instead.

export const assistantRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many assistant requests — please wait a moment and try again." },
});

export const sendMailRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many send requests — please wait a moment and try again." },
});
