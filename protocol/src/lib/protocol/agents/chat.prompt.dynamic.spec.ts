/**
 * Chat Prompt Dynamic Modules: Smartest-driven behavioral tests.
 *
 * Verifies that the dynamically assembled prompt (core + modules) produces
 * correct agent behavior for key scenarios:
 *   1. Discovery routing (core rule, no module needed on first iteration)
 *   2. URL triggers scraping module
 *   3. @mention handling triggers mentions module
 *
 * These tests invoke the full chat graph with real LLM calls.
 */
/** Config */
import { config } from "dotenv";
config({ path: ".env.test" });

import { describe, test, expect, beforeAll } from "bun:test";
import { z } from "zod";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";

import { runScenario, defineScenario, expectSmartest } from "../../smartest";
import { ChatGraphFactory } from "../graphs/chat.graph";
import type { Embedder } from "../interfaces/embedder.interface";
import type { Scraper } from "../interfaces/scraper.interface";
import { createChatGraphMockDb } from "../graphs/tests/chat.graph.mocks";

/**
 * Checks if any AIMessage in the output messages array made a tool call with the given name.
 */
function hasToolCall(messages: unknown[], toolName: string): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((msg) => {
    const m = msg as BaseMessage;
    if (m?._getType?.() === "ai") {
      const toolCalls = (m as { tool_calls?: Array<{ name: string }> }).tool_calls;
      return toolCalls?.some((tc) => tc.name === toolName) ?? false;
    }
    return false;
  });
}

const testUserId = "test-dynamic-prompt-user";

const chatGraphOutputSchema = z.object({
  messages: z.array(z.unknown()),
  responseText: z.string().optional(),
  iterationCount: z.number().optional(),
  shouldContinue: z.boolean().optional(),
  error: z.string().optional(),
});

const mockEmbedder: Embedder = {
  generate: async () => [],
  generateForDocuments: async () => [],
  addVectors: async () => [],
  similaritySearch: async () => [],
} as unknown as Embedder;

const mockScraper: Scraper = {
  scrape: async (_url: string) => "Scraped content: This article discusses advances in artificial intelligence and machine learning applications in healthcare.",
  extractUrlContent: async (_url: string) => "Scraped content: This article discusses advances in artificial intelligence and machine learning applications in healthcare.",
} as unknown as Scraper;

/** Returns a user record with onboarding completed so tests don't enter onboarding mode. */
function completedUser(userId: string) {
  return {
    id: userId,
    name: "Test User",
    email: "test@example.com",
    onboarding: { completedAt: new Date().toISOString() },
  };
}

