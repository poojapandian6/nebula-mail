import type { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { env } from "../utils/env.js";

let io: Server | null = null;

const userSockets = new Map<string, Set<string>>();
// userId -> set of socket ids

export function initWebsocket(httpServer: HTTPServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      // Preferred production authentication:
      // short-lived token passed through Socket.IO handshake.
      const socketToken = socket.handshake.auth?.token as string | undefined;

      if (socketToken) {
        const payload = jwt.verify(
          socketToken,
          env.SESSION_JWT_SECRET
        ) as {
          sub: string;
          type?: string;
        };

        if (payload.type !== "socket" || !payload.sub) {
          return next(new Error("unauthenticated"));
        }

        socket.data.userId = payload.sub;
        return next();
      }

      // Fallback for local/direct-cookie environments.
      const raw = socket.handshake.headers.cookie;

      if (!raw) {
        return next(new Error("unauthenticated"));
      }

      const parsed = cookie.parse(raw);
      const sessionToken = parsed["nebula_session"];

      if (!sessionToken) {
        return next(new Error("unauthenticated"));
      }

      const payload = jwt.verify(
        sessionToken,
        env.SESSION_JWT_SECRET
      ) as {
        sub: string;
      };

      socket.data.userId = payload.sub;
      next();
    } catch (err) {
      console.error("[socket] authentication failed:", err);
      next(new Error("unauthenticated"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket.data as any).userId as string;

    console.log(
      `[socket] connected user=${userId} socket=${socket.id}`
    );

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }

    userSockets.get(userId)!.add(socket.id);

    socket.on("disconnect", () => {
      console.log(
        `[socket] disconnected user=${userId} socket=${socket.id}`
      );

      const sockets = userSockets.get(userId);

      if (!sockets) return;

      sockets.delete(socket.id);

      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    });
  });

  return io;
}

export function emitToUser(
  userId: string,
  event: string,
  payload: unknown
) {
  if (!io) {
    console.warn("[socket] emit attempted before Socket.IO initialized");
    return;
  }

  const sockets = userSockets.get(userId);

  if (!sockets || sockets.size === 0) {
    console.log(
      `[socket] no connected sockets for user=${userId}`
    );
    return;
  }

  console.log(
    `[socket] emitting ${event} to user=${userId}, sockets=${sockets.size}`
  );

  for (const socketId of sockets) {
    io.to(socketId).emit(event, payload);
  }
}