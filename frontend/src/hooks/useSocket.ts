import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAppStore } from "../store/appStore";
import type { EmailSummary } from "../types/mail";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Connects once the user is authenticated (the session cookie is what the
// backend's websocket gateway authenticates against — see
// backend/src/websocket/gateway.ts). Feeds NEW_EMAIL pushes from Gmail's
// Pub/Sub pipeline straight into the same store the rest of the app reads.
export function useSocket(enabled: boolean) {
  const prependInboxEmail = useAppStore((s) => s.prependInboxEmail);

  useEffect(() => {
    if (!enabled) return;
    const socket = io(API_URL, { withCredentials: true });

    socket.on("NEW_EMAIL", (payload: { email: EmailSummary }) => {
      prependInboxEmail(payload.email);
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, prependInboxEmail]);
}
