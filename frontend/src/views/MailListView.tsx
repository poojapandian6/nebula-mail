import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";
import { EmailListItem } from "../components/EmailListItem";
import { FilterBar } from "../components/FilterBar";

export function MailListView({
  label,
}: {
  label: "INBOX" | "STARRED" | "SENT" | "TRASH" | "SPAM" | "DRAFTS";
}) {
  const emails = useAppStore((s) =>
    label === "INBOX"
      ? s.inboxEmails
      : label === "STARRED"
      ? s.favoritesEmails
      : label === "SENT"
      ? s.sentEmails
      : label === "TRASH"
      ? s.trashEmails
      : label === "SPAM"
      ? s.spamEmails
      : s.draftEmails
  );

  const setEmails = useAppStore((s) => s.setEmails);
  const setMailCount = useAppStore((s) => s.setMailCount);
  const isLoadingList = useAppStore((s) => s.isLoadingList);
  const setLoadingList = useAppStore((s) => s.setLoadingList);
  const filters = useAppStore((s) => s.filters);
  const searchResults = useAppStore((s) => s.searchResults);
  const setSearchResults = useAppStore((s) => s.setSearchResults);
  const setOpenEmail = useAppStore((s) => s.setOpenEmail);
  const patchEmail = useAppStore((s) => s.patchEmail);

  const [nextPageToken, setNextPageToken] =
    useState<string | undefined>();

  // Selected emails
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  const activeFilters = searchResults?.filters ?? filters;

  function formatDate(dateString?: string) {
    if (!dateString) return "";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateString));
  }

  const hasDateFilter = Boolean(
    activeFilters.after || activeFilters.before
  );

  const dateRangeEnd =
    activeFilters.before || new Date().toISOString();

  useEffect(() => {
    setLoadingList(true);
    setNextPageToken(undefined);
    setSelectedIds([]);

    if (label === "DRAFTS") {
      api
        .listDrafts()
        .then((res) => {
          useAppStore.getState().setDraftEmails(res.drafts);
        })
        .finally(() => setLoadingList(false));

      return;
    }

    api
      .listEmails({ label, maxResults: 30 })
      .then((res) => {
        setEmails(label, res.emails);
        setNextPageToken(res.nextPageToken);
      })
      .finally(() => setLoadingList(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
  useEffect(() => {
    setNextPageToken(searchResults?.nextPageToken);
  }, [searchResults]);

  async function loadMore() {
    if (!nextPageToken || isLoadingList) return;

    setLoadingList(true);
    if (label === "DRAFTS") {
      setLoadingList(false);
      return;
    }

    try {
      if (searchResults) {
        const res = await api.listEmails({
          ...searchResults.filters,
          maxResults: 30,
          pageToken: nextPageToken,
        });

        setSearchResults({
          emails: [...searchResults.emails, ...res.emails],
          filters: searchResults.filters,
          description: searchResults.description,
          nextPageToken: res.nextPageToken,
        });

        setNextPageToken(res.nextPageToken);
      } else {
        const res = await api.listEmails({
          ...filters,
          label,
          maxResults: 30,
          pageToken: nextPageToken,
        });

        setEmails(label, [...emails, ...res.emails]);
        setNextPageToken(res.nextPageToken);
      }
    } finally {
      setLoadingList(false);
    }
  }

  async function openEmail(id: string) {
    const detail = await api.getEmail(id);

    const currentDraft =
      label === "DRAFTS"
        ? useAppStore.getState().draftEmails.find(
            (email) => email.id === id
          )
        : undefined;

    if (label === "DRAFTS") {
      useAppStore.getState().openCompose(
        {
          to: detail.to.map((person) => person.email).join(", "),
          cc: detail.cc.map((person) => person.email).join(", "),
          subject: detail.subject,
          body: detail.bodyText,
          draftId: currentDraft?.draftId,
        },
        "manual"
      );

      return;
    }

    if (detail.isUnread) {
      await api.markRead(id, true);
      patchEmail(id, { isUnread: false });
    }

    setOpenEmail(detail);
  }
  async function deleteSelectedEmails() {
    if (selectedIds.length === 0) return;

    setLoadingList(true);

    try {
      await Promise.all(
        selectedIds.map((id) => api.trashEmail(id))
      );

      selectedIds.forEach((id) => {
        useAppStore.getState().removeEmail(id);
      });

      setSelectedIds([]);
    } catch (error) {
      console.error("Failed to delete selected emails:", error);
    } finally {
      setLoadingList(false);
    }
  }

  const showingSearchOverlay =
    label === "INBOX" && searchResults;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {label === "INBOX" && <FilterBar />}

      {hasDateFilter && (
        <div className="px-5 py-3 border-b border-line bg-paper flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-ink">
              Date range
            </div>

            <div className="text-xs text-muted mt-0.5">
              {activeFilters.after &&
                formatDate(activeFilters.after)}

              {activeFilters.after && " → "}

              {formatDate(dateRangeEnd)}
            </div>
          </div>

          <div className="text-xs text-signal font-medium">
            Filtered
          </div>
        </div>
      )}

      {showingSearchOverlay && (
        <div className="px-4 py-2 bg-signal/5 border-b border-signal/20 flex items-center justify-between">
          <span className="text-sm text-signal font-medium">
            ✦ {searchResults!.description} ·{" "}
            {(
              searchResults!.resultSizeEstimate ??
              searchResults!.emails.length
            ).toLocaleString()}{" "}
            results
          </span>

          <button
            onClick={() => setSearchResults(null)}
            className="text-xs text-muted hover:text-ink"
          >
            Clear · show inbox
          </button>
        </div>
      )}
      {selectedIds.length > 0 && (
        <div className="px-4 py-2 border-b border-line bg-paper flex items-center justify-end">
          <button
            onClick={deleteSelectedEmails}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted hover:text-red-600 transition-colors"
            title="Move selected emails to Trash"
          >
            🗑️
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingList && (
          <div className="p-6 text-sm text-muted">
            Loading…
          </div>
        )}

        {!isLoadingList &&
          (
            showingSearchOverlay
              ? searchResults!.emails
              : emails
          ).length === 0 && (
            <div className="p-8 text-center text-muted text-sm">
              {showingSearchOverlay
                ? "No emails matched that search."
                : label === "INBOX"
                ? "No emails in your inbox."
                : label === "STARRED"
                ? "No favorite emails."
                : label === "TRASH"
                ? "No emails in trash."
                : label === "SPAM"
                ? "No spam emails."
                : label === "DRAFTS"
                ? "No drafts."
                : "No sent emails."}
            </div>
          )}

        {(showingSearchOverlay
          ? searchResults!.emails
          : emails
        ).map((email) => (
          <EmailListItem
            key={email.id}
            email={email}
            onClick={() => openEmail(email.id)}
            selected={selectedIds.includes(email.id)}
            onToggleSelect={() => toggleSelect(email.id)}
          />
        ))}
      </div>

      {/* Load more */}
      {nextPageToken && (
        <div className="p-4 flex justify-center border-t border-line">
          <button
            onClick={loadMore}
            disabled={isLoadingList}
            className="px-4 py-2 text-sm rounded-sm border border-line hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {isLoadingList ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {!showingSearchOverlay &&
        label !== "STARRED" &&
        filters.label === label &&
        (filters.query ||
          filters.from ||
          filters.after ||
          filters.unreadOnly) && (
          <div className="px-4 py-1.5 text-xs text-muted border-t border-line bg-paper/60">
            Filtered view active
          </div>
        )}
    </div>
  );
}