import { useAuth } from "./hooks/useAuth";
import { useSocket } from "./hooks/useSocket";
import { useAppStore } from "./store/appStore";
import { LoginView } from "./views/LoginView";
import { MailListView } from "./views/MailListView";
import { DetailView } from "./views/DetailView";
import { ComposeView } from "./views/ComposeView";
import { Sidebar } from "./components/Sidebar";
import { AssistantPanel } from "./assistant/AssistantPanel";

export default function App() {
  const { user, loading, logout } = useAuth();
  useSocket(!!user);
  const view = useAppStore((s) => s.view);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  if (!user) return <LoginView />;

  return (
    <div className="h-screen flex overflow-hidden bg-paper">
      <Sidebar userEmail={user.email} onLogout={logout} />

      {view === "inbox" && <MailListView label="INBOX" />}
      {view === "favorites" && <MailListView label="STARRED" />}
      {view === "sent" && <MailListView label="SENT" />}
      {view === "trash" && <MailListView label="TRASH" />}
      {view === "spam" && <MailListView label="SPAM" />}
      {view === "drafts" && <MailListView label="DRAFTS" />}
      {view === "detail" && <DetailView />}
      {view === "compose" && <ComposeView />}

      <AssistantPanel />
    </div>
  );
}
