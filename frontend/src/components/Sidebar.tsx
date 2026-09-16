import { useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";

export function Sidebar({
  userEmail,
  onLogout,
}: {
  userEmail: string;
  onLogout: () => void;
}) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const openCompose = useAppStore((s) => s.openCompose);

  const inboxCount = useAppStore((s) => s.inboxCount);
  const favoritesCount = useAppStore((s) => s.favoritesCount);
  const sentCount = useAppStore((s) => s.sentCount);
  const trashCount = useAppStore((s) => s.trashCount);
  const spamCount = useAppStore((s) => s.spamCount);
  const draftCount = useAppStore((s) => s.draftCount);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const res = await api.getMailCounts();

        const store = useAppStore.getState();

        store.setMailCount("INBOX", res.counts.INBOX);
        store.setMailCount("STARRED", res.counts.STARRED);
        store.setMailCount("SENT", res.counts.SENT);
        store.setMailCount("TRASH", res.counts.TRASH);
        store.setMailCount("SPAM", res.counts.SPAM);

        const drafts = await api.listDrafts();

        store.setMailCount("DRAFTS", drafts.drafts.length);
      } catch (error) {
        console.error("Failed to load mail counts:", error);
      }
    };

    loadCounts();
  }, []);


  const items: {
    key: "inbox" | "favorites" | "sent" | "trash" | "spam" | "drafts";
    label: string;
    icon: string;
  }[] = [
    { key: "inbox", label: "Inbox", icon: "▣" },
    { key: "drafts", label: "Drafts", icon: "□" },
    { key: "favorites", label: "Favorites", icon: "★" },
    { key: "sent", label: "Sent", icon: "↗" },
    { key: "trash", label: "Trash", icon: "🗑" },
    { key: "spam", label: "Spam", icon: "⚠" },
  ];

  return (
    <nav className="w-60 flex-shrink-0 border-r border-line flex flex-col h-full bg-paper">

      {/* Logo / Account */}
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-3">

          {/* Mail logo */}
          <div className="w-9 h-9 rounded-xl bg-signal flex items-center justify-center text-white shadow-sm">
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </div>

          <div className="font-serif text-xl text-ink">
            Nebula Mail
          </div>
        </div>

        <div className="text-sm text-ink/80 font-medium truncate mt-2 pl-12">
          {userEmail}
        </div>
      </div>

      {/* Compose */}
      <div className="px-3 pt-4">
        <button
          onClick={() =>
            openCompose(
              { to: "", subject: "", body: "" },
              "manual"
            )
          }
          className="
            w-full
            px-4 py-3
            text-sm font-medium
            rounded-xl
            bg-ink
            text-paper
            hover:bg-signal
            transition-colors
            flex items-center justify-center gap-2
            shadow-sm
          "
        >
          <span className="text-lg leading-none">＋</span>
          Compose
        </button>
      </div>

      {/* Navigation */}
      <div className="mt-5 px-2 flex-1">
        {items.map((item) => {
          const active = view === item.key;

          const count =
            item.key === "inbox"
              ? inboxCount
              : item.key === "favorites"
              ? favoritesCount
              : item.key === "sent"
              ? sentCount
              : item.key === "trash"
              ? trashCount
              : item.key === "spam"
              ? spamCount
              : draftCount;

          return (
            <button
              key={item.key}
              onClick={() => {
                if (item.key === "inbox") {
                  useAppStore.getState().setSearchResults(null);
                }

                setView(item.key);
              }}
              className={`
                w-full
                flex items-center gap-3
                text-left
                px-4 py-2.5
                mb-1
                rounded-lg
                text-sm
                transition-colors
                ${
                  active
                    ? "bg-signal/10 text-signal font-semibold"
                    : "text-ink/80 hover:bg-white hover:text-ink"
                }
              `}
            >
              <span
                className={`w-5 text-center text-base ${
                  item.key === "favorites" && active
                    ? "text-yellow-500"
                    : ""
                }`}
              >
                {item.icon}
              </span>

              <span className="flex-1">
                {item.label}
              </span>

              {count > 0 && (
                <span className="text-xs text-muted">
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Account / Sign out */}
      <div className="border-t border-line p-3">
        <button
          onClick={onLogout}
          className="
            w-full
            px-4 py-2.5
            rounded-xl
            text-sm
            text-muted
            hover:text-red-600
            hover:bg-red-50
            transition-all
            duration-200
            flex items-center justify-center gap-3
            group
          "
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          >
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
          </svg>

          <span>Sign out</span>
        </button>
      </div>
    </nav>
  );
}