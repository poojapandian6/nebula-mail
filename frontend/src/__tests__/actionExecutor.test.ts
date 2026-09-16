import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { executeDirective } from "../store/actionExecutor";

beforeEach(() => {
  useAppStore.setState({
    view: "inbox",
    composeDraft: null,
    composeSource: null,
    openEmail: null,
    searchResults: null,
    filters: { label: "INBOX" },
    inboxEmails: [],
    sentEmails: [],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emails: [], resultSizeEstimate: 0 }),
    })
  );
});

describe("executeDirective", () => {
  it("OPEN_COMPOSE switches to the compose view and fills the draft (via the same store used by manual compose)", async () => {
    await executeDirective({
      type: "OPEN_COMPOSE",
      payload: { to: "john@example.com", subject: "Meeting Tomorrow", body: "Let's meet at 3pm" },
    });

    const state = useAppStore.getState();
    expect(state.view).toBe("compose");
    expect(state.composeSource).toBe("assistant");
    expect(state.composeDraft?.to).toBe("john@example.com");
    expect(state.composeDraft?.subject).toBe("Meeting Tomorrow");
    expect(state.composeDraft?.body).toBe("Let's meet at 3pm");
  });

  it("OPEN_EMAIL sets openEmail and marks it read in the shared list state", async () => {
    const email: any = {
      id: "1",
      threadId: "t1",
      from: { name: "David", email: "david@x.com" },
      to: [],
      subject: "Update",
      snippet: "…",
      date: new Date().toISOString(),
      isUnread: true,
      labelIds: [],
      bodyText: "hello",
      bodyHtml: null,
      cc: [],
    };
    useAppStore.setState({ inboxEmails: [email] });

    await executeDirective({ type: "OPEN_EMAIL", payload: { email } });

    const state = useAppStore.getState();
    expect(state.openEmail?.id).toBe("1");
    expect(state.inboxEmails[0].isUnread).toBe(false);
  });

  it("SHOW_SEARCH_RESULTS populates the overlay without touching the persistent inbox list", async () => {
    await executeDirective({
      type: "SHOW_SEARCH_RESULTS",
      payload: { emails: [{ id: "2" } as any], filters: {}, description: "Emails from Sarah" },
    });

    const state = useAppStore.getState();
    expect(state.searchResults?.description).toBe("Emails from Sarah");
    expect(state.searchResults?.emails).toHaveLength(1);
    expect(state.view).toBe("inbox");
  });

  it("APPLY_FILTER updates filters and re-fetches through the same api.listEmails path as manual filters", async () => {
    await executeDirective({ type: "APPLY_FILTER", payload: { filters: { unreadOnly: true, label: "INBOX" } } });

    const state = useAppStore.getState();
    expect(state.filters.unreadOnly).toBe(true);
    expect(fetch).toHaveBeenCalled();
  });

  it("SEND_CONFIRMATION_REQUIRED fills the draft and flags awaitingSendConfirmation for the UI to show a confirm step", async () => {
    await executeDirective({
      type: "SEND_CONFIRMATION_REQUIRED",
      payload: { draft: { to: "john@example.com", subject: "Hi", body: "Body" } },
    });

    const state = useAppStore.getState();
    expect(state.view).toBe("compose");
    expect(state.composeDraft?.to).toBe("john@example.com");
    expect(state.awaitingSendConfirmation).toBe(true);
  });

  it("openCompose (manual path) resets any stale awaitingSendConfirmation flag", () => {
    useAppStore.setState({ awaitingSendConfirmation: true });
    useAppStore.getState().openCompose({ to: "", subject: "", body: "" }, "manual");
    expect(useAppStore.getState().awaitingSendConfirmation).toBe(false);
  });

  it("OPEN_REPLY opens compose pre-filled with the reply draft", async () => {
    await executeDirective({
      type: "OPEN_REPLY",
      payload: {
        inReplyToId: "orig1",
        draft: { to: "david@x.com", subject: "Re: Project update", body: "Sounds good", inReplyTo: "orig1" },
      },
    });

    const state = useAppStore.getState();
    expect(state.view).toBe("compose");
    expect(state.composeDraft?.to).toBe("david@x.com");
    expect(state.composeDraft?.inReplyTo).toBe("orig1");
  });
});
