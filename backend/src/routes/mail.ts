import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { sendMailRateLimit } from "../middleware/rateLimit.js";
import { getAuthorizedClient } from "../services/authService.js";
import { GmailService } from "../services/gmailService.js";
import type { EmailFilters } from "../types/mail.js";

export const mailRouter = Router();
mailRouter.use(requireAuth);

async function gmailFor(req: AuthedRequest) {
  const client = await getAuthorizedClient(req.userId!);
  return new GmailService(client);
}

const filtersSchema = z.object({
  query: z.string().optional(),
  from: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional(),
  label: z.enum(["INBOX", "STARRED", "SENT", "TRASH", "SPAM"]).optional(),
  maxResults: z.coerce.number().min(1).max(100).optional(),
  pageToken: z.string().optional(),
});

// GET /api/mail?label=INBOX&unreadOnly=true&after=...
mailRouter.get("/", async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const gmail = await gmailFor(req);
  const result = await gmail.listEmails(parsed.data as EmailFilters);
  res.json(result);
});
mailRouter.get("/drafts", async (req, res) => {
  const gmail = await gmailFor(req);
  const drafts = await gmail.listDrafts();

  res.json({ drafts });
});
mailRouter.get("/counts", async (req, res) => {
  const gmail = await gmailFor(req);
  const counts = await gmail.getMailCounts();

  res.json({ counts });
});
// GET /api/mail/thread/:threadId
mailRouter.get("/thread/:threadId", async (req, res) => {
  const gmail = await gmailFor(req);
  const emails = await gmail.getThread(req.params.threadId);
  res.json({ emails });
});
// GET /api/mail/:id
mailRouter.get("/:id", async (req, res) => {
  const gmail = await gmailFor(req);
  const email = await gmail.getEmail(req.params.id);
  res.json(email);
});

// POST /api/mail/:id/read  { read: boolean }
mailRouter.post("/:id/read", async (req, res) => {
  const schema = z.object({ read: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const gmail = await gmailFor(req);
  await gmail.markRead(req.params.id, parsed.data.read);
  res.json({ ok: true });
});
// POST /api/mail/:id/star  { starred: boolean }

mailRouter.post("/:id/star", async (req, res) => {
  const schema = z.object({ starred: z.boolean() });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const gmail = await gmailFor(req);

  await gmail.starEmail(req.params.id, parsed.data.starred);

  res.json({ ok: true });
});
// POST /api/mail/:id/trash
mailRouter.post("/:id/trash", async (req, res) => {
  const gmail = await gmailFor(req);

  await gmail.trashEmail(req.params.id);

  res.json({ ok: true });
});
mailRouter.post("/drafts/:id/delete", async (req, res) => {
  const gmail = await gmailFor(req);
  await gmail.deleteDraft(req.params.id);
  res.json({ ok: true });
});
const sendSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  inReplyTo: z.string().optional(),
  threadId: z.string().optional(),
});

// POST /api/mail/send
mailRouter.post("/send", sendMailRateLimit, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const gmail = await gmailFor(req);
  const result = await gmail.sendEmail(parsed.data);
  res.json(result);
});
