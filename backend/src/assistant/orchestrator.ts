import OpenAI from "openai";
import type { OAuth2Client } from "google-auth-library";
import { GmailService, buildGmailQuery } from "../services/gmailService.js";
import { assistantTools } from "./tools.js";
import { getXaiClient, getXaiModel, assertXaiConfigured } from "./xaiClient.js";
import type { UIDirective, UIContext, ComposeDraft } from "../types/directives.js";
import type { EmailFilters } from "../types/mail.js";
import type { StoredMessage } from "../services/conversationStore.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function systemPrompt(context: UIContext): string {
  return [
    "You are the in-app assistant for Nebula Mail, a Gmail client.",
    "You CONTROL the application through tools. Do not merely describe actions that you could take.",
    "Whenever a tool can perform the user's requested action, you MUST call that tool.",
    "",
    "CURRENT UI CONTEXT:",
    `- View: ${context.currentView}`,
    context.openEmail
      ? `- OPEN EMAIL: from ${context.openEmail.from}, subject "${context.openEmail.subject}", id: ${context.openEmail.id}`
      : "- OPEN EMAIL: none",
    context.activeFilters
      ? `- Active filters: ${JSON.stringify(context.activeFilters)}`
      : "- No filters active.",
    "",
    "CRITICAL TOOL RULES:",
    "",
    "IMPORTANT INTENT DISTINCTION:",
    "'open', 'view', 'show', or 'display' an email means OPEN_EMAIL, not a reply.",
    "If the user asks to open/view/show an email, NEVER call reply_to_open_email unless the same current message explicitly asks to reply/respond/answer.",
    "Examples:",
    "'open the latest email from David' -> open_email",
    "'view my latest email from David' -> open_email",
    "'show the latest email from David' -> open_email",
    "'reply to the latest email from David' -> reply_to_open_email",
    "'reply to this saying thanks' -> reply_to_open_email",
    "",
    "1. REPLY TO THE CURRENTLY OPEN EMAIL:",
    "If the user says anything like:",
    "'reply to this',",
    "'reply to this saying ...',",
    "'reply saying ...',",
    "'respond to this ...',",
    "'answer this email ...',",
    "and an OPEN EMAIL exists in the current UI context, you MUST call reply_to_open_email.",
    "NEVER answer only with text.",
    "NEVER ask which email they mean.",
    "NEVER tell them to open the email because it is already open.",
    "The body argument must contain the user's requested reply.",
    "The tool call itself must happen before giving any natural-language acknowledgement.",
    "",
    "2. FORWARD:",
    "If the user says 'forward this' or equivalent and an OPEN EMAIL exists, you MUST call forward_open_email.",
    "Do not merely explain how to forward it.",
    "",
    "3. COMPOSE:",
    "When the user wants to write and send an email, use send_email once To, Subject, and Body are known.",
    "The application itself handles the confirmation step.",
    "When the user only wants help drafting and has not indicated sending, use fill_compose.",
    "",
    "4. SEARCH:",
    "Use search_emails for email lookups and display the results in the main UI.",
    "Use apply_filter when the user asks to apply a persistent Inbox filter.",
    "",
    "5. OPEN EMAIL:",
    "Use open_email when the user asks to open a specific email.",
    "",
    "6. LABELS:",
    "Treat favorite, favorites, starred, or favorite emails as Gmail STARRED.",
    "Treat trash, deleted emails, deleted mail, or bin as Gmail TRASH.",
    "Treat spam, spam emails, junk mail, or junk emails as Gmail SPAM.",
    "",
    "7. DATE RANGES:",
    "For vague date ranges such as 'last 10 days', use afterDaysAgo: 10.",
    "",
    "8. RESPONSE STYLE:",
    "After a successful tool call, give one short acknowledgement.",
    "Do not repeat previous assistant responses.",
    "For a successful reply tool call, say: 'Reply is ready for your confirmation.'",
    "For a successful compose action, keep the acknowledgement concise.",
    "The UI action is the primary response.",
    "",
    "IMPORTANT:",
    "Conversation history may contain previous requests that look similar to the current request.",
    "Always follow the CURRENT UI CONTEXT and the CURRENT USER MESSAGE.",
    "Do not use an old conversation turn instead of the current open-email context.",
  ].join("\n");
}
export interface OrchestratorResult {
  reply: string;
  directives: UIDirective[];
  updatedMessages: StoredMessage[];
}

