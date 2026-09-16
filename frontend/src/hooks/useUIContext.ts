import { useAppStore } from "../store/appStore";
import type { UIContext } from "../types/directives";

// Builds the exact snapshot of "what is the user looking at right now" that
// gets sent to the assistant on every turn. This is what makes "reply to
// this" resolvable without the user re-specifying which email.
export function useUIContext(): UIContext {
  const view = useAppStore((s) => s.view);
  const openEmail = useAppStore((s) => s.openEmail);
  const filters = useAppStore((s) => s.filters);

  return {
    currentView: view,
    openEmail: openEmail
      ? { id: openEmail.id, from: openEmail.from.email, subject: openEmail.subject, snippet: openEmail.snippet }
      : null,
    activeFilters: filters,
  };
}
