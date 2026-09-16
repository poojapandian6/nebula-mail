// Pure, DB-free logic for capping stored Grok/OpenAI-format conversation
// history. Deliberately split out from conversationStore.ts (which talks to
// Prisma) so this can be unit-tested — and used anywhere else it's needed —
// without requiring a live database connection or a generated Prisma client.

export interface StoredMessage {
  role: "user" | "assistant" | "tool";
  content: any; // string for user/tool messages; string | null for assistant
  tool_calls?: any; // present on assistant messages that requested tool calls
  tool_call_id?: string; // present on "tool" role messages, links back to the call
}

const MAX_STORED_MESSAGES = 40;

// A "turn" is: one real user message followed by everything the
// tool-calling loop produced in response (assistant messages carrying
// `tool_calls`, interleaved with "tool"-role messages carrying their
// results). Trimming by raw message count is unsafe here: the xAI/OpenAI
// Chat Completions API requires every `tool_calls` entry on an assistant
// message to have a matching "tool"-role message with that `tool_call_id`
// later in the same request, and cutting a fixed-size window can land
// inside that pair — e.g. keeping an assistant message's tool_calls but
// dropping the tool result that answers one of them. That produces a 400
// from the API on the very next turn.
//
// Some AI providers' message formats put a tool result on a *user*-role
// message as a content block alongside other content, which would require
// inspecting message content to tell a real user turn apart from a
// tool-result continuation. OpenAI/xAI's format instead gives tool results
// their own dedicated "tool" role, so every role:"user" message here is
// unambiguously a genuine new turn — no content inspection needed, which is
// what keeps this check simple.
function isTurnStart(message: StoredMessage): boolean {
  return message.role === "user";
}

export function trimConversation(messages: StoredMessage[], maxMessages = MAX_STORED_MESSAGES): StoredMessage[] {
  if (messages.length <= maxMessages) return messages;

  const window = messages.slice(-maxMessages);
  const boundaryIndex = window.findIndex(isTurnStart);

  if (boundaryIndex === -1) {
    // No clean turn boundary inside the window at all (only plausible with
    // one pathologically long tool-calling turn, capped at 5 iterations by
    // the orchestrator, so effectively unreachable) — keep everything
    // rather than risk trimming to an invalid sequence.
    return messages;
  }

  return window.slice(boundaryIndex);
}
