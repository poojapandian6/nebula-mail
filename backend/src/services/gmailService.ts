import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type {
  EmailSummary,
  EmailDetail,
  SendEmailInput,
  EmailFilters,
  ListEmailsResult,
} from "../types/mail.js";

// gmailService is the single seam between "our domain types" and "Gmail's
// wire format." Nothing else in the app imports `googleapis` directly —
// that keeps mailService swappable (see mailService.ts) and keeps the
// assistant/orchestrator provider-agnostic.

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function parseAddressList(header: string | undefined): { name: string; email: string }[] {
  if (!header) return [];
  return header.split(",").map((part) => {
    const match = part.trim().match(/^(.*?)\s*<(.+)>$/);
    if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
    return { name: part.trim(), email: part.trim() };
  });
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): { text: string; html: string | null } {
  if (!payload) return { text: "", html: null };

  let text = "";
  let html: string | null = null;

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html = (html ?? "") + decodeBase64Url(part.body.data);
    }

    part.parts?.forEach(walk);
  }

  walk(payload);

  if (!text && payload.body?.data) {
    text = decodeBase64Url(payload.body.data);
  }

  // Some emails/drafts contain only HTML.
  // Create a readable plain-text version for the Compose textarea.
  if (!text && html !== null) {
    const htmlBody: string = html;

    text = htmlBody
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim();
  }

  return { text, html };
}

function toSummary(message: gmail_v1.Schema$Message): EmailSummary {
  const headers = message.payload?.headers;
  const from = parseAddressList(getHeader(headers, "From"))[0] ?? { name: "", email: "" };
  const to = parseAddressList(getHeader(headers, "To"));

  return {
    id: message.id!,
    threadId: message.threadId!,
    from,
    to,
    subject: getHeader(headers, "Subject") || "(no subject)",
    snippet: message.snippet ?? "",
    date: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
    isUnread: (message.labelIds ?? []).includes("UNREAD"),
    labelIds: message.labelIds ?? [],
  };
}

function toDetail(message: gmail_v1.Schema$Message): EmailDetail {
  const summary = toSummary(message);
  const headers = message.payload?.headers;
  const { text, html } = extractBody(message.payload);
  return {
    ...summary,
    bodyText: text,
    bodyHtml: html,
    cc: parseAddressList(getHeader(headers, "Cc")),
  };
}

// Builds a Gmail search query string from our provider-agnostic filters.
// This is what lets the assistant say "emails from the last 10 days" and
// have it become `after:2026/08/31` — Gmail's own query language does the
// heavy lifting instead of us building custom filtering/search logic.
export function buildGmailQuery(filters: EmailFilters): string {
  const parts: string[] = [];
  if (filters.query) parts.push(filters.query);
  if (filters.from) parts.push(`from:${filters.from}`);
  if (filters.after) parts.push(`after:${toGmailDate(filters.after)}`);
  if (filters.before) parts.push(`before:${toGmailDate(filters.before)}`);
  if (filters.unreadOnly) parts.push("is:unread");
  return parts.join(" ");
}

function toGmailDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export class GmailService {
  private client: gmail_v1.Gmail;

  constructor(oauth2Client: OAuth2Client) {
    this.client = google.gmail({ version: "v1", auth: oauth2Client });
  }

  async listEmails(filters: EmailFilters): Promise<ListEmailsResult> {
    const q = buildGmailQuery(filters);

    const labelIds =
      filters.label === "TRASH"
        ? ["TRASH"]
        : filters.label
        ? [filters.label]
        : undefined;

    const list = await this.client.users.messages.list({
      userId: "me",
      q: q || undefined,
      labelIds,
      maxResults: filters.maxResults ?? 25,
      pageToken: filters.pageToken,
    });

    const ids = list.data.messages ?? [];
    const emails = await Promise.all(
      ids.map(async (ref) => {
        const msg = await this.client.users.messages.get({
          userId: "me",
          id: ref.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        return toSummary(msg.data);
      })
    );

    return {
      emails,
      nextPageToken: list.data.nextPageToken ?? undefined,
      resultSizeEstimate: list.data.resultSizeEstimate ?? emails.length,
    };
  }
  async countEmails(filters: EmailFilters): Promise<number> {
    const query = buildGmailQuery(filters);

    const labelIds =
      filters.label === "TRASH"
        ? ["TRASH"]
        : filters.label
        ? [filters.label]
        : undefined;

    let total = 0;
    let pageToken: string | undefined;

    do {
      const res = await this.client.users.messages.list({
        userId: "me",
        q: query || undefined,
        labelIds,
        maxResults: 500,
        pageToken,
      });

      total += res.data.messages?.length ?? 0;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return total;
  }
  async getMailCounts(): Promise<{
    INBOX: number;
    STARRED: number;
    SENT: number;
    TRASH: number;
    SPAM: number;
  }> {
    const labels = [
      "INBOX",
      "STARRED",
      "SENT",
      "TRASH",
      "SPAM",
    ] as const;

    const counts = await Promise.all(
      labels.map(async (label) => {
        const res = await this.client.users.labels.get({
          userId: "me",
          id: label,
        });

        return [label, res.data.messagesTotal ?? 0] as const;
      })
    );

    return Object.fromEntries(counts) as {
      INBOX: number;
      STARRED: number;
      SENT: number;
      TRASH: number;
      SPAM: number;
    };
  }

  async listDrafts(): Promise<EmailSummary[]> {
    const res = await this.client.users.drafts.list({
      userId: "me",
      maxResults: 25,
    });

    const drafts = res.data.drafts ?? [];

    const emails = await Promise.all(
      drafts.map(async (draft) => {
        const msg = await this.client.users.drafts.get({
          userId: "me",
          id: draft.id!,
          format: "full",
        });

        return {
          ...toSummary(msg.data.message!),
          draftId: draft.id!,
        };
      })
    );

    return emails;
  }

  async getEmail(id: string): Promise<EmailDetail> {
    const msg = await this.client.users.messages.get({ userId: "me", id, format: "full" });
    return toDetail(msg.data);
  }
  async getThread(threadId: string): Promise<EmailDetail[]> {
    const thread = await this.client.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    return (thread.data.messages ?? []).map(toDetail);
  }

  async sendEmail(input: SendEmailInput): Promise<{ id: string; threadId: string }> {
    const raw = buildRawMessage(input);
    const res = await this.client.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: input.threadId },
    });
    return { id: res.data.id!, threadId: res.data.threadId! };
  }

  async markRead(id: string, read: boolean): Promise<void> {
    await this.client.users.messages.modify({
      userId: "me",
      id,
      requestBody: read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] },
    });
  }
  async starEmail(id: string, starred: boolean): Promise<void> {
    await this.client.users.messages.modify({
      userId: "me",
      id,
      requestBody: starred
        ? { addLabelIds: ["STARRED"] }
        : { removeLabelIds: ["STARRED"] },
    });
  }
  async trashEmail(id: string): Promise<void> {
    await this.client.users.messages.trash({
      userId: "me",
      id,
    });
  }
  async deleteDraft(draftId: string): Promise<void> {
    await this.client.users.drafts.delete({
      userId: "me",
      id: draftId,
    });
  }

  // Registers (or renews) Gmail push notifications against our Pub/Sub topic.
  // Gmail's watch() expires after ~7 days — callers should re-invoke this on
  // a schedule (documented as a known limitation for this 5-day build; see
  // README "What I'd improve").
  async watchInbox(topicName: string): Promise<{ historyId: string; expiration: string }> {
    const res = await this.client.users.watch({
      userId: "me",
      requestBody: { topicName, labelIds: ["INBOX"], labelFilterAction: "include" },
    });
    return { historyId: res.data.historyId!, expiration: res.data.expiration! };
  }

  async stopWatch(): Promise<void> {
    await this.client.users.stop({ userId: "me" });
  }

  // Resolves what changed since `startHistoryId`, used when a Pub/Sub
  // notification arrives — Gmail's push payload only carries a historyId,
  // not the actual message content, by design (for privacy/bandwidth).
  async listHistory(startHistoryId: string): Promise<{ newMessageIds: string[]; latestHistoryId: string }> {
    const res = await this.client.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });

    const newMessageIds = new Set<string>();
    for (const record of res.data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) newMessageIds.add(added.message.id);
      }
    }

    return {
      newMessageIds: [...newMessageIds],
      latestHistoryId: res.data.historyId ?? startHistoryId,
    };
  }
}

function buildRawMessage(input: SendEmailInput): string {
  const headers = [
    `To: ${input.to.join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.join(", ")}` : null,
    input.bcc?.length ? `Bcc: ${input.bcc.join(", ")}` : null,
    `Subject: ${input.subject}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.inReplyTo ? `References: ${input.inReplyTo}` : null,
    "Content-Type: text/plain; charset=utf-8",
  ].filter(Boolean);

  const message = `${headers.join("\r\n")}\r\n\r\n${input.body}`;
  return Buffer.from(message).toString("base64url");
}
