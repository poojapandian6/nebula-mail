import type { EmailDetail, EmailFilters, EmailSummary } from "../types/mail";
import type { ComposeDraft, UIContext, UIDirective } from "../types/directives";

const API_URL = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error?.toString() ?? `Request to ${path} failed (${res.status})`
    );
  }

  return res.json();
}

export const api = {
  me: () => request<{ id: string; email: string }>("/api/auth/me"),

  logout: () =>
    request<{ ok: true }>("/api/auth/logout", {
      method: "POST",
    }),

  loginUrl: () => `${API_URL}/api/auth/google`,

  listEmails: (filters: EmailFilters) => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, String(v));
      }
    });

    return request<{
      emails: EmailSummary[];
      nextPageToken?: string;
      resultSizeEstimate: number;
    }>(`/api/mail?${params.toString()}`);
  },
  getMailCounts: () =>
    request<{
      counts: {
        INBOX: number;
        STARRED: number;
        SENT: number;
        TRASH: number;
        SPAM: number;
      };
    }>("/api/mail/counts"),
  listDrafts: () =>
    request<{ drafts: EmailSummary[] }>("/api/mail/drafts"),

  getEmail: (id: string) =>
    request<EmailDetail>(`/api/mail/${id}`),

  getThread: (threadId: string) =>
    request<{ emails: EmailDetail[] }>(
      `/api/mail/thread/${threadId}`
    ),

  markRead: (id: string, read: boolean) =>
    request<{ ok: true }>(`/api/mail/${id}/read`, {
      method: "POST",
      body: JSON.stringify({ read }),
    }),
  starEmail: (id: string, starred: boolean) =>
    request<{ ok: true }>(`/api/mail/${id}/star`, {
      method: "POST",
      body: JSON.stringify({ starred }),
    }),

  trashEmail: (id: string) =>
    request<{ ok: true }>(`/api/mail/${id}/trash`, {
      method: "POST",
    }),

  deleteDraft: (draftId: string) =>
    request<{ ok: true }>(`/api/mail/drafts/${draftId}/delete`, {
      method: "POST",
    }),

  sendEmail: (draft: ComposeDraft) =>
    request<{ id: string; threadId: string }>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify({
        to: splitAddresses(draft.to),
        cc: draft.cc ? splitAddresses(draft.cc) : undefined,
        bcc: draft.bcc ? splitAddresses(draft.bcc) : undefined,
        subject: draft.subject,
        body: draft.body,
        inReplyTo: draft.inReplyTo,
        threadId: draft.threadId,
      }),
    }),

  sendAssistantMessage: (message: string, context: UIContext) =>
    request<{ reply: string; directives: UIDirective[] }>(
      "/api/assistant/message",
      {
        method: "POST",
        body: JSON.stringify({ message, context }),
      }
    ),

  resetAssistant: () =>
    request<{ ok: true }>("/api/assistant/message", {
      method: "DELETE",
    }),
};

function splitAddresses(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}