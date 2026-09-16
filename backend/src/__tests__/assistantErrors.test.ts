import { describe, it, expect } from "vitest";
import { APIError } from "openai";
import { classifyAssistantError } from "../assistant/errors.js";
import { AssistantNotConfiguredError } from "../assistant/xaiClient.js";

// Builds a fake APIError the same way the SDK does, without making any
// network call — the constructor just needs a status, an error body, a
// message, and headers (undefined is fine; we don't inspect them).
function fakeApiError(status: number, message = "error"): APIError {
  return new APIError(status, { error: { message } }, message, undefined);
}

describe("classifyAssistantError", () => {
  it("gives a clear, actionable message when XAI_API_KEY is missing", () => {
    const { status, message } = classifyAssistantError(new AssistantNotConfiguredError());
    expect(status).toBe(503);
    expect(message).toMatch(/XAI_API_KEY/);
  });

  it("classifies a 401/403 as an invalid-key problem, not a generic failure", () => {
    for (const code of [401, 403]) {
      const { status, message } = classifyAssistantError(fakeApiError(code));
      expect(status).toBe(502);
      expect(message).toMatch(/XAI_API_KEY/i);
    }
  });

  it("classifies a 429 as a rate limit with a retryable tone", () => {
    const { status, message } = classifyAssistantError(fakeApiError(429));
    expect(status).toBe(429);
    expect(message).toMatch(/rate.?limit/i);
  });

  it("classifies a 400 as a malformed-request problem", () => {
    const { status, message } = classifyAssistantError(fakeApiError(400));
    expect(status).toBe(502);
    expect(message).toMatch(/malformed/i);
  });

  it("classifies a 5xx as the provider being unavailable", () => {
    const { status, message } = classifyAssistantError(fakeApiError(503));
    expect(status).toBe(502);
    expect(message).toMatch(/unavailable/i);
  });

  it("classifies a network-level failure distinctly from an API error", () => {
    const { status, message } = classifyAssistantError(new Error("fetch failed: ENOTFOUND api.x.ai"));
    expect(status).toBe(502);
    expect(message).toMatch(/reach the xAI API/i);
  });

  it("falls back to a generic message for anything unrecognized, without throwing", () => {
    const { status, message } = classifyAssistantError(new Error("something completely unexpected"));
    expect(status).toBe(500);
    expect(message).toMatch(/unexpected error/i);
  });

  it("handles a non-Error thrown value without crashing", () => {
    const { status, message } = classifyAssistantError("a plain string was thrown");
    expect(status).toBe(500);
    expect(typeof message).toBe("string");
  });
});
