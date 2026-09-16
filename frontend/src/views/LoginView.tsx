import { api } from "../lib/api";

export function LoginView() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="max-w-sm text-center px-6">
        <div className="mx-auto mb-6 h-10 w-10 rounded-xl bg-[#31569b] flex items-center justify-center shadow-sm">
          <span className="text-white text-lg">✉</span>
        </div>

        <h1 className="text-3xl mb-2">Nebula Mail</h1>

        <p className="text-muted mb-8 leading-relaxed">
          A Gmail client with a copilot that drives the interface for you — compose, search, and navigate by
          typing what you want.
        </p>

        <a
          href={api.loginUrl()}
          className="inline-block px-5 py-2.5 bg-ink text-paper rounded-sm hover:bg-signal transition-colors"
        >
          Continue with Google
        </a>
      </div>
    </div>
  );
}