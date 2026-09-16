import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("xaiClient", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("assertXaiConfigured throws AssistantNotConfiguredError when GROQ_API_KEY is missing", async () => {
    process.env.GROQ_API_KEY = "";

    const {
      assertXaiConfigured,
      AssistantNotConfiguredError,
    } = await import("../assistant/xaiClient.js");

    expect(() => assertXaiConfigured()).toThrow(AssistantNotConfiguredError);
    expect(() => assertXaiConfigured()).toThrow(/GROQ_API_KEY is missing/);
  });

  it("getXaiClient throws the same configuration error rather than constructing a client with an empty key", async () => {
    process.env.GROQ_API_KEY = "";

    const {
      getXaiClient,
      AssistantNotConfiguredError,
    } = await import("../assistant/xaiClient.js");

    expect(() => getXaiClient()).toThrow(AssistantNotConfiguredError);
  });

  it("getXaiClient constructs a real OpenAI-SDK client pointed at the configured Groq base URL when a key is present", async () => {
    process.env.GROQ_API_KEY = "test-key-123";
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";

    const { getXaiClient } =
      await import("../assistant/xaiClient.js");

    const client = getXaiClient();

    expect(client.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(client.apiKey).toBe("test-key-123");
  });

  it("getXaiModel falls back to the configured Groq model when GROQ_MODEL is not set", async () => {
    process.env.GROQ_API_KEY = "test-key-123";
    delete process.env.GROQ_MODEL;

    const { getXaiModel } =
      await import("../assistant/xaiClient.js");

    expect(getXaiModel()).toBe("openai/gpt-oss-120b");
  });

  it("getXaiModel respects an explicit GROQ_MODEL override", async () => {
    process.env.GROQ_API_KEY = "test-key-123";
    process.env.GROQ_MODEL = "openai/gpt-oss-120b";

    const { getXaiModel } =
      await import("../assistant/xaiClient.js");

    expect(getXaiModel()).toBe("openai/gpt-oss-120b");
  });
});