// Neutral, provider-agnostic shape for a single tool call — deliberately
// not tied to any one SDK's types, since this is exactly the boundary the
// rest of the assistant (executeTool and everything it calls) is written
// against. Swapping AI providers again in the future only means adapting
// the loop in runAssistantTurn to produce this shape; executeTool and the
// UIDirective contract don't change at all.
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export async function runAssistantTurn(params: {
  userMessage: string;
  context: UIContext;
  history: StoredMessage[];
  oauthClient: OAuth2Client;
}): Promise<OrchestratorResult> {
  const { userMessage, context, history, oauthClient } = params;

  // Fail fast with a clear, specific error if the assistant isn't
  // configured, rather than letting the request reach xAI and bounce back
  // as an opaque 401 further down.
  assertXaiConfigured();
  const client = getXaiClient();
  const model = getXaiModel();

  const gmail = new GmailService(oauthClient);
  const directives: UIDirective[] = [];

  // The system prompt is rebuilt fresh every turn from the live UI context
  // (current view/open email/filters) and is never persisted as part of
  // conversation history — history only stores the user/assistant/tool
  // exchange itself.
  // Keep only a small recent conversation window so old conversations
  // cannot push the Groq request over its per-minute token limit.
  // The live UI context above is always authoritative for the current turn.
  const recentHistory = history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-4);

  const messages: ChatMessage[] = [
    ...(recentHistory as ChatMessage[]),
    { role: "system", content: systemPrompt(context) },
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  // Tool-calling loop: keep going while Grok keeps requesting tools, capped
  // to avoid a runaway loop in a demo.
  for (let iteration = 0; iteration < 5; iteration++) {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 512,
      tools: assistantTools,
      tool_choice: "auto",
      messages,
    });

    const choice = response.choices[0];
    const message = choice.message;
    messages.push(message);

    if (typeof message.content === "string" && message.content.trim()) {
      finalText = message.content.trim();
    }

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue; // no other tool_call types exist today, but guard anyway

      let input: Record<string, any> = {};
      let parseError: string | null = null;
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parseError = "Malformed tool call: arguments were not valid JSON.";
      }

      let resultForModel: unknown;
      if (parseError) {
        resultForModel = { status: "error", message: parseError };
      } else {
        try {
          const outcome = await executeTool({ id: call.id, name: call.function.name, input }, { gmail, context });
          resultForModel = outcome.resultForModel;
          if (outcome.directive) directives.push(outcome.directive);
        } catch (err: any) {
          // A single tool failing (e.g. a transient Gmail API error)
          // shouldn't crash the whole assistant turn — report it back to
          // the model as a tool result so it can explain the failure to
          // the user, the same way any other "not_found"/"error" tool
          // outcome already does.
          resultForModel = { status: "error", message: err.message ?? "Tool execution failed." };
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(resultForModel),
      });
    }
  }

  // Strip the system message before persisting — it's regenerated fresh
  // from live UI context on every turn, never stored.
  const persistable = messages.filter((m) => m.role !== "system");

  return {
    reply: finalText || "Done.",
    directives,
    updatedMessages: persistable as unknown as StoredMessage[],
  };
}

