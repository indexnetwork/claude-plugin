/** Config */
import { config } from "dotenv";
config({ path: ".env.test" });

import { describe, test, expect } from "bun:test";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

import type { ResolvedToolContext } from "../tools";

import { buildSystemContent } from "./chat.prompt";
import { extractRecentToolCalls, resolveModules, type IterationContext } from "./chat.prompt.modules";

describe("extractRecentToolCalls", () => {
  test("returns empty array when no tool calls in messages", () => {
    const messages = [new HumanMessage("hello")];
    const result = extractRecentToolCalls(messages);
    expect(result).toEqual([]);
  });

  test("returns tool calls from most recent AI message", () => {
    const messages = [
      new HumanMessage("find me a mentor"),
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "tc1", name: "create_opportunities", args: { searchQuery: "mentor" }, type: "tool_call" },
        ],
      }),
      new ToolMessage({ tool_call_id: "tc1", content: "results...", name: "create_opportunities" }),
    ];
    const result = extractRecentToolCalls(messages);
    expect(result).toEqual([{ name: "create_opportunities", args: { searchQuery: "mentor" } }]);
  });

  test("collects tool calls from ALL AI messages since last HumanMessage", () => {
    const messages = [
      new HumanMessage("find me a mentor"),
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "tc1", name: "read_user_profiles", args: {}, type: "tool_call" },
        ],
      }),
      new ToolMessage({ tool_call_id: "tc1", content: "profile data", name: "read_user_profiles" }),
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "tc2", name: "create_opportunities", args: { searchQuery: "mentor" }, type: "tool_call" },
        ],
      }),
      new ToolMessage({ tool_call_id: "tc2", content: "results...", name: "create_opportunities" }),
    ];
    const result = extractRecentToolCalls(messages);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toEqual(["read_user_profiles", "create_opportunities"]);
  });

  test("resets scope on new HumanMessage", () => {
    const messages = [
      new HumanMessage("first question"),
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "tc1", name: "read_intents", args: {}, type: "tool_call" },
        ],
      }),
      new ToolMessage({ tool_call_id: "tc1", content: "old intents", name: "read_intents" }),
      new HumanMessage("second question"),
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "tc2", name: "create_intent", args: { description: "test" }, type: "tool_call" },
        ],
      }),
      new ToolMessage({ tool_call_id: "tc2", content: "created", name: "create_intent" }),
    ];
    const result = extractRecentToolCalls(messages);
    expect(result).toEqual([{ name: "create_intent", args: { description: "test" } }]);
  });

  test("handles AI message with multiple parallel tool calls", () => {
    const messages = [
      new HumanMessage("introduce Alice and Bob"),
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "tc1", name: "read_user_profiles", args: { userId: "alice" }, type: "tool_call" },
          { id: "tc2", name: "read_user_profiles", args: { userId: "bob" }, type: "tool_call" },
          { id: "tc3", name: "read_index_memberships", args: { userId: "alice" }, type: "tool_call" },
        ],
      }),
      new ToolMessage({ tool_call_id: "tc1", content: "alice profile", name: "read_user_profiles" }),
      new ToolMessage({ tool_call_id: "tc2", content: "bob profile", name: "read_user_profiles" }),
      new ToolMessage({ tool_call_id: "tc3", content: "alice memberships", name: "read_index_memberships" }),
    ];
    const result = extractRecentToolCalls(messages);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "read_user_profiles", args: { userId: "alice" } });
    expect(result[2]).toEqual({ name: "read_index_memberships", args: { userId: "alice" } });
  });
});

// Minimal mock for ResolvedToolContext — only fields needed by resolution logic
function mockCtx(overrides: Partial<{ indexId: string; isOwner: boolean; isOnboarding: boolean }> = {}): IterationContext["ctx"] {
  return {
    userId: "test-user",
    userEmail: "test@example.com",
    userName: "Test User",
    user: {},
    userProfile: {},
    userIndexes: [],
    scopedIndex: null,
    scopedMembershipRole: null,
    indexId: overrides.indexId ?? null,
    indexName: null,
    isOwner: overrides.isOwner ?? false,
    isOnboarding: overrides.isOnboarding ?? false,
    hasName: true,
  } as unknown as IterationContext["ctx"];
}

