import OpenAI from "openai";
import { AssistantNotConfiguredError } from "./xaiClient.js";

// Turns whatever the Groq call threw
// user in the assistant chat panel. Covers every failure mode called out
// for this integration: missing/invalid key, rate limits, network errors,
// and anything else falls back to a generic message (with the real detail
// still logged server-side by the route handler, never swallowed).
export function classifyAssistantError(err: unknown): { status: number; message: string } {
  if (err instanceof AssistantNotConfiguredError) {
    return { status: 503, message: err.message };
  }

  if (err instanceof OpenAI.APIError) {
    switch (err.status) {
      case 401:
      case 403:
        return {
          status: 502,
          message: "The Groq API rejected the request — check that GROQ_API_KEY in your backend .env is valid.",
        };
      case 429:
        return {
          status: 429,
          message: "The assistant is being rate-limited by the Groq API right now — please wait a moment and try again.",
        };
      case 400:
        return {
          status: 502,
          message: "The Groq API rejected the request as malformed. This usually means a tool call had arguments the model formed incorrectly — try rephrasing.",
        };
      default:
        if (err.status && err.status >= 500) {
          return { status: 502, message: "The Groq API is currently unavailable — please try again shortly." };
        }
        return { status: 502, message: `The Groq API returned an error: ${err.message}` };
    }
  }

  // Network-level failures (DNS, connection refused, timeout) surface from
  // the underlying fetch as a TypeError / "APIConnectionError"-shaped
  // object from the SDK rather than an OpenAI.APIError with a status code.
  if (err instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(err.message)) {
    return {
      status: 502,
      message: "Couldn't reach the Groq API — check GROQ_BASE_URL and your network connection.",
    };
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  return { status: 500, message: `The assistant hit an unexpected error: ${message}` };
}
