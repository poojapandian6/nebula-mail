import { PubSub } from "@google-cloud/pubsub";
import { prisma } from "../db/client.js";
import { env } from "../utils/env.js";
import { getAuthorizedClient } from "./authService.js";
import { GmailService } from "./gmailService.js";
import { emitToUser } from "../websocket/gateway.js";

// Real-time sync design
// ---------------------------------------------------------------------------
// Gmail can notify us of mailbox changes two ways: a push HTTPS webhook
// (requires a domain-verified, publicly reachable endpoint registered with
// Pub/Sub) or a *pull* subscription, where our backend polls the Pub/Sub
// subscription itself. We use pull: it's event-driven from Gmail's
// perspective (we're not polling the Gmail API on a timer, we're draining a
// queue that Gmail pushes into), but it avoids the domain-verification step
// that a push webhook needs — a meaningful simplification for a 5-day build
// deployed to a Railway/Render URL. Documented as a trade-off in the README.

let pubsub: PubSub | null = null;
function getPubSub(): PubSub {
  if (!pubsub) pubsub = new PubSub({ projectId: env.GOOGLE_CLOUD_PROJECT_ID });
  return pubsub;
}

export async function registerGmailWatch(userId: string) {
  if (!env.GOOGLE_PUBSUB_TOPIC) {
    console.warn("[watch] GOOGLE_PUBSUB_TOPIC not set — skipping real-time sync registration");
    return;
  }
  const client = await getAuthorizedClient(userId);
  const gmail = new GmailService(client);
  const { historyId, expiration } = await gmail.watchInbox(env.GOOGLE_PUBSUB_TOPIC);

  await prisma.user.update({
    where: { id: userId },
    data: { historyId, watchExpiry: new Date(Number(expiration)) },
  });
}

// Long-running pull loop. Started once from server.ts. Each Pub/Sub message
// only tells us "this Gmail account changed" (via emailAddress) — we then
// ask Gmail what changed since our last known historyId, so message content
// is never carried over Pub/Sub.
export function startGmailPushListener() {
  if (!env.GOOGLE_PUBSUB_SUBSCRIPTION) {
    console.warn("[watch] GOOGLE_PUBSUB_SUBSCRIPTION not set — real-time sync disabled");
    return;
  }

  const subscription = getPubSub().subscription(env.GOOGLE_PUBSUB_SUBSCRIPTION);

  subscription.on("message", async (message) => {
    message.ack();
    try {
      const payload = JSON.parse(message.data.toString()) as { emailAddress: string; historyId: string };
      await handleGmailNotification(payload.emailAddress, String(payload.historyId));
    } catch (err) {
      console.error("[watch] failed to process Pub/Sub message:", err);
    }
  });

  subscription.on("error", (err) => console.error("[watch] Pub/Sub subscription error:", err));
  console.log("[watch] listening for Gmail push notifications via Pub/Sub pull subscription");
}

// Gmail's users.watch() registration expires after ~7 days. Rather than
// leaving that as a silent failure mode, we check daily for any user whose
// watch expires within the next 24h and re-register it. This is
// intentionally simple (an in-process interval, not a separate worker/queue)
// since a single backend instance is the right scope for this build; a
// multi-instance deployment would want this as a dedicated scheduled job
// instead so it doesn't run once per instance.
const RENEWAL_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000; // renew if expiring within 24h

export function scheduleWatchRenewal() {
  if (!env.GOOGLE_PUBSUB_TOPIC) return;

  const renew = async () => {
    try {
      const soon = new Date(Date.now() + RENEWAL_WINDOW_MS);
      const usersDue = await prisma.user.findMany({
        where: { OR: [{ watchExpiry: null }, { watchExpiry: { lt: soon } }] },
        select: { id: true, email: true },
      });
      for (const user of usersDue) {
        try {
          await registerGmailWatch(user.id);
          console.log(`[watch] renewed Gmail watch for ${user.email}`);
        } catch (err: any) {
          console.warn(`[watch] failed to renew Gmail watch for ${user.email}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[watch] renewal sweep failed:", err);
    }
  };

  renew(); // run once at startup too, not just on the interval
  setInterval(renew, RENEWAL_CHECK_INTERVAL_MS);
}

async function handleGmailNotification(emailAddress: string, notifiedHistoryId: string) {
  const user = await prisma.user.findUnique({ where: { email: emailAddress } });
  if (!user) return;

  const client = await getAuthorizedClient(user.id);
  const gmail = new GmailService(client);

  const startHistoryId = user.historyId ?? notifiedHistoryId;
  const { newMessageIds, latestHistoryId } = await gmail.listHistory(startHistoryId);

  await prisma.user.update({ where: { id: user.id }, data: { historyId: latestHistoryId } });

  for (const id of newMessageIds) {
    const email = await gmail.getEmail(id);
    emitToUser(user.id, "NEW_EMAIL", { email });
  }
}
