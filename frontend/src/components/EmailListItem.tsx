import type { EmailSummary } from "../types/mail";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";

export function EmailListItem({
  email,
  onClick,
  selected = false,
  onToggleSelect,
}: {
  email: EmailSummary;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const isStarred = email.labelIds.includes("STARRED");
  const patchEmail = useAppStore((s) => s.patchEmail);

  async function toggleStar(event: React.MouseEvent) {
    event.stopPropagation();

    const newStarredState = !isStarred;

    try {
      await api.starEmail(email.id, newStarredState);

      patchEmail(email.id, {
        labelIds: newStarredState
          ? [...email.labelIds, "STARRED"]
          : email.labelIds.filter((label) => label !== "STARRED"),
      });
    } catch (error) {
      console.error("Failed to update star:", error);
    }
  }

  return (
    <div
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b border-line hover:bg-white/60 transition-colors flex gap-3 items-start cursor-pointer"
    >
      {/* Checkbox */}
      <span
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect?.();
        }}
        className={`mt-1 w-4 h-4 flex-shrink-0 border rounded-sm flex items-center justify-center cursor-pointer ${
          selected
            ? "bg-signal border-signal text-white"
            : "border-muted hover:border-ink"
        }`}
        title={selected ? "Deselect" : "Select"}
      >
        {selected && "✓"}
      </span>

      {/* Star */}
      <span
        onClick={toggleStar}
        className={`mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center text-lg leading-none cursor-pointer select-none ${
          isStarred ? "text-yellow-400" : "text-muted"
        }`}
        title={isStarred ? "Unstar" : "Star"}
      >
        {isStarred ? "★" : "☆"}
      </span>

      {/* Unread indicator */}
      <div className="mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center">
        <div
          className="h-2 w-2 rounded-full"
          style={{
            background: email.isUnread ? "#DC2626" : "transparent",
          }}
        />
      </div>

      {/* Email content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate ${
              email.isUnread ? "font-semibold" : "text-ink/80"
            }`}
          >
            {email.from.name || email.from.email}
          </span>

          {/* Date / Time */}
          <span className="text-xs text-muted flex-shrink-0">
            {(() => {
              const date = new Date(email.date);
              const now = new Date();

              const sameDay =
                date.getFullYear() === now.getFullYear() &&
                date.getMonth() === now.getMonth() &&
                date.getDate() === now.getDate();

              if (sameDay) {
                return date.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                });
              }

              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);

              const isYesterday =
                date.getFullYear() === yesterday.getFullYear() &&
                date.getMonth() === yesterday.getMonth() &&
                date.getDate() === yesterday.getDate();

              if (isYesterday) {
                return "Yesterday";
              }

              if (date.getFullYear() === now.getFullYear()) {
                return date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
              }

              return date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
            })()}
          </span>
        </div>

        <div
          className={`truncate text-sm ${
            email.isUnread ? "font-medium" : "text-ink/70"
          }`}
        >
          {email.subject}
        </div>

        <div className="truncate text-sm text-muted">
          {email.snippet}
        </div>
      </div>
    </div>
  );
}