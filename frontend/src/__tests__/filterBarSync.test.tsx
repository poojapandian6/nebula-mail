import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FilterBar } from "../components/FilterBar";
import { useAppStore } from "../store/appStore";
import { executeDirective } from "../store/actionExecutor";

beforeEach(() => {
  useAppStore.setState({
    filters: { label: "INBOX" },
    inboxEmails: [],
    sentEmails: [],
    searchResults: null,
    view: "inbox",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emails: [], resultSizeEstimate: 0 }),
    })
  );
});

describe("FilterBar reflects assistant-applied filters", () => {
  it("shows sender/unread filters applied via an APPLY_FILTER directive, not just manual edits", async () => {
    render(<FilterBar />);

    // Before any filter is applied, controls should be at their defaults.
    expect(screen.getByPlaceholderText("From sender…")).toHaveValue("");
    expect(screen.getByLabelText("Unread only")).not.toBeChecked();

    // Simulate the assistant applying a filter — this is the exact same
    // path store/actionExecutor.ts uses when the orchestrator returns an
    // APPLY_FILTER directive, i.e. NOT going through this component at all.
    await executeDirective({
      type: "APPLY_FILTER",
      payload: { filters: { from: "sarah@example.com", unreadOnly: true, label: "INBOX" } },
    });

    // The visible controls must pick up the change even though nothing was
    // typed into them directly.
    await waitFor(() => {
      expect(screen.getByPlaceholderText("From sender…")).toHaveValue("sarah@example.com");
      expect(screen.getByLabelText("Unread only")).toBeChecked();
    });
  });

  it("reflects a keyword filter applied by the assistant", async () => {
    render(<FilterBar />);

    await executeDirective({
      type: "APPLY_FILTER",
      payload: { filters: { query: "project update", label: "INBOX" } },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search keyword…")).toHaveValue("project update");
    });
  });

  it("maps an assistant afterDaysAgo-derived date back to the matching day-range preset", async () => {
    render(<FilterBar />);

    const after = new Date(Date.now() - 10 * 86400_000).toISOString();
    await executeDirective({
      type: "APPLY_FILTER",
      payload: { filters: { after, label: "INBOX" } },
    });

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("10");
    });
  });
});
