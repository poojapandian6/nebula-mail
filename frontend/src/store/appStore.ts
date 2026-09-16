import { create } from "zustand";
import type { EmailDetail, EmailFilters, EmailSummary } from "../types/mail";
import type { ComposeDraft } from "../types/directives";

export type View =
  | "inbox"
  | "favorites"
  | "sent"
  | "trash"
  | "spam"
  | "drafts"
  | "compose"
  | "detail";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  emailPreview?: EmailSummary[];
}

interface AppState {
  // navigation
  view: View;
  setView: (view: View) => void;

  // mail lists
  inboxEmails: EmailSummary[];
  favoritesEmails: EmailSummary[];
  sentEmails: EmailSummary[];
  trashEmails: EmailSummary[];
  spamEmails: EmailSummary[];
  draftEmails: EmailSummary[];
  isLoadingList: boolean;

  // mail counts
  inboxCount: number;
  favoritesCount: number;
  sentCount: number;
  trashCount: number;
  spamCount: number;
  draftCount: number;

  setMailCount: (
    label: "INBOX" | "STARRED" | "SENT" | "TRASH" | "SPAM" | "DRAFTS",
    count: number
  ) => void;

  setEmails: (
    label: "INBOX" | "STARRED" | "SENT" | "TRASH" | "SPAM",
    emails: EmailSummary[]
  ) => void;

  setDraftEmails: (emails: EmailSummary[]) => void;

  setLoadingList: (loading: boolean) => void;

  prependInboxEmail: (email: EmailSummary) => void;

  patchEmail: (id: string, patch: Partial<EmailSummary>) => void;

  removeEmail: (id: string) => void;

  // filters
  filters: EmailFilters;
  setFilters: (filters: EmailFilters) => void;

  // assistant search results
  searchResults: {
    emails: EmailSummary[];
    description: string;
    filters: EmailFilters;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  } | null;

  setSearchResults: (
    result: {
      emails: EmailSummary[];
      description: string;
      filters: EmailFilters;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    } | null
  ) => void;

  // detail view
  openEmail: EmailDetail | null;
  setOpenEmail: (email: EmailDetail | null) => void;

  // compose
  composeDraft: ComposeDraft | null;
  composeSource: "manual" | "assistant" | null;
  awaitingSendConfirmation: boolean;

  openCompose: (
    draft: ComposeDraft,
    source: "manual" | "assistant"
  ) => void;

  updateComposeField: (
    field: keyof ComposeDraft,
    value: string
  ) => void;

  closeCompose: () => void;

  setAwaitingSendConfirmation: (awaiting: boolean) => void;

  // assistant panel
  assistantMessages: AssistantMessage[];
  addAssistantMessage: (msg: AssistantMessage) => void;

  isAssistantThinking: boolean;
  setAssistantThinking: (thinking: boolean) => void;

