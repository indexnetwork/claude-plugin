/**
 * Unit tests for chat tools (createChatTools, get_intents_in_index, list_index_members, list_index_intents).
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { createChatTools, type ToolContext } from "./chat.tools";
import type { ChatGraphCompositeDatabase } from "../../interfaces/database.interface";
import type { ActiveIntent, IndexMemberDetails, IndexedIntentDetails, OwnedIndex } from "../../interfaces/database.interface";
import type { Embedder } from "../../interfaces/embedder.interface";
import type { Scraper } from "../../interfaces/scraper.interface";

const testUserId = "test-user-id-for-tools";

type MockOverrides = Partial<Pick<
  ChatGraphCompositeDatabase,
  "getOwnedIndexes" | "isIndexOwner" | "getIndexMembersForOwner" | "getIndexIntentsForOwner"
>>;

/**
 * Minimal mock database. getIntentsInIndexForMemberImpl is required for get_intents_in_index.
 * Optional overrides for owner-only tools (getOwnedIndexes, isIndexOwner, getIndexMembersForOwner, getIndexIntentsForOwner).
 */
function createMockDatabase(
  getIntentsInIndexForMemberImpl: (userId: string, indexNameOrId: string) => Promise<ActiveIntent[]>,
  overrides?: MockOverrides
): ChatGraphCompositeDatabase {
  const noop = async () => undefined;
  const noopNull = async () => null;
  const noopArray = async () => [];
  const noopBool = async () => false;
  const base = {
    getProfile: noopNull,
    getActiveIntents: noopArray,
    getIntentsInIndexForMember: getIntentsInIndexForMemberImpl,
    getUser: noopNull,
    saveProfile: noop,
    saveHydeProfile: noop,
    createIntent: async () => ({ id: "", payload: "", summary: null, isIncognito: false, createdAt: new Date(), updatedAt: new Date(), userId: "" }),
    updateIntent: noopNull,
    archiveIntent: async () => ({ success: true }),
    getUserIndexIds: noopArray,
    getIndexMemberships: noopArray,
    getIntentForIndexing: noopNull,
    getIndexMemberContext: noopNull,
    isIntentAssignedToIndex: noopBool,
    assignIntentToIndex: noop,
    unassignIntentFromIndex: noop,
    getOwnedIndexes: noopArray,
    isIndexOwner: noopBool,
    getIndexMembersForOwner: noopArray,
    getIndexIntentsForOwner: noopArray,
    updateIndexSettings: async () => ({ id: "", title: "", prompt: null, permissions: {} as any, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, memberCount: 0, intentCount: 0 }),
  };
  return { ...base, ...overrides } as unknown as ChatGraphCompositeDatabase;
}

/** Stub embedder for tool creation (not invoked by get_intents_in_index). */
const mockEmbedder = {
  generate: async () => [] as number[],
  generateForDocuments: async () => [],
  addVectors: async () => [],
  similaritySearch: async () => [],
} as unknown as Embedder;

/** Stub scraper for tool creation (not invoked by get_intents_in_index). */
const mockScraper = {
  scrape: async () => "",
} as unknown as Scraper;

describe("createChatTools", () => {
  test("returns an array that includes a tool named get_intents_in_index", () => {
    const mockDb = createMockDatabase(async () => []);
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    expect(tools).toBeArray();
    const getIntentsInIndexTool = tools.find((t: { name: string }) => t.name === "get_intents_in_index");
    expect(getIntentsInIndexTool).toBeDefined();
    expect(getIntentsInIndexTool!.name).toBe("get_intents_in_index");
  });

  test("returns tools list_index_members and list_index_intents", () => {
    const mockDb = createMockDatabase(async () => []);
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    expect(tools.find((t: { name: string }) => t.name === "list_index_members")).toBeDefined();
    expect(tools.find((t: { name: string }) => t.name === "list_index_intents")).toBeDefined();
  });
});