describe("resolveModules", () => {
  test("returns empty string when no tools, no regex match, no context match", () => {
    const iterCtx: IterationContext = {
      recentTools: [],
      currentMessage: "hello",
      ctx: mockCtx(),
    };
    const result = resolveModules(iterCtx);
    expect(result).toBe("");
  });

  test("returns empty string when isOnboarding is true (modules skipped)", () => {
    const iterCtx: IterationContext = {
      recentTools: [{ name: "create_opportunities", args: {} }],
      currentMessage: undefined,
      ctx: mockCtx({ isOnboarding: true }),
    };
    const result = resolveModules(iterCtx);
    expect(result).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildSystemContent snapshot identity tests
// ═══════════════════════════════════════════════════════════════════════════════

function makeCtx(overrides: Partial<ResolvedToolContext> = {}): ResolvedToolContext {
  return {
    userId: "user-1",
    userName: "Alice Test",
    userEmail: "alice@example.com",
    user: { id: "user-1", name: "Alice Test", email: "alice@example.com" } as unknown as ResolvedToolContext["user"],
    userProfile: {
      bio: "Builder of things",
      skills: ["typescript"],
      interests: ["AI"],
    } as unknown as ResolvedToolContext["userProfile"],
    userIndexes: [
      {
        indexId: "idx-personal",
        indexTitle: "My Network",
        indexPrompt: null,
        permissions: ["owner"],
        memberPrompt: null,
        autoAssign: false,
        isPersonal: true,
        joinedAt: "2024-01-01T00:00:00Z",
      },
      {
        indexId: "idx-community",
        indexTitle: "AI Builders",
        indexPrompt: "AI enthusiasts",
        permissions: ["member"],
        memberPrompt: null,
        autoAssign: true,
        isPersonal: false,
        joinedAt: "2024-02-01T00:00:00Z",
      },
    ] as unknown as ResolvedToolContext["userIndexes"],
    isOnboarding: false,
    hasName: true,
    ...overrides,
  };
}

describe("buildSystemContent snapshot identity", () => {
  test("general chat (no index scope, no onboarding) — section order is correct", () => {
    const ctx = makeCtx();
    const output = buildSystemContent(ctx);

    // Verify key sections are present in the correct order
    const missionIdx = output.indexOf("You are Index.");
    const voiceIdx = output.indexOf("## Voice and constraints");
    const sessionIdx = output.indexOf("## Session");
    const preloadedIdx = output.indexOf("### Current User (preloaded context)");
    const architectureIdx = output.indexOf("## Architecture Philosophy");
    const toolsIdx = output.indexOf("## Tools Reference");
    const patternsIdx = output.indexOf("## Orchestration Patterns");
    const behavioralIdx = output.indexOf("## Behavioral Rules");
    const scopingIdx = output.indexOf("### Index Scope");
    const urlsIdx = output.indexOf("### URLs");
    const narrationIdx = output.indexOf("### Narration Style");
    const outputFmtIdx = output.indexOf("### Output Format");
    const generalIdx = output.indexOf("### General");

    expect(missionIdx).toBeGreaterThanOrEqual(0);
    expect(voiceIdx).toBeGreaterThan(missionIdx);
    expect(sessionIdx).toBeGreaterThan(voiceIdx);
    expect(preloadedIdx).toBeGreaterThan(sessionIdx);
    expect(architectureIdx).toBeGreaterThan(preloadedIdx);
    expect(toolsIdx).toBeGreaterThan(architectureIdx);
    expect(patternsIdx).toBeGreaterThan(toolsIdx);
    expect(behavioralIdx).toBeGreaterThan(patternsIdx);
    expect(scopingIdx).toBeGreaterThan(behavioralIdx);
    expect(urlsIdx).toBeGreaterThan(scopingIdx);
    expect(narrationIdx).toBeGreaterThan(urlsIdx);
    expect(outputFmtIdx).toBeGreaterThan(narrationIdx);
    expect(generalIdx).toBeGreaterThan(outputFmtIdx);

    // Onboarding section must NOT be present
    expect(output).not.toContain("## ONBOARDING MODE");

    // Snapshot output length as canary for unintended changes
    expect(output.length).toMatchSnapshot();
  });

  test("scoped chat (index scope, owner) produces stable output", () => {
    const ctx = makeCtx({
      indexId: "idx-community",
      indexName: "AI Builders",
      isOwner: true,
      scopedIndex: { id: "idx-community", title: "AI Builders", prompt: "AI enthusiasts" },
      scopedMembershipRole: "owner",
    });
    const output = buildSystemContent(ctx);

    expect(output).toContain('This chat is scoped to index "AI Builders"');
    expect(output).toContain("You are the **owner** of this index");
    expect(output).toContain("scoped to current index");

    expect(output.length).toMatchSnapshot();
  });

  test("onboarding mode produces stable output", () => {
    const ctx = makeCtx({ isOnboarding: true, hasName: true });
    const output = buildSystemContent(ctx);

    expect(output).toContain("## ONBOARDING MODE (ACTIVE)");
    expect(output).toContain("### Onboarding Flow");
    expect(output).toContain("complete_onboarding()");

    expect(output.length).toMatchSnapshot();
  });

  test("onboarding without name produces stable output", () => {
    const ctx = makeCtx({ isOnboarding: true, hasName: false });
    const output = buildSystemContent(ctx);

    expect(output).toContain("**User has no name on file.**");
    expect(output).not.toContain("You're Alice Test, right?");

    expect(output.length).toMatchSnapshot();
  });

  test("without iterCtx, modules section is empty and result matches empty-tools call", () => {
    const ctx = makeCtx();
    const withoutIter = buildSystemContent(ctx);
    const withEmptyIter = buildSystemContent(ctx, {
      recentTools: [],
      ctx,
    });
    // With no modules registered and no tools called, result should be identical
    expect(withEmptyIter).toBe(withoutIter);
  });
});
