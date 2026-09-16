import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";
import type { EmailDetail } from "../types/mail";

export function DetailView() {
  const email = useAppStore((s) => s.openEmail);
  const setView = useAppStore((s) => s.setView);
  const openCompose = useAppStore((s) => s.openCompose);

  const [thread, setThread] = useState<EmailDetail[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  useEffect(() => {
    if (!email) {
      setThread([]);
      return;
    }

    const currentEmail = email;
    let cancelled = false;

    async function loadThread() {
      setLoadingThread(true);

      try {
        const result = await api.getThread(currentEmail.threadId);

        if (!cancelled) {
          setThread(result.emails);
        }
      } catch {
        if (!cancelled) {
          setThread([currentEmail]);
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
        }
      }
    }

    loadThread();

    return () => {
      cancelled = true;
    };
  }, [email]);

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        No email selected.
      </div>
    );
  }

  const messages = thread.length > 0 ? thread : [email];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => setView("inbox")}
          className="text-sm text-muted hover:text-ink mb-6"
        >
          ← Back
        </button>

        <h2 className="text-2xl mb-2">{email.subject}</h2>

        {loadingThread ? (
          <div className="text-sm text-muted mb-6">
            Loading conversation...
          </div>
        ) : (
          <div className="text-sm text-muted mb-6">
            {messages.length}{" "}
            {messages.length === 1 ? "message" : "messages"} in this
            conversation
          </div>
        )}

        <div className="space-y-5">
          {messages.map((message) => {
            const sanitizedHtml = message.bodyHtml
              ? DOMPurify.sanitize(message.bodyHtml)
              : null;

            return (
              <article
                key={message.id}
                className="border border-line rounded-sm bg-white/60"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                  <div className="min-w-0">
                    <div className="text-sm">
                      <span className="text-ink font-medium">
                        {message.from.name || message.from.email}
                      </span>{" "}
                      <span className="text-muted">
                        &lt;{message.from.email}&gt;
                      </span>
                    </div>

                    <div className="text-xs text-muted mt-1">
                      To:{" "}
                      {message.to
                        .map((recipient) => recipient.email)
                        .join(", ")}
                    </div>
                  </div>

                  <div className="text-xs text-muted flex-shrink-0 ml-4">
                    {new Date(message.date).toLocaleString()}
                  </div>
                </div>

                <div className="px-4 py-5">
                  {sanitizedHtml ? (
                    <div
                      className="leading-relaxed text-ink/90 overflow-x-auto"
                      dangerouslySetInnerHTML={{
                        __html: sanitizedHtml,
                      }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed text-ink/90">
                      {message.bodyText}
                    </div>
                  )}
                </div>

                <div className="px-4 pb-4">
                  <button
                    onClick={() =>
                      openCompose(
                        {
                          to: message.from.email,
                          subject: message.subject.startsWith("Re:")
                            ? message.subject
                            : `Re: ${message.subject}`,
                          body: "",
                          inReplyTo: message.id,
                          threadId: message.threadId,
                        },
                        "manual"
                      )
                    }
                    className="px-4 py-2 text-sm rounded-sm border border-ink hover:bg-ink hover:text-paper transition-colors"
                  >
                    Reply
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}