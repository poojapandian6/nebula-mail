import type { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { env } from "../utils/env.js";

let io: Server | null = null;
const userSockets = new Map<string, Set<string>>(); // userId -> set of socket ids

export function initWebsocket(httpServer: HTTPServer) {
  io = new Server(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true },
  });

  io.use((socket, next) => {
    // Reuse the same httpOnly session cookie as REST auth — no separate
    // token/handshake scheme to keep in sync.
    const raw = socket.handshake.headers.cookie;
    if (!raw) return next(new Error("unauthenticated"));
    const parsed = cookie.parse(raw);
    const token = parsed["nebula_session"];
    if (!token) return next(new Error("unauthenticated"));
    try {
      const payload = jwt.verify(token, env.SESSION_JWT_SECRET) as { sub: string };
      (socket.data as any).userId = payload.sub;
      next();
    } catch {
      next(new Error("unauthenticated"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket.data as any).userId as string;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(socket.id);

    socket.on("disconnect", () => {
      userSockets.get(userId)?.delete(socket.id);
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!io || !sockets) return;
  for (const socketId of sockets) {
    io.to(socketId).emit(event, payload);
  }
}
