import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";
import type { EmailFilters } from "../types/mail";

const DAY_PRESETS = [1, 7, 10, 30];

// Reverses an ISO `after` date back to one of the dropdown's day-count
// presets, so the control can show the right selection even when the date
// arrived as a computed ISO string (e.g. from the assistant's
// `afterDaysAgo` tool argument) rather than from this component picking it.
// Falls back to a "custom" marker for anything that doesn't line up with a
// preset, so the control still visibly reflects "a filter is active" rather
// than silently reverting to "Any date".
function daysPresetFromFilters(filters: EmailFilters): string {
  if (!filters.after) return "";
  const diffDays = (Date.now() - new Date(filters.after).getTime()) / 86400_000;
  const match = DAY_PRESETS.find((preset) => Math.abs(diffDays - preset) < 0.6);
  return match ? String(match) : "custom";
}

export function FilterBar() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const setEmails = useAppStore((s) => s.setEmails);
  const setLoadingList = useAppStore((s) => s.setLoadingList);
  const setSearchResults = useAppStore((s) => s.setSearchResults);

  const [keyword, setKeyword] = useState(filters.query ?? "");
  const [sender, setSender] = useState(filters.from ?? "");
  const [days, setDays] = useState<string>(daysPresetFromFilters(filters));
  const [unreadOnly, setUnreadOnly] = useState(!!filters.unreadOnly);

  // Manual edits call setFilters themselves (see apply() below), but the
  // assistant can also change `filters` directly via an APPLY_FILTER
  // directive (store/actionExecutor.ts) without going through this
  // component at all. Without this sync, the visible controls would keep
  // showing stale values after an assistant-driven filter — the inbox list
  // would update but the dropdowns/checkboxes wouldn't, which is exactly
  // the "AI changed state the UI doesn't show" bug this guards against.
  useEffect(() => {
    setKeyword(filters.query ?? "");
    setSender(filters.from ?? "");
    setDays(daysPresetFromFilters(filters));
    setUnreadOnly(!!filters.unreadOnly);
  }, [filters]);

  async function apply(next: Partial<EmailFilters>) {
    const merged: EmailFilters = { ...filters, ...next, label: filters.label ?? "INBOX" };
    setFilters(merged);
    setSearchResults(null);
    setLoadingList(true);
    try {
      const result = await api.listEmails(merged);
      setEmails(merged.label ?? "INBOX", result.emails);
    } finally {
      setLoadingList(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line bg-paper/70">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply({ query: keyword || undefined })}
        placeholder="Search keyword…"
        className="text-sm px-2.5 py-1.5 rounded-sm border border-line bg-white/70 focus:outline-none focus:ring-1 focus:ring-signal w-40"
      />
      <input
        value={sender}
        onChange={(e) => setSender(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply({ from: sender || undefined })}
        placeholder="From sender…"
        className="text-sm px-2.5 py-1.5 rounded-sm border border-line bg-white/70 focus:outline-none focus:ring-1 focus:ring-signal w-36"
      />
      <select
        value={days}
        onChange={(e) => {
          setDays(e.target.value);
          apply({ after: e.target.value ? new Date(Date.now() - Number(e.target.value) * 86400_000).toISOString() : undefined });
        }}
        className="text-sm px-2 py-1.5 rounded-sm border border-line bg-white/70 focus:outline-none focus:ring-1 focus:ring-signal"
      >
        <option value="">Any date</option>
        <option value="1">Last 24 hours</option>
        <option value="7">Last 7 days</option>
        <option value="10">Last 10 days</option>
        <option value="30">Last 30 days</option>
        {days === "custom" && (
          <option value="custom" disabled>
            Custom range (assistant)
          </option>
        )}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-ink/80 select-none">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => {
            setUnreadOnly(e.target.checked);
            apply({ unreadOnly: e.target.checked || undefined });
          }}
        />
        Unread only
      </label>
    </div>
  );
}
