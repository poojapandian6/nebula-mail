import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { assistantRateLimit } from "../middleware/rateLimit.js";
import { getAuthorizedClient } from "../services/authService.js";
import { runAssistantTurn } from "../assistant/orchestrator.js";
import { classifyAssistantError } from "../assistant/errors.js";
import { loadConversation, saveConversation } from "../services/conversationStore.js";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);
assistantRouter.use(assistantRateLimit);

const contextSchema = z.object({
  currentView: z.enum([
    "inbox",
    "favorites",
    "sent",
    "trash",
    "spam",
    "drafts",
    "compose",
    "detail",
  ]),
  openEmail: z.object({ id: z.string(), from: z.string(), subject: z.string(), snippet: z.string() }).nullable(),
  activeFilters: z.record(z.any()).nullable(),
});

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  context: contextSchema,
});

// POST /api/assistant/message
assistantRouter.post("/message", async (req: AuthedRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  console.log("[assistant] received context:", JSON.stringify(parsed.success ? parsed.data.context : req.body.context));
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const oauthClient = await getAuthorizedClient(req.userId!);
    const history = await loadConversation(req.userId!);

    const result = await runAssistantTurn({
      userMessage: parsed.data.message,
      context: parsed.data.context as any,
      history,
      oauthClient,
    });

    await saveConversation(req.userId!, result.updatedMessages);

    res.json({ reply: result.reply, directives: result.directives });
  } catch (err: any) {
    console.error("[assistant] turn failed:", err);
    const { status, message } = classifyAssistantError(err);
    res.status(status).json({ error: message });
  }
});

// DELETE /api/assistant/message  — reset conversation (useful for demos)
assistantRouter.delete("/message", async (req: AuthedRequest, res) => {
  await saveConversation(req.userId!, []);
  res.json({ ok: true });
});
