// Mirrors backend/src/types/mail.ts exactly. See that file's header comment
// for why these are provider-agnostic rather than raw Gmail shapes.

export interface EmailSummary {
  id: string;
  draftId?: string;
  threadId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  labelIds: string[];
}

export interface EmailDetail extends EmailSummary {
  bodyText: string;
  bodyHtml: string | null;
  cc: { name: string; email: string }[];
}

export interface EmailFilters {
  query?: string;
  from?: string;
  after?: string;
  before?: string;
  unreadOnly?: boolean;
  label?: "INBOX" | "STARRED" | "SENT" | "TRASH" | "SPAM";
  maxResults?: number;
  pageToken?: string;
}
