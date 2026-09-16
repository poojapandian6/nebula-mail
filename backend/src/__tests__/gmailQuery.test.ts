import { describe, it, expect } from "vitest";
import { buildGmailQuery } from "../services/gmailService.js";

describe("buildGmailQuery", () => {
  it("returns an empty string when no filters are set", () => {
    expect(buildGmailQuery({})).toBe("");
  });

  it("combines free-text query with sender", () => {
    const q = buildGmailQuery({ query: "project update", from: "sarah@example.com" });
    expect(q).toBe("project update from:sarah@example.com");
  });

  it("formats after/before as Gmail date syntax (YYYY/MM/DD)", () => {
    const q = buildGmailQuery({ after: "2026-08-01T00:00:00.000Z" });
    expect(q).toMatch(/^after:\d{4}\/\d{2}\/\d{2}$/);
  });

  it("adds is:unread when unreadOnly is set", () => {
    expect(buildGmailQuery({ unreadOnly: true })).toBe("is:unread");
  });

  it("combines every filter kind together", () => {
    const q = buildGmailQuery({
      query: "invoice",
      from: "billing@acme.com",
      after: "2026-01-01T00:00:00.000Z",
      before: "2026-02-01T00:00:00.000Z",
      unreadOnly: true,
    });
    expect(q).toContain("invoice");
    expect(q).toContain("from:billing@acme.com");
    expect(q).toContain("after:2026/01/01");
    expect(q).toContain("before:2026/02/01");
    expect(q).toContain("is:unread");
  });
});
