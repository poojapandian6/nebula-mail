import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";

export function ComposeView() {
  const draft = useAppStore((s) => s.composeDraft);
  const composeSource = useAppStore((s) => s.composeSource);
  const awaitingSendConfirmation = useAppStore((s) => s.awaitingSendConfirmation);
  const setAwaitingSendConfirmation = useAppStore((s) => s.setAwaitingSendConfirmation);
  const updateField = useAppStore((s) => s.updateComposeField);
  const closeCompose = useAppStore((s) => s.closeCompose);
  const setView = useAppStore((s) => s.setView);
  const recentlyAIFilled = useAppStore((s) => s.recentlyAIFilled);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [showCc, setShowCc] = useState(Boolean(draft?.cc));
  const [showBcc, setShowBcc] = useState(Boolean(draft?.bcc));

  // Automatically show Cc/Bcc when the assistant fills them.
  useEffect(() => {
    setShowCc(Boolean(draft?.cc));
    setShowBcc(Boolean(draft?.bcc));
  }, [draft?.cc, draft?.bcc]);

  if (!draft) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3">
        <span>Nothing to compose yet.</span>
        <button
          onClick={() =>
            useAppStore
              .getState()
              .openCompose({ to: "", subject: "", body: "" }, "manual")
          }
          className="px-4 py-2 text-sm rounded-sm border border-ink hover:bg-ink hover:text-paper transition-colors"
        >
          New email
        </button>
      </div>
    );
  }

  async function handleSend() {
    if (!draft) return;

    setSending(true);
    setError(null);

    try {
      await api.sendEmail(draft);

      if (draft.draftId) {
        await api.deleteDraft(draft.draftId);
      }

      setSent(true);

      setTimeout(() => {
        closeCompose();
        setSent(false);
        setView("sent");
      }, 900);
    } catch (err: any) {
      setError(err.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const glow = (field: string) =>
    recentlyAIFilled.has(field) ? "ai-glow" : "";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl">New message</h2>

          {composeSource === "assistant" && (
            <span className="text-xs text-signal font-medium px-2 py-1 rounded-sm bg-signal/10">
              ✦ Filled by assistant
            </span>
          )}
        </div>

        {/* Confirmation message */}
        {awaitingSendConfirmation && !sent && (
          <div className="mb-5 px-3 py-2.5 rounded-sm border border-signal/30 bg-signal/5 flex items-center justify-between gap-3">
            <span className="text-sm text-ink/80">
              The assistant drafted this and is waiting on you to confirm before it sends.
            </span>

            <button
              onClick={() => setAwaitingSendConfirmation(false)}
              className="text-xs text-muted hover:text-ink flex-shrink-0"
            >
              I'll edit first
            </button>
          </div>
        )}

        <div className="space-y-3">

          {/* TO + Cc/Bcc buttons */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1">
              <Field
                label="To"
                glowClass={glow("to")}
                value={draft.to}
                onChange={(v) => updateField("to", v)}
              />
            </div>

            <div className="flex items-center gap-2 pb-2 text-sm text-muted">

              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="hover:text-ink"
                >
                  Cc
                </button>
              )}

              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="hover:text-ink"
                >
                  Bcc
                </button>
              )}

            </div>
          </div>

          {/* Cc */}
          {showCc && (
            <Field
              label="Cc"
              glowClass={glow("cc")}
              value={draft.cc ?? ""}
              onChange={(v) => updateField("cc", v)}
            />
          )}

          {/* Bcc */}
          {showBcc && (
            <Field
              label="Bcc"
              glowClass={glow("bcc")}
              value={draft.bcc ?? ""}
              onChange={(v) => updateField("bcc", v)}
            />
          )}

          {/* Subject */}
          <Field
            label="Subject"
            glowClass={glow("subject")}
            value={draft.subject}
            onChange={(v) => updateField("subject", v)}
          />

          {/* Body */}
          <div className={`rounded-sm ${glow("body")}`}>
            <label className="text-xs text-muted block mb-1">
              Body
            </label>

            <textarea
              value={draft.body}
              onChange={(e) => updateField("body", e.target.value)}
              rows={10}
              className="w-full px-3 py-2 rounded-sm border border-line bg-white/70 focus:outline-none focus:ring-1 focus:ring-signal resize-none"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={
              sending ||
              sent ||
              !draft.to ||
              !draft.subject
            }
            className={`px-5 py-2 text-sm rounded-sm transition-colors disabled:opacity-50 ${
              awaitingSendConfirmation
                ? "bg-signal text-paper hover:opacity-90"
                : "bg-ink text-paper hover:bg-signal"
            }`}
          >
            {sent
              ? "Sent ✓"
              : sending
              ? "Sending…"
              : awaitingSendConfirmation
              ? "Confirm send"
              : "Send"}
          </button>

          <button
            onClick={async () => {
              if (draft?.draftId) {
                try {
                  await api.deleteDraft(draft.draftId);
                } catch (err) {
                  console.error("Failed to delete draft:", err);
                  return;
                }
              }

              closeCompose();
              setView("drafts");
            }}
            className="px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Discard
          </button>
        </div>

      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  glowClass,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  glowClass: string;
}) {
  return (
    <div className={`rounded-sm ${glowClass}`}>
      <label className="text-xs text-muted block mb-1">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-sm border border-line bg-white/70 focus:outline-none focus:ring-1 focus:ring-signal"
      />
    </div>
  );
}