  // AI field highlighting
  recentlyAIFilled: Set<string>;
  markAIFilled: (fields: string[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // navigation
  view: "inbox",

  setView: (view) => set({ view }),

  // mail lists
  inboxEmails: [],
  favoritesEmails: [],
  sentEmails: [],
  trashEmails: [],
  spamEmails: [],
  draftEmails: [],

  // mail counts
  inboxCount: 0,
  favoritesCount: 0,
  sentCount: 0,
  trashCount: 0,
  spamCount: 0,
  draftCount: 0,

  isLoadingList: false,

  setEmails: (label, emails) =>
    set(
      label === "INBOX"
        ? { inboxEmails: emails }
        : label === "STARRED"
        ? { favoritesEmails: emails }
        : label === "SENT"
        ? { sentEmails: emails }
        : label === "SPAM"
        ? { spamEmails: emails }
        : { trashEmails: emails }
    ),

  setDraftEmails: (emails) =>
    set({
      draftEmails: emails,
      draftCount: emails.length,
    }),

  setMailCount: (label, count) =>
    set(
      label === "INBOX"
        ? { inboxCount: count }
        : label === "STARRED"
        ? { favoritesCount: count }
        : label === "SENT"
        ? { sentCount: count }
        : label === "TRASH"
        ? { trashCount: count }
        : label === "SPAM"
        ? { spamCount: count }
        : { draftCount: count }
    ),

  setLoadingList: (loading) =>
    set({ isLoadingList: loading }),

  prependInboxEmail: (email) =>
    set((state) => ({
      inboxEmails: [
        email,
        ...state.inboxEmails.filter(
          (existing) => existing.id !== email.id
        ),
      ],
    })),

  patchEmail: (id, patch) =>
    set((state) => ({
      inboxEmails: state.inboxEmails.map((email) =>
        email.id === id
          ? { ...email, ...patch }
          : email
      ),

      favoritesEmails: state.favoritesEmails.map((email) =>
        email.id === id
          ? { ...email, ...patch }
          : email
      ),

      sentEmails: state.sentEmails.map((email) =>
        email.id === id
          ? { ...email, ...patch }
          : email
      ),

      trashEmails: state.trashEmails.map((email) =>
        email.id === id
          ? { ...email, ...patch }
          : email
      ),

      spamEmails: state.spamEmails.map((email) =>
        email.id === id
          ? { ...email, ...patch }
          : email
      ),

      draftEmails: state.draftEmails.map((email) =>
        email.id === id
          ? { ...email, ...patch }
          : email
      ),

      searchResults: state.searchResults
        ? {
            ...state.searchResults,
            emails: state.searchResults.emails.map(
              (email) =>
                email.id === id
                  ? { ...email, ...patch }
                  : email
            ),
          }
        : null,

      openEmail:
        state.openEmail?.id === id
          ? { ...state.openEmail, ...patch }
          : state.openEmail,
    })),

  removeEmail: (id) =>
    set((state) => ({
      inboxEmails: state.inboxEmails.filter(
        (email) => email.id !== id
      ),

      favoritesEmails: state.favoritesEmails.filter(
        (email) => email.id !== id
      ),

      sentEmails: state.sentEmails.filter(
        (email) => email.id !== id
      ),

      trashEmails: state.trashEmails.filter(
        (email) => email.id !== id
      ),

      spamEmails: state.spamEmails.filter(
        (email) => email.id !== id
      ),

      draftEmails: state.draftEmails.filter(
        (email) => email.id !== id
      ),

      searchResults: state.searchResults
        ? {
            ...state.searchResults,
            emails: state.searchResults.emails.filter(
              (email) => email.id !== id
            ),
          }
        : null,

      openEmail:
        state.openEmail?.id === id
          ? null
          : state.openEmail,
    })),

  // filters
  filters: {
    label: "INBOX",
  },

  setFilters: (filters) =>
    set({ filters }),

  // search results
  searchResults: null,

  setSearchResults: (result) =>
    set({ searchResults: result }),

  // detail view
  openEmail: null,

  setOpenEmail: (email) =>
    set({
      openEmail: email,
      view: email ? "detail" : get().view,
    }),

  // compose
  composeDraft: null,
  composeSource: null,
  awaitingSendConfirmation: false,

  openCompose: (draft, source) =>
    set({
      composeDraft: draft,
      composeSource: source,
      view: "compose",
      awaitingSendConfirmation: false,
    }),

  updateComposeField: (field, value) =>
    set((state) => ({
      composeDraft: state.composeDraft
        ? {
            ...state.composeDraft,
            [field]: value,
          }
        : state.composeDraft,
    })),

  closeCompose: () =>
    set({
      composeDraft: null,
      composeSource: null,
      awaitingSendConfirmation: false,
    }),

  setAwaitingSendConfirmation: (awaiting) =>
    set({
      awaitingSendConfirmation: awaiting,
    }),

  // assistant panel
  assistantMessages: [],

  addAssistantMessage: (msg) =>
    set((state) => ({
      assistantMessages: [
        ...state.assistantMessages,
        msg,
      ],
    })),

  isAssistantThinking: false,

  setAssistantThinking: (thinking) =>
    set({
      isAssistantThinking: thinking,
    }),

  // AI field highlighting
  recentlyAIFilled: new Set(),

  markAIFilled: (fields) => {
    set({
      recentlyAIFilled: new Set(fields),
    });

    setTimeout(() => {
      set({
        recentlyAIFilled: new Set(),
      });
    }, 1600);
  },
}));