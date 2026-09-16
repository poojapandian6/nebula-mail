import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAppStore } from "../store/appStore";
import type { EmailSummary } from "../types/mail";

const API_URL =
  import.meta.env.VITE_API_URL ??
  "https://nebula-mail-backend-qawz.onrender.com";

export function useSocket(enabled: boolean) {
  const prependInboxEmail = useAppStore(
    (s) => s.prependInboxEmail
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let socket: ReturnType<typeof io> | null = null;

    async function connectSocket() {
      try {
        // This request goes through the frontend /api proxy,
        // so the normal nebula_session cookie is available.
        const response = await fetch("/api/auth/socket-token", {
          credentials: "include",
        });

        if (!response.ok) {
          console.error(
            "[socket] failed to obtain socket token:",
            response.status
          );
          return;
        }

        const { token } = await response.json();

        if (cancelled) return;

        socket = io(API_URL, {
          withCredentials: true,
          auth: {
            token,
          },
        });

        socket.on("connect", () => {
          console.log(
            "[socket] connected:",
            socket?.id
          );
        });

        socket.on("connect_error", (error) => {
          console.error(
            "[socket] connection error:",
            error.message
          );
        });

        socket.on(
          "NEW_EMAIL",
          (payload: { email: EmailSummary }) => {
            console.log(
              "[socket] NEW_EMAIL received:",
              payload.email
            );

            prependInboxEmail(payload.email);
          }
        );
      } catch (error) {
        console.error(
          "[socket] failed to connect:",
          error
        );
      }
    }

    connectSocket();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [enabled, prependInboxEmail]);
}