// Exported so it can be unit-tested against a mocked GmailService without
// needing a live xAI API call (see __tests__/orchestrator.test.ts). This
// function's tool→UIDirective mapping is provider-agnostic — only the
// caller's tool-call shape (see ToolCall above) is specific to whichever
// AI provider is wired in.
export async function executeTool(
  call: ToolCall,
  ctx: { gmail: GmailService; context: UIContext }
): Promise<{ resultForModel: unknown; directive: UIDirective | null }> {
  const { gmail, context } = ctx;
  const input = call.input;

  switch (call.name) {
    case "fill_compose": {
      const draft: ComposeDraft = {
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
      };

      return {
        resultForModel: { status: "compose form opened and filled", draft },
        directive: { type: "OPEN_COMPOSE", payload: draft },
      };
    }

    case "send_email": {
      // Deliberately does NOT call gmail.sendEmail here. Real human-in-the-
      // loop confirmation: the model can call this tool freely, but nothing
      // is actually sent until the user clicks "Confirm send" in the UI
      // (ComposeView), which calls POST /api/mail/send directly — the same
      // endpoint a fully manual compose uses. This guarantees the assistant
      // can never send an email the user hasn't explicitly approved in the
      // interface, regardless of how the model reasons about the chat text,
      // and regardless of which AI provider is driving the tool calls.
      const draft: ComposeDraft = {
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
        inReplyTo: input.inReplyTo,
        threadId: input.threadId,
      };
      return {
        resultForModel: { status: "awaiting_user_confirmation", draft },
        directive: { type: "SEND_CONFIRMATION_REQUIRED", payload: { draft } },
      };
    }

    case "search_emails": {
      const filters = daysAgoFiltersToDates(input);

      if (input.label === "DRAFTS") {
        const drafts = await gmail.listDrafts();

        return {
          resultForModel: {
            status: "ok",
            count: drafts.length,
            emails: drafts.map((e) => ({
              id: e.id,
              from: e.from.email,
              subject: e.subject,
              date: e.date,
            })),
          },
          directive: {
            type: "SHOW_SEARCH_RESULTS",
            payload: {
              emails: drafts,
              filters,
              displayLabel: "DRAFTS",
              description: "Your draft emails",
            },
          },
        };
      }

      const result = await gmail.listEmails(filters);
      const exactCount = await gmail.countEmails(filters);

      return {
        resultForModel: {
          status: "ok",
          count: exactCount,
        },
        directive: {
          type: "SHOW_SEARCH_RESULTS",
          payload: {
            emails: result.emails,
            filters,
            description: describeFilters(filters),
            nextPageToken: result.nextPageToken,
            resultSizeEstimate: exactCount,
          },
        },
      };
    }
    case "apply_filter": {
      const filters = daysAgoFiltersToDates(input);
      filters.label = "INBOX";
      return {
        resultForModel: { status: "filter applied", filters },
        directive: { type: "APPLY_FILTER", payload: { filters } },
      };
    }

    case "open_email": {
      let emailId = input.emailId as string | undefined;
      if (!emailId) {
        const filters: EmailFilters = { from: input.from, query: input.subjectContains, maxResults: 1 };
        const result = await gmail.listEmails(filters);
        emailId = result.emails[0]?.id;
      }
      if (!emailId) {
        return { resultForModel: { status: "not_found" }, directive: null };
      }
      const detail = await gmail.getEmail(emailId);
      if (detail.isUnread) await gmail.markRead(emailId, true);
      return {
        resultForModel: { status: "ok", subject: detail.subject, from: detail.from.email },
        directive: { type: "OPEN_EMAIL", payload: { email: detail } },
      };
    }

    case "reply_to_open_email": {
      if (!context.openEmail) {
        return {
          resultForModel: { status: "error", message: "No email is currently open to reply to." },
          directive: null,
        };
      }

      const original = await gmail.getEmail(context.openEmail.id);
      const originalSubject = original.subject.trim();

      const lowerSubject = originalSubject.toLowerCase().trim();

      const genericSubjects = new Set([
        "hi",
        "hii",
        "hiii",
        "hello",
        "hey",
        "heyy",
        "greetings",
        "test",
        "testing",
        "no subject",
        "(no subject)",
      ]);

      const looksRandom = (() => {
        if (originalSubject.length === 0 || originalSubject.length > 4) {
          return false;
        }

        const compact = originalSubject.replace(/[^a-z]/gi, "").toLowerCase();

        if (compact.length < 3) return false;

        // Very short consonant-only strings such as "hhs" or "xyz".
        const consonantsOnly = /^[bcdfghjklmnpqrstvwxyz]+$/i.test(compact);

        // Repeated-character strings such as "aaa" or "xxx".
        const repeatedCharacters = /^([a-z])\1+$/i.test(compact);

        return consonantsOnly || repeatedCharacters;
      })();

      const shouldGenerateSubject =
        !originalSubject ||
        genericSubjects.has(lowerSubject) ||
        looksRandom;

      let replySubject = originalSubject;

      if (shouldGenerateSubject) {
        const subjectResponse = await getXaiClient().chat.completions.create({
          model: getXaiModel(),
          max_tokens: 50,
          messages: [
            {
              role: "system",
              content:
                "Generate a short, meaningful email reply subject using the original email content and the user's reply. " +
                "If the original subject is generic, vague, or random, create a subject from the email body. " +
                "For example, if the body says 'Can we discuss the project tomorrow at 7 PM?', return 'Project Discussion Tomorrow at 7 PM'. " +
                "If the body has no useful information, return exactly 'Reply to your message'. " +
                "Return ONLY the subject text. Never return an empty response. Do not include 'Re:', quotes, or explanations.",
              },
            {
              role: "user",
              content: `Original email subject: ${originalSubject || "(no subject)"}
              Original email body:
              ${original.bodyText}

              User's reply:
              ${input.body}`,
            },
          ],
        });

        const generatedSubject =
          subjectResponse.choices[0]?.message?.content?.trim();
        console.log("[assistant] generated reply subject:", JSON.stringify(generatedSubject));
        console.log("[assistant] original body:", JSON.stringify(original.bodyText));

        const generatedIsUsable =
          generatedSubject &&
          generatedSubject.length <= 80 &&
          !/^(re:\s*)?(hi|hii|hiii|hello|hey|heyy|test|testing|greetings|no subject)$/i.test(
            generatedSubject
          );

        replySubject = generatedIsUsable
          ? generatedSubject
          : "Reply to your message";
      }

      const draft: ComposeDraft = {
        to: original.from.email,
        subject: replySubject.startsWith("Re:")
          ? replySubject
          : `Re: ${replySubject}`,
        body: input.body,
        inReplyTo: original.id,
        threadId: original.threadId,
      };

      return {
        resultForModel: { status: "reply drafted", draft },
        directive: { type: "OPEN_REPLY", payload: { inReplyToId: original.id, draft } },
      };
    }

    case "forward_open_email": {
      if (!context.openEmail) {
        return {
          resultForModel: { status: "error", message: "No email is currently open to forward." },
          directive: null,
        };
      }
      const original = await gmail.getEmail(context.openEmail.id);
      const quoted = [
        input.note ? `${input.note}\n` : "",
        `---------- Forwarded message ----------`,
        `From: ${original.from.name || original.from.email} <${original.from.email}>`,
        `Date: ${new Date(original.date).toLocaleString()}`,
        `Subject: ${original.subject}`,
        "",
        original.bodyText,
      ].join("\n");
      const draft: ComposeDraft = {
        to: input.to,
        subject: original.subject.startsWith("Fwd:") ? original.subject : `Fwd: ${original.subject}`,
        body: quoted,
      };
      return {
        resultForModel: { status: "forward drafted", draft },
        directive: { type: "OPEN_COMPOSE", payload: draft },
      };
    }

    default:
      return { resultForModel: { status: "error", message: `Unknown tool ${call.name}` }, directive: null };
  }
}

function daysAgoFiltersToDates(input: Record<string, any>): EmailFilters {
  const filters: EmailFilters = {
    query: input.query,
    from: input.from,
    unreadOnly: input.unreadOnly,
    label: input.label,
  };

  if (typeof input.afterDaysAgo === "number") {
    const date = new Date(
      Date.now() - (input.afterDaysAgo - 1) * 86400_000
    );

    filters.after = date.toISOString();
  }

  if (typeof input.beforeDaysAgo === "number") {
    filters.before = new Date(
      Date.now() - input.beforeDaysAgo * 86400_000
    ).toISOString();
  }

  return filters;
}

function describeFilters(filters: EmailFilters): string {
  const bits: string[] = [];
  if (filters.from) bits.push(`from ${filters.from}`);
  if (filters.query) bits.push(`matching "${filters.query}"`);
  if (filters.after) bits.push(`after ${new Date(filters.after).toLocaleDateString()}`);
  if (filters.before) bits.push(`before ${new Date(filters.before).toLocaleDateString()}`);
  if (filters.unreadOnly) bits.push("unread only");
  return bits.length ? `Emails ${bits.join(", ")}` : "Search results";
}

// Re-export for reuse by routes/assistant.ts without re-importing gmailService there.
export { buildGmailQuery };
