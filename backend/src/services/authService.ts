import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "../db/client.js";
import { env } from "../utils/env.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function newOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl(): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force refresh_token on every login during dev/testing
    scope: SCOPES,
  });
}

// Exchanges the OAuth "code" for tokens, fetches the user's email, and
// upserts a User row. Refresh token is only ever stored server-side —
// the frontend receives a session cookie, never a Google token.
export async function handleOAuthCallback(code: string) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();

  if (!userInfo.email || !userInfo.id) {
    throw new Error("Google did not return an email/id for this account");
  }
  if (!tokens.refresh_token) {
    // Happens if the user has already granted consent before and Google
    // skips issuing a new refresh_token. We force prompt=consent above to
    // avoid this in normal flow, but guard anyway.
    throw new Error(
      "No refresh_token returned by Google. Revoke prior app access at https://myaccount.google.com/permissions and try again."
    );
  }

  const user = await prisma.user.upsert({
    where: { googleSub: userInfo.id },
    update: {
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
    },
    create: {
      email: userInfo.email,
      googleSub: userInfo.id,
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
    },
  });

  return user;
}

// Returns an OAuth2Client pre-loaded with this user's tokens, refreshing
// the access token transparently (and persisting it) if it's stale.
export async function getAuthorizedClient(userId: string): Promise<OAuth2Client> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const client = newOAuthClient();
  client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry.getTime(),
  });

  client.on("tokens", async (tokens) => {
    // googleapis fires this whenever it silently refreshes for us.
    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: tokens.access_token ?? user.accessToken,
        tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
      },
    });
  });

  return client;
}
