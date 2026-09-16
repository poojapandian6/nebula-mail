import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// env.ts reads process.env at import time (via dotenv), so we manipulate
// process.env directly and re-import the module fresh per test using
// vi.resetModules() — this lets us test both "key present" and "key
// missing" without any live network call to xAI.
describe("xaiClient", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("assertXaiConfigured throws AssistantNotConfiguredError when XAI_API_KEY is missing", async () => {
    process.env.XAI_API_KEY = "";
    const { assertXaiConfigured, AssistantNotConfiguredError } = await import("../assistant/xaiClient.js");

    expect(() => assertXaiConfigured()).toThrow(AssistantNotConfiguredError);
    expect(() => assertXaiConfigured()).toThrow(/XAI_API_KEY is missing/);
  });

  it("getXaiClient throws the same configuration error rather than constructing a client with an empty key", async () => {
    process.env.XAI_API_KEY = "";
    const { getXaiClient, AssistantNotConfiguredError } = await import("../assistant/xaiClient.js");

    expect(() => getXaiClient()).toThrow(AssistantNotConfiguredError);
  });

  it("getXaiClient constructs a real OpenAI-SDK client pointed at the configured xAI base URL when a key is present", async () => {
    process.env.XAI_API_KEY = "test-key-123";
    process.env.XAI_BASE_URL = "https://api.x.ai/v1";
    const { getXaiClient } = await import("../assistant/xaiClient.js");

    const client = getXaiClient();
    expect(client.baseURL).toBe("https://api.x.ai/v1");
    expect(client.apiKey).toBe("test-key-123");
  });

  it("getXaiModel falls back to grok-4.6 when XAI_MODEL is not set", async () => {
    process.env.XAI_API_KEY = "test-key-123";
    delete process.env.XAI_MODEL;
    const { getXaiModel } = await import("../assistant/xaiClient.js");

    expect(getXaiModel()).toBe("grok-4.6");
  });

  it("getXaiModel respects an explicit XAI_MODEL override", async () => {
    process.env.XAI_API_KEY = "test-key-123";
    process.env.XAI_MODEL = "grok-4.6-fast";
    const { getXaiModel } = await import("../assistant/xaiClient.js");

    expect(getXaiModel()).toBe("grok-4.6-fast");
  });
});
