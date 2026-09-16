import { describe, it, expect } from "vitest";
import { assistantTools } from "../assistant/tools.js";

const EXPECTED_TOOL_NAMES = [
  "fill_compose",
  "send_email",
  "search_emails",
  "apply_filter",
  "open_email",
  "reply_to_open_email",
  "forward_open_email",
];

describe("assistantTools (Grok/xAI function-calling schema)", () => {
  it("defines exactly the expected set of tools, no more and no fewer", () => {
    const names = assistantTools.map((t) => t.function.name);
    expect(names.sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("every tool is shaped for OpenAI-compatible function calling", () => {
    for (const tool of assistantTools) {
      expect(tool.type).toBe("function");
      expect(typeof tool.function.name).toBe("string");
      expect(typeof tool.function.description).toBe("string");
      expect(tool.function.description!.length).toBeGreaterThan(10);
      expect(tool.function.parameters).toBeDefined();
      expect((tool.function.parameters as any).type).toBe("object");
      expect((tool.function.parameters as any).properties).toBeTypeOf("object");
      expect(Array.isArray((tool.function.parameters as any).required)).toBe(true);
    }
  });

  it("send_email requires the minimum fields needed to actually compose a message", () => {
    const sendEmail = assistantTools.find((t) => t.function.name === "send_email")!;
    const params = sendEmail.function.parameters as any;
    expect(params.required).toEqual(expect.arrayContaining(["to", "subject", "body"]));
  });

  it("reply_to_open_email and forward_open_email don't require an emailId — they rely on UI context instead", () => {
    for (const name of ["reply_to_open_email", "forward_open_email"]) {
      const tool = assistantTools.find((t) => t.function.name === name)!;
      const params = tool.function.parameters as any;
      expect(Object.keys(params.properties)).not.toContain("emailId");
    }
  });

  it("no tool exposes a way to generate or execute raw HTML/JS/code", () => {
    // Guards the "never let the model render arbitrary UI" architectural
    // guarantee: every parameter across every tool must be a plain string,
    // number, boolean, or enum — never anything that reads as "here's a
    // blob of markup/script to inject."
    for (const tool of assistantTools) {
      const properties = (tool.function.parameters as any).properties ?? {};
      for (const [key, schema] of Object.entries<any>(properties)) {
        expect(["string", "number", "boolean"]).toContain(schema.type);
        expect(key.toLowerCase()).not.toMatch(/html|script|jsx|markup/);
      }
    }
  });
});
