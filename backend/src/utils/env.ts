import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;

  if (v === undefined) {
    // We intentionally don't throw at import time for every optional var —
    // only the ones the server cannot run without in the current mode.
    console.warn(`[env] Missing environment variable: ${name}`);
    return "";
  }

  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  FRONTEND_URL: required("FRONTEND_URL", "http://localhost:5173"),
  SESSION_JWT_SECRET: required("SESSION_JWT_SECRET", "dev-secret-change-me"),

  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: required(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:4000/api/auth/google/callback"
  ),

  GOOGLE_PUBSUB_TOPIC: process.env.GOOGLE_PUBSUB_TOPIC ?? "",
  GOOGLE_PUBSUB_SUBSCRIPTION: process.env.GOOGLE_PUBSUB_SUBSCRIPTION ?? "",
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ?? "",

  // AI provider: Groq through the OpenAI-compatible Chat Completions API.
  GROQ_API_KEY: required("GROQ_API_KEY"),
  GROQ_BASE_URL:
    process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
};