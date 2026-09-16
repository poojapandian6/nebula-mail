import { prisma } from "../db/client.js";
import { trimConversation, type StoredMessage } from "./conversationTrim.js";

export type { StoredMessage };

// One conversation row per user (kept simple for this build — a real
// multi-thread inbox-of-conversations UI is out of scope for 5 days).
// Messages are stored in the AI provider's chat-message shape (currently
// OpenAI/xAI-format — see conversationTrim.ts) so they can be replayed
// straight back into the next API call. Trimming logic itself lives in
// conversationTrim.ts — see that file for why a naive slice is unsafe here.

export async function loadConversation(userId: string): Promise<StoredMessage[]> {
  const convo = await prisma.assistantConversation.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (!convo) return [];
  try {
    return JSON.parse(convo.messages);
  } catch {
    return [];
  }
}

export async function saveConversation(userId: string, messages: StoredMessage[]): Promise<void> {
  // Cap history length so the assistant's context doesn't grow unbounded
  // across a long demo session, without ever splitting a tool-call/
  // tool-result pair.
  const trimmed = trimConversation(messages);
  const existing = await prisma.assistantConversation.findFirst({ where: { userId } });
  if (existing) {
    await prisma.assistantConversation.update({
      where: { id: existing.id },
      data: { messages: JSON.stringify(trimmed) },
    });
  } else {
    await prisma.assistantConversation.create({
      data: { userId, messages: JSON.stringify(trimmed) },
    });
  }
}