describe("Chat Prompt Dynamic Modules (Smartest)", () => {
  let factory: ChatGraphFactory;

  beforeAll(() => {
    const mockDatabase = createChatGraphMockDb({
      getUser: (userId: string) => completedUser(userId),
    });
    factory = new ChatGraphFactory(mockDatabase, mockEmbedder, mockScraper);
  });

  describe("Discovery routing (core rule, no module needed)", () => {
    test("'find me a mentor in AI' calls create_opportunities, not create_intent", async () => {
      const compiledGraph = factory.createGraph();

      const result = await runScenario(
        defineScenario({
          name: "dynamic-prompt-discovery-routing",
          description:
            "User says 'find me a mentor in AI'. The core prompt rule routes connection-seeking to create_opportunities, not create_intent. This validates the first iteration before any modules are loaded.",
          fixtures: {
            userId: testUserId,
            message: "find me a mentor in AI",
          },
          sut: {
            type: "graph",
            factory: () => compiledGraph,
            invoke: async (instance: unknown, resolvedInput: unknown) => {
              const input = resolvedInput as { userId: string; message: string };
              return await (instance as ReturnType<ChatGraphFactory["createGraph"]>).invoke({
                userId: input.userId,
                messages: [new HumanMessage(input.message)],
              });
            },
            input: {
              userId: "@fixtures.userId",
              message: "@fixtures.message",
            },
          },
          verification: {
            schema: chatGraphOutputSchema,
            criteria:
              "Agent must have called create_opportunities tool (not create_intent). Response should present connections or state no matches found.",
            llmVerify: true,
          },
        })
      );

      expectSmartest(result);
      const output = result.output as { responseText?: string; messages?: unknown[] };
      expect(output.responseText).toBeDefined();
      expect(output.responseText!.length).toBeGreaterThan(0);

      // Deterministic: agent must have called create_opportunities, not create_intent
      expect(hasToolCall(output.messages ?? [], "create_opportunities")).toBe(true);
      expect(hasToolCall(output.messages ?? [], "create_intent")).toBe(false);
    }, 180000);
  });

  describe("URL triggers scraping module", () => {
    test("message with URL triggers scrape_url call", async () => {
      const compiledGraph = factory.createGraph();

      const result = await runScenario(
        defineScenario({
          name: "dynamic-prompt-url-scraping",
          description:
            "User sends a message containing a URL. The regex trigger on the url-scraping module should match, and the agent should call scrape_url with the URL before responding.",
          fixtures: {
            userId: testUserId,
            message: "check out https://example.com/article and tell me what it's about",
          },
          sut: {
            type: "graph",
            factory: () => compiledGraph,
            invoke: async (instance: unknown, resolvedInput: unknown) => {
              const input = resolvedInput as { userId: string; message: string };
              return await (instance as ReturnType<ChatGraphFactory["createGraph"]>).invoke({
                userId: input.userId,
                messages: [new HumanMessage(input.message)],
              });
            },
            input: {
              userId: "@fixtures.userId",
              message: "@fixtures.message",
            },
          },
          verification: {
            schema: chatGraphOutputSchema,
            criteria:
              "Agent must have called scrape_url tool with the URL. Response should summarize or reference the scraped content.",
            llmVerify: true,
          },
        })
      );

      expectSmartest(result);
      const output = result.output as { responseText?: string; messages?: unknown[] };
      expect(output.responseText).toBeDefined();
      expect(output.responseText!.length).toBeGreaterThan(0);

      // Deterministic: agent must have called scrape_url
      expect(hasToolCall(output.messages ?? [], "scrape_url")).toBe(true);
    }, 180000);
  });

  describe("@mention handling", () => {
    test("message with @[Name](userId) triggers read_user_profiles", async () => {
      const mockDatabase = createChatGraphMockDb({
        getUser: (userId: string) => {
          if (userId === "user-123") {
            return { id: "user-123", name: "Alice Smith", email: "alice@example.com", onboarding: { completedAt: new Date().toISOString() } };
          }
          return completedUser(userId);
        },
      });
      const mentionFactory = new ChatGraphFactory(mockDatabase, mockEmbedder, mockScraper);
      const compiledGraph = mentionFactory.createGraph();

      const result = await runScenario(
        defineScenario({
          name: "dynamic-prompt-mention-handling",
          description:
            "User sends a message with @[Alice Smith](user-123) markup. The mentions module regex trigger should match, and the agent should extract the userId and call read_user_profiles to look up that user.",
          fixtures: {
            userId: testUserId,
            message: "tell me about @[Alice Smith](user-123)",
          },
          sut: {
            type: "graph",
            factory: () => compiledGraph,
            invoke: async (instance: unknown, resolvedInput: unknown) => {
              const input = resolvedInput as { userId: string; message: string };
              return await (instance as ReturnType<ChatGraphFactory["createGraph"]>).invoke({
                userId: input.userId,
                messages: [new HumanMessage(input.message)],
              });
            },
            input: {
              userId: "@fixtures.userId",
              message: "@fixtures.message",
            },
          },
          verification: {
            schema: chatGraphOutputSchema,
            criteria:
              "Agent must have attempted to look up information about Alice (called read_user_profiles or similar tool). Response should mention Alice by name — either presenting information or acknowledging the lookup attempt.",
            llmVerify: true,
          },
        })
      );

      expectSmartest(result);
      const output = result.output as { responseText?: string; messages?: unknown[] };
      expect(output.responseText).toBeDefined();
      expect(output.responseText!.length).toBeGreaterThan(0);

      // Deterministic: agent must have called read_user_profiles
      expect(hasToolCall(output.messages ?? [], "read_user_profiles")).toBe(true);
    }, 180000);
  });
});
