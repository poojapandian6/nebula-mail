import type OpenAI from "openai";

// Every tool here corresponds to exactly one thing the UI can do. The model
// never gets a "run arbitrary code" or "render this HTML" tool — that's
// what keeps AI-driven actions safe and demo-reliable. Descriptions are
// written for the model, not for humans, so they're deliberately explicit
// about when to use each tool.
//
// Shape: OpenAI-compatible function-calling tools (`type: "function"`,
// JSON Schema `parameters`). Groq is served through an OpenAI-compatible
// Chat Completions API.

export const assistantTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fill_compose",
      description:
        "Open the Compose view and visibly fill in the To/Cc/Bcc/Subject/Body fields from the user's request. " +
        "Use this whenever the user wants to write or send an email. This does NOT send the email — it only " +
        "populates the form so the user (or a follow-up send_email call after explicit confirmation) can send it. " +
        "Always call this before send_email.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Comma-separated recipient email address(es)",
          },
          cc: {
            type: "string",
            description: "Comma-separated CC address(es), if any",
          },
          bcc: {
            type: "string",
            description: "Comma-separated BCC address(es), if any",
          },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "send_email",
      description:
        "Prepares an email to be sent via Gmail. Call this whenever the user wants an email sent — the app itself " +
        "always shows the user a confirmation step before anything actually goes out, so you do not need to judge " +
        "whether they've confirmed enough; just call this as soon as you have To/Subject/Body. The user will see " +
        "the compose form fill in and a 'Confirm send' control; nothing is sent until they act on it.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Comma-separated recipient email address(es)",
          },
          cc: {
            type: "string",
            description: "Comma-separated CC address(es)",
          },
          bcc: {
            type: "string",
            description: "Comma-separated BCC address(es)",
          },
          subject: { type: "string" },
          body: { type: "string" },
          inReplyTo: {
            type: "string",
            description: "Gmail message id being replied to, if this is a reply",
          },
          threadId: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "search_emails",
      description:
        "Search for emails and display the results in the main UI. " +
        "Use this for one-off searches AND for navigating to a specific mailbox. " +
        "For Favorites/Starred use label STARRED. " +
        "For Trash use label TRASH. " +
        "For Spam/Junk use label SPAM. " +
        "For Sent use label SENT. " +
        "For Drafts use label DRAFTS. " +
        "Do NOT use apply_filter for these mailbox navigation requests.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text keywords to search for (subject/body)",
          },
          from: {
            type: "string",
            description: "Sender name or email to filter by",
          },
          afterDaysAgo: {
            type: "number",
            description: "Only emails from at most this many days ago",
          },
          beforeDaysAgo: {
            type: "number",
            description: "Only emails older than this many days ago",
          },
          unreadOnly: { type: "boolean" },
          label: {
            type: "string",
            enum: ["INBOX", "SENT", "STARRED", "TRASH", "SPAM", "DRAFTS"],
            description:
              "Gmail label to filter by. Use STARRED when the user says favorite, favorites, starred, starred emails, or wants their favorite emails.",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "apply_filter",
      description:
        "Apply a persistent filter to the Inbox view itself. " +
        "ONLY use this for filtering the Inbox, such as 'show only unread emails' " +
        "or 'show emails from Sarah this week'. " +
        "Do NOT use this for navigating to Starred/Favorites, Trash, Spam, Sent, or Drafts. " +
        "For those mailboxes, use search_emails with the appropriate label.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          afterDaysAgo: { type: "number" },
          beforeDaysAgo: { type: "number" },
          unreadOnly: { type: "boolean" },
          query: { type: "string" },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "open_email",
      description:
        "Navigate to and open a specific email in the detail view. Use for 'open the latest email from David' or " +
        "'open that email'. Provide search criteria to locate it (the most recent match is opened).",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Sender name or email to match",
          },
          subjectContains: { type: "string" },
          emailId: {
            type: "string",
            description: "Exact Gmail message id, if already known from prior results",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "reply_to_open_email",
      description:
        "Open a reply to the email the user currently has open in the Detail view, pre-filled with the given body. " +
        "Use this for 'reply to this' / 'reply saying ...'. Requires that the UI context includes an open email — " +
        "if there isn't one, tell the user which email to open first instead of calling this tool.",
      parameters: {
        type: "object",
        properties: {
          body: {
            type: "string",
            description: "The reply body to pre-fill",
          },
        },
        required: ["body"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "forward_open_email",
      description:
        "Forward the email the user currently has open in the Detail view to a new recipient, with the original " +
        "message quoted in the body. Use this for 'forward this to ...'. Requires an open email in context, same " +
        "as reply_to_open_email.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Comma-separated recipient email address(es) to forward to",
          },
          note: {
            type: "string",
            description: "Optional short note to prepend above the quoted original message",
          },
        },
        required: ["to"],
      },
    },
  },
];