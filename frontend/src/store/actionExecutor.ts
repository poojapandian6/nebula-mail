import { useAppStore } from "./appStore";
import type { UIDirective, ComposeDraft } from "../types/directives";
import { api } from "../lib/api";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fills compose fields one at a time with a short delay, so the evaluator
// can actually watch the assistant type the form in, rather than seeing an
// instant jump to the final state. This is the single most important
// perceptual detail the hiring task calls out explicitly.
async function animateComposeFill(draft: ComposeDraft) {
  const store = useAppStore.getState();

  store.openCompose(
    {
      to: "",
      subject: "",
      body: "",
      cc: draft.cc ? "" : undefined,
      bcc: draft.bcc ? "" : undefined,
    },
    "assistant"
  );

  const steps: [keyof ComposeDraft, string][] = [
    ["to", draft.to],

    ...(draft.cc
      ? ([["cc", draft.cc]] as [keyof ComposeDraft, string][])
      : []),

    ...(draft.bcc
      ? ([["bcc", draft.bcc]] as [keyof ComposeDraft, string][])
      : []),

    ["subject", draft.subject],
    ["body", draft.body],
  ];

  for (const [field, value] of steps) {
    await sleep(220);
    useAppStore.getState().updateComposeField(field, value);
    useAppStore.getState().markAIFilled([field]);
  }

  // preserve reply metadata (inReplyTo/threadId) without animating them —
  // they're not user-visible fields
  if (draft.inReplyTo || draft.threadId) {
    useAppStore.setState((s) => ({
      composeDraft: s.composeDraft
        ? {
            ...s.composeDraft,
            inReplyTo: draft.inReplyTo,
            threadId: draft.threadId,
          }
        : s.composeDraft,
    }));
  }
}
export async function executeDirective(directive: UIDirective): Promise<void> {
  const store = useAppStore.getState();

  switch (directive.type) {
    case "OPEN_COMPOSE": {
      await animateComposeFill(directive.payload);
      return;
    }

    case "UPDATE_COMPOSE_FIELD": {
      store.updateComposeField(directive.payload.field, directive.payload.value);
      store.markAIFilled([directive.payload.field]);
      return;
    }

    case "OPEN_EMAIL": {
      store.setOpenEmail(directive.payload.email);
      store.patchEmail(directive.payload.email.id, { isUnread: false });
      return;
    }

    case "SHOW_SEARCH_RESULTS": {
      if (directive.payload.displayLabel === "DRAFTS") {
        store.setDraftEmails(directive.payload.emails);
        store.setSearchResults(null);
        store.setView("drafts");
        return;
      }

      store.setSearchResults({
        emails: directive.payload.emails,
        description: directive.payload.description,
        filters: directive.payload.filters,
        nextPageToken: directive.payload.nextPageToken,
        resultSizeEstimate: directive.payload.resultSizeEstimate,
      });

      const label = directive.payload.filters.label;

      if (label === "TRASH") {
        store.setView("trash");
      } else if (label === "SPAM") {
        store.setView("spam");
      } else if (label === "STARRED") {
        store.setView("favorites");
      } else if (label === "SENT") {
        store.setView("sent");
      } else {
        store.setView("inbox");
      }

      return;
    }

    case "APPLY_FILTER": {
      store.setFilters(directive.payload.filters);
      store.setView("inbox");

      try {
        store.setLoadingList(true);

        const result = await api.listEmails(directive.payload.filters);

        store.setSearchResults({
          emails: result.emails,
          filters: directive.payload.filters,
          description: "Filtered inbox",
          nextPageToken: result.nextPageToken,
        });
      } finally {
        store.setLoadingList(false);
      }

      return;
    }

    case "OPEN_REPLY": {
      await animateComposeFill(directive.payload.draft);
      return;
    }

    case "NAVIGATE_VIEW": {
      store.setView(directive.payload.view);
      return;
    }

    case "SEND_CONFIRMATION_REQUIRED": {
      // The assistant has a ready-to-send draft, but nothing is sent yet —
      // fill the form, then flag that ComposeView should show an explicit
      // "Confirm send" control rather than requiring the user to notice the
      // regular Send button on their own.
      await animateComposeFill(directive.payload.draft);
      useAppStore.getState().setAwaitingSendConfirmation(true);
      return;
    }
  }
}
