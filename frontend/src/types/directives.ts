// Mirrors backend/src/types/directives.ts exactly. This is the contract the
// Action Executor (store/actionExecutor.ts) consumes — see that file's
// header for the full explanation of why this exists.

import type { EmailFilters, EmailSummary, EmailDetail } from "./mail";

export type UIDirective =
  | { type: "OPEN_COMPOSE"; payload: ComposeDraft }
  | { type: "UPDATE_COMPOSE_FIELD"; payload: { field: keyof ComposeDraft; value: string } }
  | { type: "OPEN_EMAIL"; payload: { email: EmailDetail } }
  | {
    type: "SHOW_SEARCH_RESULTS";
    payload: {
      emails: EmailSummary[];
      filters: EmailFilters;
      description: string;
      nextPageToken?: string;
      resultSizeEstimate?: number;
      displayLabel?: "DRAFTS";
    };
  }
  | { type: "APPLY_FILTER"; payload: { filters: EmailFilters } }
  | { type: "OPEN_REPLY"; payload: { inReplyToId: string; draft: ComposeDraft } }
  | {
      type: "NAVIGATE_VIEW";
      payload: {
        view:
          | "inbox"
          | "favorites"
          | "sent"
          | "trash"
          | "spam"
          | "drafts"
          | "compose"
          | "detail";
      };
  }
  | { type: "SEND_CONFIRMATION_REQUIRED"; payload: { draft: ComposeDraft } };

export interface ComposeDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
  draftId?: string;
}

export interface UIContext {
  currentView:
  | "inbox"
  | "favorites"
  | "sent"
  | "trash"
  | "spam"
  | "drafts"
  | "compose"
  | "detail";
  openEmail: { id: string; from: string; subject: string; snippet: string } | null;
  activeFilters: EmailFilters | null;
}
