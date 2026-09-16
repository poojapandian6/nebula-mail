import OpenAI from "openai";
import { env } from "../utils/env.js";

export class AssistantNotConfiguredError extends Error {
  constructor() {
    super(
      "The AI assistant isn't configured yet: GROQ_API_KEY is missing. Add it to backend/.env."
    );
    this.name = "AssistantNotConfiguredError";
  }
}

let client: OpenAI | null = null;

// Lazily construct the Groq client so the server can start even if
// the API key is missing. The key is picked up when the assistant is used.
export function getXaiClient(): OpenAI {
  assertXaiConfigured();

  if (!client) {
    client = new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: env.GROQ_BASE_URL,
    });
  }

  return client;
}

// Fail fast with a clear error if the Groq API key is missing.
export function assertXaiConfigured(): void {
  if (!env.GROQ_API_KEY) {
    throw new AssistantNotConfiguredError();
  }
}

export function getXaiModel(): string {
  return env.GROQ_MODEL;
}

// Test-only escape hatch to reset the memoized client between test cases.
export function __resetXaiClientForTests(): void {
  client = null;
}