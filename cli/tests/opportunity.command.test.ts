import { describe, it, expect } from "bun:test";

import { parseArgs } from "../src/args.parser";

describe("opportunity argument parsing", () => {
  it("parses 'opportunity list' subcommand", () => {
    const result = parseArgs(["opportunity", "list"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("list");
  });

  it("parses 'opportunity list --status pending'", () => {
    const result = parseArgs(["opportunity", "list", "--status", "pending"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("list");
    expect(result.status).toBe("pending");
  });

  it("parses 'opportunity list --limit 5'", () => {
    const result = parseArgs(["opportunity", "list", "--limit", "5"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("list");
    expect(result.limit).toBe(5);
  });

  it("parses 'opportunity list --status accepted --limit 10'", () => {
    const result = parseArgs(["opportunity", "list", "--status", "accepted", "--limit", "10"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("list");
    expect(result.status).toBe("accepted");
    expect(result.limit).toBe(10);
  });

  it("parses 'opportunity show <id>'", () => {
    const result = parseArgs(["opportunity", "show", "opp-123"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("show");
    expect(result.targetId).toBe("opp-123");
  });

  it("parses 'opportunity accept <id>'", () => {
    const result = parseArgs(["opportunity", "accept", "opp-456"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("accept");
    expect(result.targetId).toBe("opp-456");
  });

  it("parses 'opportunity reject <id>'", () => {
    const result = parseArgs(["opportunity", "reject", "opp-789"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("reject");
    expect(result.targetId).toBe("opp-789");
  });

  it("parses bare 'opportunity' with no subcommand", () => {
    const result = parseArgs(["opportunity"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBeUndefined();
  });

  it("parses 'opportunity show' without id", () => {
    const result = parseArgs(["opportunity", "show"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("show");
    expect(result.targetId).toBeUndefined();
  });

  it("parses 'opportunity list' with --api-url", () => {
    const result = parseArgs(["opportunity", "list", "--api-url", "http://example.com"]);
    expect(result.command).toBe("opportunity");
    expect(result.subcommand).toBe("list");
    expect(result.apiUrl).toBe("http://example.com");
  });
});
