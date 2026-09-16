import { useState, useRef, useEffect } from "react";
import { useAppStore, type AssistantMessage } from "../store/appStore";
import { useUIContext } from "../hooks/useUIContext";
import { api } from "../lib/api";
import { executeDirective } from "../store/actionExecutor";

export function AssistantPanel() {
  const messages = useAppStore((s) => s.assistantMessages);
  const addMessage = useAppStore((s) => s.addAssistantMessage);
  const thinking = useAppStore((s) => s.isAssistantThinking);
  const setThinking = useAppStore((s) => s.setAssistantThinking);
  const context = useUIContext();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    addMessage({ id: crypto.randomUUID(), role: "user", text });
    setThinking(true);

    try {
      const { reply, directives } = await api.sendAssistantMessage(text, context);

      // Execute directives sequentially — most resolve instantly, but
      // OPEN_COMPOSE/OPEN_REPLY animate the form filling in, so we want the
      // chat reply to land only once the UI change is visible.
      for (const directive of directives) {
        await executeDirective(directive);
      }

      // Show up to 5 search-result previews in the assistant panel.
      // These emails are already included in the UI directive, so this
      // does not make an additional Gmail API request.
      const searchDirective = directives.find(
        (d) => d.type === "SHOW_SEARCH_RESULTS"
      );

      const emailPreview =
        searchDirective?.type === "SHOW_SEARCH_RESULTS"
          ? searchDirective.payload.emails.slice(0, 5)
          : undefined;

      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        text: reply,
        emailPreview,
      });
    } catch (err: any) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        text: `Something went wrong: ${err.message}`,
      });
    } finally {
      setThinking(false);
    }
  }

  return (
    <aside className="w-[340px] flex-shrink-0 border-l border-line bg-white/40 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Animated AI icon */}
          <div className="relative w-7 h-7 flex items-center justify-center">
            {/* Rotating orbit */}
            <span className="absolute inset-0 rounded-full border-2 border-signal/50 animate-spin" />

            {/* AI sparkle */}
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-signal relative z-10 animate-pulse"
              fill="currentColor"
            >
              <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z" />
              <path d="M19 15l.7 2.3L22 18l-2.3-.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" />
            </svg>
          </div>

          <span className="font-medium text-sm">Assistant</span>
        </div>

        <button
          onClick={async () => {
            await api.resetAssistant();
            useAppStore.setState({ assistantMessages: [] });
          }}
          className="text-xs text-muted hover:text-ink"
        >
          Reset
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-muted leading-relaxed">
            Try: <br />
            <em>"Send an email to jane@example.com about tomorrow's meeting"</em>
            <br />
            <em>"Show me emails from the last 10 days"</em>
            <br />
            <em>"Open the latest email from David"</em>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {thinking && <div className="text-sm text-muted italic">Assistant is working…</div>}
      </div>

      <div className="p-3 border-t border-line">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask the assistant…"
            className="flex-1 px-3 py-2 text-sm rounded-sm border border-line bg-white/80 focus:outline-none focus:ring-1 focus:ring-signal"
          />
          <button
            onClick={handleSend}
            disabled={thinking}
            className="px-3 py-2 text-sm rounded-sm bg-ink text-paper hover:bg-signal transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const setOpenEmail = useAppStore((s) => s.setOpenEmail);
  const isUser = message.role === "user";

  return (
    <div className={`text-sm ${isUser ? "text-right" : ""}`}>
      <div
        className={`inline-block px-3 py-2 rounded-sm max-w-[85%] text-left ${
          isUser ? "bg-ink text-paper" : "bg-signal/10 text-ink"
        }`}
      >
        {message.text}
      </div>

      {message.emailPreview && message.emailPreview.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {message.emailPreview.map((email) => (
            <button
              key={email.id}
              onClick={async () => {
                const detail = await api.getEmail(email.id);
                setOpenEmail(detail);
              }}
              className="block w-full text-left px-2.5 py-2 rounded-sm border border-line bg-white/70 hover:border-signal/50 transition-colors"
            >
              <div className="text-xs font-medium truncate">
                {email.subject}
              </div>

              <div className="text-xs text-muted truncate">
                {email.from.email} · {email.snippet}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
