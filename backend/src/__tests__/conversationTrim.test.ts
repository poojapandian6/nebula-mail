import { describe, it, expect } from "vitest";
import { trimConversation, type StoredMessage } from "../services/conversationTrim.js";

// Fixtures use the OpenAI/xAI chat-message shape: tool calls live on an
// assistant message's `tool_calls` array (content is null), and each tool's
// result is its own separate "tool"-role message carrying `tool_call_id`.
function userText(text: string): StoredMessage {
  return { role: "user", content: text };
}
function assistantToolCall(id: string): StoredMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name: "search_emails", arguments: "{}" } }],
  };
}
function toolResult(id: string): StoredMessage {
  return { role: "tool", tool_call_id: id, content: "{}" };
}
function assistantText(text: string): StoredMessage {
  return { role: "assistant", content: text };
}

describe("trimConversation", () => {
  it("returns everything unchanged when under the limit", () => {
    const messages = [userText("hi"), assistantText("hello")];
    expect(trimConversation(messages, 40)).toEqual(messages);
  });

  it("never starts the trimmed history with an orphaned tool result", () => {
    // Build a long history of complete turns, each: user text -> assistant
    // tool call -> tool result -> assistant text.
    const messages: StoredMessage[] = [];
    for (let i = 0; i < 15; i++) {
      messages.push(userText(`turn ${i}`), assistantToolCall(`call_${i}`), toolResult(`call_${i}`), assistantText(`done ${i}`));
    }

    const trimmed = trimConversation(messages, 10);

    // The very first message of the trimmed window must be a genuine user
    // turn start, never a lingering "tool" message from a turn we partially
    // cut.
    expect(trimmed[0].role).toBe("user");
    expect(typeof trimmed[0].content).toBe("string");

    // Every tool_calls entry in the trimmed history must have its matching
    // "tool" result message also present (no dangling tool call either).
    const toolCallIds = trimmed
      .filter((m) => m.role === "assistant" && Array.isArray(m.tool_calls))
      .flatMap((m) => m.tool_calls.map((c: any) => c.id));
    const toolResultIds = trimmed.filter((m) => m.role === "tool").map((m) => m.tool_call_id);
    for (const id of toolCallIds) {
      expect(toolResultIds).toContain(id);
    }
  });

  it("keeps the most recent turns, dropping only older ones", () => {
    const messages: StoredMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(userText(`turn ${i}`), assistantText(`reply ${i}`));
    }
    const trimmed = trimConversation(messages, 6);
    // Should retain the tail end (most recent turns), not the head.
    expect(trimmed[trimmed.length - 1]).toEqual(assistantText("reply 9"));
    expect(JSON.stringify(trimmed)).not.toContain("turn 0\"");
  });

  it("falls back to keeping everything if no safe boundary exists in the window", () => {
    // A single pathologically long turn: one user message followed entirely
    // by tool-call/tool-result pairs, longer than the trim window.
    const messages: StoredMessage[] = [userText("start")];
    for (let i = 0; i < 20; i++) {
      messages.push(assistantToolCall(`call_${i}`), toolResult(`call_${i}`));
    }
    const trimmed = trimConversation(messages, 5);
    // No user-text turn-start exists inside the last 5 messages, so we must
    // not truncate into an invalid sequence — keep the full history instead.
    expect(trimmed).toEqual(messages);
  });
});
