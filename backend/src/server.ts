import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./utils/env.js";
import { authRouter } from "./routes/auth.js";
import { mailRouter } from "./routes/mail.js";
import { assistantRouter } from "./routes/assistant.js";
import { initWebsocket } from "./websocket/gateway.js";
import { startGmailPushListener, scheduleWatchRenewal } from "./services/watchService.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/mail", mailRouter);
app.use("/api/assistant", assistantRouter);

// Central error handler: never leak stack traces to the client, but log
// server-side for debugging during the demo.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
});

const httpServer = http.createServer(app);
initWebsocket(httpServer);
startGmailPushListener();
scheduleWatchRenewal();

httpServer.listen(env.PORT, () => {
  console.log(`Nebula Mail backend listening on :${env.PORT} (${env.NODE_ENV})`);
});
