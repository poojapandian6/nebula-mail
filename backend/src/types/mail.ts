// Domain types for mail. Kept provider-agnostic on purpose: everything the
// rest of the backend touches is this shape, not Gmail's raw message
// format. If we ever added a second provider, only mailService/gmail.ts
// would need to change.

export interface EmailSummary {
  id: string;
  draftId?: string;
  threadId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  subject: string;
  snippet: string;
  date: string; // ISO 8601
  isUnread: boolean;
  labelIds: string[];
}

export interface EmailDetail extends EmailSummary {
  bodyText: string;
  bodyHtml: string | null;
  cc: { name: string; email: string }[];
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
}

export interface EmailFilters {
  query?: string; // free-text keyword, mapped into Gmail search syntax
  from?: string;
  after?: string; // ISO date
  before?: string; // ISO date
  unreadOnly?: boolean;
  label?: "INBOX" | "STARRED" | "SENT" | "TRASH" | "SPAM";
  maxResults?: number;
  pageToken?: string;
}

export interface ListEmailsResult {
  emails: EmailSummary[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}
