import { describe, it, expect, vi } from "vitest";
import { executeTool, type ToolCall } from "../assistant/orchestrator.js";
import type { GmailService } from "../services/gmailService.js";
import type { UIContext } from "../types/directives.js";

// A neutral fake tool call in the same shape the orchestrator's tool-calling
// loop produces after parsing a Grok/xAI function call's JSON arguments —
// see ToolCall in orchestrator.ts. This plain {id, name, input} shape (not
// tied to any one AI provider's own tool-call wire format) is itself part
// of what these tests verify: executeTool's provider-agnostic contract.
function fakeToolCall(name: string, input: Record<string, any>): ToolCall {
  return { id: "call_1", name, input };
}

const emptyContext: UIContext = { currentView: "inbox", openEmail: null, activeFilters: null };

describe("executeTool", () => {
  it("fill_compose emits an OPEN_COMPOSE directive without sending anything", async () => {
    const gmail = { sendEmail: vi.fn() } as unknown as GmailService;
    const { directive, resultForModel } = await executeTool(
      fakeToolCall("fill_compose", { to: "john@example.com", subject: "Meeting Tomorrow", body: "Let's meet at 3pm" }),
      { gmail, context: emptyContext }
    );

    expect(directive).toEqual({
      type: "OPEN_COMPOSE",
      payload: { to: "john@example.com", cc: undefined, subject: "Meeting Tomorrow", body: "Let's meet at 3pm" },
    });
    expect(gmail.sendEmail).not.toHaveBeenCalled();
    expect(resultForModel).toMatchObject({ status: "compose form opened and filled" });
  });

  it("send_email never calls gmail.sendEmail directly — it requires explicit UI confirmation first", async () => {
    // This is the human-in-the-loop guarantee: the model can call send_email
    // freely, but the actual Gmail send only ever happens from the
    // Confirm-send button in ComposeView (POST /api/mail/send), never from
    // inside the tool-calling loop itself. This holds regardless of which
    // AI provider is driving tool calls, since it's enforced in executeTool,
    // not in the model's own reasoning/prompting.
    const gmail = { sendEmail: vi.fn() } as unknown as GmailService;

    const { directive, resultForModel } = await executeTool(
      fakeToolCall("send_email", { to: "john@example.com", subject: "Hi", body: "Body" }),
      { gmail, context: emptyContext }
    );

    expect(gmail.sendEmail).not.toHaveBeenCalled();
    expect(directive).toEqual({
      type: "SEND_CONFIRMATION_REQUIRED",
      payload: { draft: { to: "john@example.com", cc: undefined, subject: "Hi", body: "Body", inReplyTo: undefined, threadId: undefined } },
    });
    expect(resultForModel).toMatchObject({ status: "awaiting_user_confirmation" });
  });

  it("search_emails returns a SHOW_SEARCH_RESULTS directive carrying the matched emails", async () => {
    const fakeEmails = [
      { id: "1", threadId: "t1", from: { name: "Sarah", email: "sarah@x.com" }, to: [], subject: "Project update", snippet: "…", date: new Date().toISOString(), isUnread: true, labelIds: [] },
    ];
    const gmail = {
      listEmails: vi.fn().mockResolvedValue({ emails: fakeEmails, resultSizeEstimate: 1 }),
    } as unknown as GmailService;

    const { directive } = await executeTool(fakeToolCall("search_emails", { from: "Sarah" }), {
      gmail,
      context: emptyContext,
    });

    expect(directive?.type).toBe("SHOW_SEARCH_RESULTS");
    if (directive?.type === "SHOW_SEARCH_RESULTS") {
      expect(directive.payload.emails).toHaveLength(1);
      expect(directive.payload.emails[0].from.email).toBe("sarah@x.com");
    }
  });

  it("apply_filter returns an APPLY_FILTER directive scoped to the inbox, converting afterDaysAgo to a date", async () => {
    const gmail = {} as unknown as GmailService;

    const { directive, resultForModel } = await executeTool(
      fakeToolCall("apply_filter", { unreadOnly: true, afterDaysAgo: 7 }),
      { gmail, context: emptyContext }
    );

    expect(directive?.type).toBe("APPLY_FILTER");
    if (directive?.type === "APPLY_FILTER") {
      expect(directive.payload.filters.unreadOnly).toBe(true);
      expect(directive.payload.filters.label).toBe("INBOX");
      expect(directive.payload.filters.after).toBeDefined();
    }
    expect(resultForModel).toMatchObject({ status: "filter applied" });
  });

  it("open_email resolves a search when no emailId is given, marks it read, and opens it", async () => {
    const fakeSummary = { id: "42", threadId: "t42" };
    const fakeDetail = {
      id: "42",
      threadId: "t42",
      from: { name: "David", email: "david@x.com" },
      subject: "Q3 numbers",
      isUnread: true,
    };
    const gmail = {
      listEmails: vi.fn().mockResolvedValue({ emails: [fakeSummary], resultSizeEstimate: 1 }),
      getEmail: vi.fn().mockResolvedValue(fakeDetail),
      markRead: vi.fn().mockResolvedValue(undefined),
    } as unknown as GmailService;

    const { directive, resultForModel } = await executeTool(fakeToolCall("open_email", { from: "David" }), {
      gmail,
      context: emptyContext,
    });

    expect(gmail.listEmails).toHaveBeenCalledWith(expect.objectContaining({ from: "David", maxResults: 1 }));
    expect(gmail.getEmail).toHaveBeenCalledWith("42");
    expect(gmail.markRead).toHaveBeenCalledWith("42", true);
    expect(directive).toEqual({ type: "OPEN_EMAIL", payload: { email: fakeDetail } });
    expect(resultForModel).toMatchObject({ status: "ok", subject: "Q3 numbers" });
  });

  it("open_email reports not_found when no match exists, without throwing", async () => {
    const gmail = {
      listEmails: vi.fn().mockResolvedValue({ emails: [], resultSizeEstimate: 0 }),
    } as unknown as GmailService;

    const { directive, resultForModel } = await executeTool(fakeToolCall("open_email", { from: "nobody" }), {
      gmail,
      context: emptyContext,
    });

    expect(directive).toBeNull();
    expect(resultForModel).toMatchObject({ status: "not_found" });
  });

  it("reply_to_open_email refuses when no email is currently open", async () => {
    const gmail = {} as unknown as GmailService;
    const { directive, resultForModel } = await executeTool(fakeToolCall("reply_to_open_email", { body: "Sounds good" }), {
      gmail,
      context: emptyContext, // openEmail: null
    });

    expect(directive).toBeNull();
    expect(resultForModel).toMatchObject({ status: "error" });
  });

  it("forward_open_email refuses when no email is currently open", async () => {
    const gmail = {} as unknown as GmailService;
    const { directive, resultForModel } = await executeTool(fakeToolCall("forward_open_email", { to: "x@x.com" }), {
      gmail,
      context: emptyContext,
    });
    expect(directive).toBeNull();
    expect(resultForModel).toMatchObject({ status: "error" });
  });

  it("forward_open_email quotes the open email into a new OPEN_COMPOSE draft", async () => {
    const gmail = {
      getEmail: vi.fn().mockResolvedValue({
        id: "orig1",
        threadId: "thread1",
        from: { name: "David", email: "david@x.com" },
        subject: "Project update",
        date: new Date().toISOString(),
        bodyText: "Here's the plan for next week.",
      }),
    } as unknown as GmailService;

    const context: UIContext = {
      currentView: "detail",
      openEmail: { id: "orig1", from: "david@x.com", subject: "Project update", snippet: "…" },
      activeFilters: null,
    };

    const { directive } = await executeTool(fakeToolCall("forward_open_email", { to: "sarah@x.com", note: "FYI" }), {
      gmail,
      context,
    });

    expect(directive?.type).toBe("OPEN_COMPOSE");
    if (directive?.type === "OPEN_COMPOSE") {
      expect(directive.payload.to).toBe("sarah@x.com");
      expect(directive.payload.subject).toBe("Fwd: Project update");
      expect(directive.payload.body).toContain("FYI");
      expect(directive.payload.body).toContain("Here's the plan for next week.");
      expect(directive.payload.body).toContain("From: David <david@x.com>");
    }
  });

  it("reply_to_open_email pre-fills a reply using the open email as context", async () => {
    const gmail = {
      getEmail: vi.fn().mockResolvedValue({
        id: "orig1",
        threadId: "thread1",
        from: { name: "David", email: "david@x.com" },
        subject: "Project update",
      }),
    } as unknown as GmailService;

    const context: UIContext = {
      currentView: "detail",
      openEmail: { id: "orig1", from: "david@x.com", subject: "Project update", snippet: "…" },
      activeFilters: null,
    };

    const { directive } = await executeTool(fakeToolCall("reply_to_open_email", { body: "Sounds good, see you then." }), {
      gmail,
      context,
    });

    expect(directive?.type).toBe("OPEN_REPLY");
    if (directive?.type === "OPEN_REPLY") {
      expect(directive.payload.draft.to).toBe("david@x.com");
      expect(directive.payload.draft.subject).toBe("Re: Project update");
      expect(directive.payload.draft.body).toBe("Sounds good, see you then.");
    }
  });
});