describe("get_intents_in_index tool", () => {
  let getIntentsInIndexTool: { invoke: (args: { indexNameOrId: string }) => Promise<string> };

  beforeAll(() => {
    const mockIntents: ActiveIntent[] = [
      { id: "intent-1", payload: "Find ML collaborators", summary: "ML collab", createdAt: new Date("2025-01-01") },
      { id: "intent-2", payload: "Learn Rust", summary: "Rust", createdAt: new Date("2025-01-02") },
    ];
    const mockDb = createMockDatabase(async (userId, indexNameOrId) => {
      if (userId !== testUserId) return [];
      if (indexNameOrId === "Open Mock Network" || indexNameOrId === "open mock network") return mockIntents;
      return [];
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "get_intents_in_index");
    if (!tool || typeof (tool as { invoke?: (args: unknown) => Promise<unknown> }).invoke !== "function") {
      throw new Error("get_intents_in_index tool not found or missing invoke");
    }
    getIntentsInIndexTool = tool as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
  });

  test("invoke returns success with intents and count when index has intents", async () => {
    const result = await getIntentsInIndexTool.invoke({ indexNameOrId: "Open Mock Network" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
    expect(parsed.data.intents).toBeArray();
    expect(parsed.data.intents.length).toBe(2);
    expect(parsed.data.count).toBe(2);
    expect(parsed.data.intents[0]).toMatchObject({ id: "intent-1", payload: "Find ML collaborators", summary: "ML collab" });
    expect(parsed.data.intents[1]).toMatchObject({ id: "intent-2", payload: "Learn Rust", summary: "Rust" });
    expect(new Date(parsed.data.intents[0].createdAt).getTime()).toBe(new Date("2025-01-01").getTime());
  });

  test("invoke returns success with empty intents when user has no intents in that index", async () => {
    const result = await getIntentsInIndexTool.invoke({ indexNameOrId: "Other Index" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.intents).toBeArray();
    expect(parsed.data.intents.length).toBe(0);
    expect(parsed.data.count).toBe(0);
  });

  test("invoke calls database.getIntentsInIndexForMember with userId and indexNameOrId", async () => {
    let capturedUserId: string | null = null;
    let capturedIndexNameOrId: string | null = null;
    const mockDb = createMockDatabase(async (userId, indexNameOrId) => {
      capturedUserId = userId;
      capturedIndexNameOrId = indexNameOrId;
      return [];
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "get_intents_in_index") as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
    await tool.invoke({ indexNameOrId: "My Community" });
    expect(capturedUserId === testUserId).toBe(true);
    expect(capturedIndexNameOrId === "My Community").toBe(true);
  });
});

describe("list_index_members tool", () => {
  const ownedIndexId = "a1b2c3d4-0000-4000-8000-000000000001";
  const mockMembers: IndexMemberDetails[] = [
    { userId: "u1", name: "Alice", avatar: null, email: "alice@example.com", permissions: ["member"], memberPrompt: null, autoAssign: true, joinedAt: new Date("2025-01-01"), intentCount: 2 },
    { userId: "u2", name: "Bob", avatar: null, email: "bob@example.com", permissions: ["member"], memberPrompt: null, autoAssign: false, joinedAt: new Date("2025-01-02"), intentCount: 1 },
  ];

  test("invoke returns success with members when owner and index found by ID", async () => {
    const mockDb = createMockDatabase(async () => [], {
      isIndexOwner: async (indexId, uid) => indexId === ownedIndexId && uid === testUserId,
      getIndexMembersForOwner: async (indexId, uid) => {
        if (indexId === ownedIndexId && uid === testUserId) return mockMembers;
        throw new Error("Access denied: Not an owner of this index");
      },
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "list_index_members") as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
    const result = await tool.invoke({ indexNameOrId: ownedIndexId });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.indexId).toBe(ownedIndexId);
    expect(parsed.data.count).toBe(2);
    expect(parsed.data.members).toBeArray();
    expect(parsed.data.members[0]).toMatchObject({ name: "Alice", email: "alice@example.com", intentCount: 2 });
    expect(parsed.data.members[1]).toMatchObject({ name: "Bob", email: "bob@example.com", intentCount: 1 });
  });

  test("invoke returns success with members when index resolved by name", async () => {
    const mockOwned: OwnedIndex[] = [{ id: ownedIndexId, title: "AI Founders", prompt: null, permissions: {} as any, createdAt: new Date(), memberCount: 2, intentCount: 3 }];
    const mockDb = createMockDatabase(async () => [], {
      getOwnedIndexes: async () => mockOwned,
      isIndexOwner: async () => true,
      getIndexMembersForOwner: async () => mockMembers,
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "list_index_members") as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
    const result = await tool.invoke({ indexNameOrId: "AI Founders" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.indexId).toBe(ownedIndexId);
    expect(parsed.data.count).toBe(2);
  });

  test("invoke returns error when not owner", async () => {
    const mockDb = createMockDatabase(async () => [], {
      isIndexOwner: async () => false,
      getOwnedIndexes: async () => [],
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "list_index_members") as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
    const result = await tool.invoke({ indexNameOrId: ownedIndexId });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain("not an owner");
  });
});

describe("list_index_intents tool", () => {
  const ownedIndexId = "a1b2c3d4-0000-4000-8000-000000000002";
  const mockIntents: IndexedIntentDetails[] = [
    { id: "i1", payload: "Find ML collaborators", summary: "ML", userId: "u1", userName: "Alice", createdAt: new Date("2025-01-01") },
    { id: "i2", payload: "Learn Rust", summary: "Rust", userId: "u2", userName: "Bob", createdAt: new Date("2025-01-02") },
  ];

  test("invoke returns success with intents when owner", async () => {
    const mockDb = createMockDatabase(async () => [], {
      isIndexOwner: async (indexId, uid) => indexId === ownedIndexId && uid === testUserId,
      getIndexIntentsForOwner: async (indexId, uid) => {
        if (indexId === ownedIndexId && uid === testUserId) return mockIntents;
        throw new Error("Access denied: Not an owner of this index");
      },
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "list_index_intents") as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
    const result = await tool.invoke({ indexNameOrId: ownedIndexId });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.indexId).toBe(ownedIndexId);
    expect(parsed.data.count).toBe(2);
    expect(parsed.data.intents[0]).toMatchObject({ payload: "Find ML collaborators", summary: "ML", userName: "Alice" });
    expect(parsed.data.intents[1]).toMatchObject({ payload: "Learn Rust", summary: "Rust", userName: "Bob" });
  });

  test("invoke returns error when not owner", async () => {
    const mockDb = createMockDatabase(async () => [], {
      isIndexOwner: async () => false,
      getOwnedIndexes: async () => [],
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "list_index_intents") as { invoke: (args: { indexNameOrId: string }) => Promise<string> };
    const result = await tool.invoke({ indexNameOrId: ownedIndexId });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain("not an owner");
  });

  test("invoke passes limit and offset to getIndexIntentsForOwner", async () => {
    let capturedOptions: { limit?: number; offset?: number } | undefined;
    const mockDb = createMockDatabase(async () => [], {
      isIndexOwner: async () => true,
      getIndexIntentsForOwner: async (_indexId, _uid, options) => {
        capturedOptions = options;
        return [];
      },
    });
    const context: ToolContext = { userId: testUserId, database: mockDb, embedder: mockEmbedder, scraper: mockScraper };
    const tools = createChatTools(context);
    const tool = tools.find((t: { name: string }) => t.name === "list_index_intents") as { invoke: (args: { indexNameOrId: string; limit?: number; offset?: number }) => Promise<string> };
    await tool.invoke({ indexNameOrId: ownedIndexId, limit: 10, offset: 5 });
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.limit).toBe(10);
    expect(capturedOptions?.offset).toBe(5);
  });
});
