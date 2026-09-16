// UI Directives
// ---------------------------------------------------------------------------
// This is the entire contract between "what the AI decided to do" and "what
// the UI renders." The assistant never emits HTML/JS — it emits one of these
// typed, validated directives, and the frontend's Action Executor is the only
// thing that turns a directive into a state change. Same store, same
// reducers, whether a human clicked a button or the AI issued a directive.
//
// This file is intentionally duplicated (not imported) in
// frontend/src/types/directives.ts, since the two are separate TS projects/
// deployables. Keep them in sync when adding a new directive.

import type { EmailFilters, EmailSummary, EmailDetail } from "./mail.js";

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
      displayLabel?: "DRAFTS";
      resultSizeEstimate?: number;
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

// Context the frontend sends up on every assistant turn, so the model knows
// what the user is currently looking at ("reply to this" needs openEmail).
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
