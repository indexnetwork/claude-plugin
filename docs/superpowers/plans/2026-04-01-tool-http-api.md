# Tool HTTP API + CLI Commands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all ChatAgent tools as HTTP endpoints at `POST /api/tools/:toolName` and wire CLI commands to call them.

**Architecture:** Extract tool handlers from their LangChain `tool()` wrappers into a registry (`Map<string, { schema, handler }>`), build a single `ToolController` that resolves auth context and dispatches to handlers by name, then add a `callTool()` method to the CLI's `ApiClient` and new CLI commands on top.

**Tech Stack:** Bun, Express-style decorators (`@Controller`, `@Post`, `@UseGuards`), Zod, existing graph factories and adapters.

---

## File Structure

### Protocol (backend)

- **Create:** `protocol/src/lib/protocol/tools/tool.registry.ts` — Extracts raw tool handlers into a `ToolRegistry` map (name → { schema, handler }). Shared by both `createChatTools()` and `ToolController`.
- **Modify:** `protocol/src/lib/protocol/tools/tool.helpers.ts` — Add `RawToolDefinition` type for registry entries.
- **Modify:** `protocol/src/lib/protocol/tools/index.ts` — Refactor `createChatTools()` to use the registry internally, no behavior change.
- **Create:** `protocol/src/services/tool.service.ts` — Service that owns graph compilation, tool registry creation, and context resolution. Called by the controller.
- **Create:** `protocol/src/controllers/tool.controller.ts` — Single `POST /api/tools/:toolName` endpoint.
- **Modify:** `protocol/src/main.ts` — Register `ToolController`.
- **Create:** `protocol/tests/tool.controller.spec.ts` — Integration test for the tool HTTP API.

### CLI

- **Modify:** `cli/src/api.client.ts` — Add `callTool(name, query)` method.
- **Modify:** `cli/src/types.ts` — Add `ToolResult` type.
- **Modify:** `cli/src/args.parser.ts` — Add `contact`, `scrape` commands; add `update`, `link`, `unlink`, `links`, `discover` subcommands; add `--json` flag.
- **Create:** `cli/src/contact.command.ts` — Contact command handler.
- **Modify:** `cli/src/intent.command.ts` — Add `update`, `link`, `unlink`, `links` subcommands.
- **Modify:** `cli/src/opportunity.command.ts` — Add `discover` subcommand.
- **Modify:** `cli/src/profile.command.ts` — Add `search` subcommand.
- **Create:** `cli/src/scrape.command.ts` — Scrape command handler.
- **Modify:** `cli/src/main.ts` — Wire new commands, pass `--json` flag.
- **Modify:** `cli/src/output/formatters.ts` — Add `contactTable` formatter.

---

### Task 1: Extract Tool Registry Types

**Files:**
- Modify: `protocol/src/lib/protocol/tools/tool.helpers.ts:210-217`

- [ ] **Step 1: Add RawToolDefinition type**

Add below the existing `DefineTool` type in `tool.helpers.ts`:

```typescript
/**
 * A raw tool definition before LangChain wrapping.
 * Used by the tool registry for direct HTTP invocation.
 */
export interface RawToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  handler: (input: { context: ResolvedToolContext; query: unknown }) => Promise<string>;
}

/**
 * Registry mapping tool names to their raw definitions.
 */
export type ToolRegistry = Map<string, RawToolDefinition>;
```

- [ ] **Step 2: Verify types compile**

Run: `cd protocol && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `RawToolDefinition` or `ToolRegistry`.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/tools/tool.helpers.ts
git commit -m "$(cat <<'EOF'
feat: add RawToolDefinition and ToolRegistry types for HTTP tool access
EOF
)"
```

---

### Task 2: Create Tool Registry

**Files:**
- Create: `protocol/src/lib/protocol/tools/tool.registry.ts`

- [ ] **Step 1: Create the registry module**

This module provides `createToolRegistry()` which creates all tool handlers and returns them in a `ToolRegistry` map. It uses a custom `defineTool` that captures the raw handler instead of wrapping in LangChain's `tool()`.

```typescript
import type { ResolvedToolContext, ToolDeps, RawToolDefinition, ToolRegistry } from './tool.helpers';
import { createProfileTools } from './profile.tools';
import { createIntentTools } from './intent.tools';
import { createIndexTools } from './index.tools';
import { createOpportunityTools } from './opportunity.tools';
import { createUtilityTools } from './utility.tools';
import { createIntegrationTools } from './integration.tools';
import { createContactTools } from './contact.tools';
import { protocolLogger } from '../support/protocol.logger';
import { error } from './tool.helpers';
import { z } from 'zod';

const logger = protocolLogger('ToolRegistry');

/**
 * Creates a tool registry containing all tool handlers indexed by name.
 * Handlers are raw async functions (not LangChain tool() wrappers) that
 * accept { context, query } and return a JSON string.
 *
 * @param deps - Shared tool dependencies (graphs, database, embedder, etc.)
 * @param context - Resolved user context for this request.
 * @returns Map of tool name → { schema, handler }.
 */
export function createToolRegistry(deps: ToolDeps, context: ResolvedToolContext): ToolRegistry {
  const registry: ToolRegistry = new Map();

  // defineTool that captures raw handlers into the registry
  function defineTool<T extends z.ZodType>(opts: {
    name: string;
    description: string;
    querySchema: T;
    handler: (input: { context: ResolvedToolContext; query: z.infer<T> }) => Promise<string>;
  }) {
    registry.set(opts.name, {
      name: opts.name,
      description: opts.description,
      schema: opts.querySchema,
      handler: async (input: { context: ResolvedToolContext; query: unknown }) => {
        logger.verbose(`Tool: ${opts.name}`, {
          context: { userId: input.context.userId, indexId: input.context.indexId },
          query: input.query,
        });
        try {
          return await opts.handler({ context: input.context, query: input.query as z.infer<T> });
        } catch (err) {
          logger.error(`${opts.name} failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
          return error(`Failed to execute ${opts.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });

    // Return a dummy value — the create*Tools functions expect defineTool to return something
    // (they collect return values into arrays), but for the registry path we don't need LangChain tools.
    return { name: opts.name } as ReturnType<typeof import('@langchain/core/tools').tool>;
  }

  // Create all tool domains — each one calls defineTool() which populates the registry
  createProfileTools(defineTool as any, deps);
  createIntentTools(defineTool as any, deps);
  createIndexTools(defineTool as any, deps);
  createOpportunityTools(defineTool as any, deps);
  createUtilityTools(defineTool as any, deps);
  createIntegrationTools(defineTool as any, deps);
  createContactTools(defineTool as any, deps);

  logger.verbose(`Tool registry created with ${registry.size} tools`);
  return registry;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd protocol && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/tools/tool.registry.ts
git commit -m "$(cat <<'EOF'
feat: create tool registry for direct HTTP tool invocation
EOF
)"
```

---

### Task 3: Create Tool Service

**Files:**
- Create: `protocol/src/services/tool.service.ts`

The service owns graph compilation, tool deps assembly, and context resolution. The controller calls this — it never touches adapters directly.

- [ ] **Step 1: Create the service**

```typescript
import { z } from 'zod';

import {
  chatDatabaseAdapter,
  createUserDatabase,
  createSystemDatabase,
} from '../adapters/database.adapter';
import { EmbedderAdapter } from '../adapters/embedder.adapter';
import { ScraperAdapter } from '../adapters/scraper.adapter';
import { RedisCacheAdapter } from '../adapters/cache.adapter';
import { ComposioIntegrationAdapter } from '../adapters/integration.adapter';

import { IntentGraphFactory } from '../lib/protocol/graphs/intent.graph';
import { ProfileGraphFactory } from '../lib/protocol/graphs/profile.graph';
import { OpportunityGraphFactory } from '../lib/protocol/graphs/opportunity.graph';
import { HydeGraphFactory } from '../lib/protocol/graphs/hyde.graph';
import { IndexGraphFactory } from '../lib/protocol/graphs/index.graph';
import { IndexMembershipGraphFactory } from '../lib/protocol/graphs/index_membership.graph';
import { IntentIndexGraphFactory } from '../lib/protocol/graphs/intent_index.graph';
import { NegotiationGraphFactory } from '../lib/protocol/graphs/negotiation.graph';
import { HydeGenerator } from '../lib/protocol/agents/hyde.generator';
import { LensInferrer } from '../lib/protocol/agents/lens.inferrer';
import { NegotiationProposer } from '../lib/protocol/agents/negotiation.proposer';
import { NegotiationResponder } from '../lib/protocol/agents/negotiation.responder';
import type { HydeGraphDatabase } from '../lib/protocol/interfaces/database.interface';
import { intentQueue } from '../queues/intent.queue';
import { conversationDatabaseAdapter } from '../adapters/database.adapter';

import type { ToolDeps, ToolRegistry } from '../lib/protocol/tools/tool.helpers';
import { resolveChatContext } from '../lib/protocol/tools/tool.helpers';
import { createToolRegistry } from '../lib/protocol/tools/tool.registry';
import { log } from '../lib/log';

const logger = log.service.from('tool');

/**
 * Service that manages tool HTTP invocation.
 * Compiles graphs once, creates per-request context and registry.
 */
class ToolService {
  private database = chatDatabaseAdapter;
  private embedder = new EmbedderAdapter();
  private scraper = new ScraperAdapter();

  /**
   * Invoke a tool by name for a given user.
   *
   * @param userId - Authenticated user ID.
   * @param toolName - Tool name (e.g. 'read_intents', 'create_intent').
   * @param query - Tool-specific query object matching the tool's Zod schema.
   * @returns Parsed JSON result from the tool handler.
   */
  async invokeTool(
    userId: string,
    toolName: string,
    query: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string; [key: string]: unknown }> {
    // 1. Resolve user context
    const context = await resolveChatContext({
      database: this.database,
      userId,
    });

    // 2. Compile graphs and assemble deps
    const deps = this.createToolDeps(context);

    // 3. Build registry
    const registry = createToolRegistry(deps, context);

    // 4. Look up tool
    const tool = registry.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    // 5. Validate query against schema
    const parsed = tool.schema.safeParse(query);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      };
    }

    // 6. Execute handler
    const resultStr = await tool.handler({ context, query: parsed.data });

    // 7. Parse JSON string result
    try {
      return JSON.parse(resultStr);
    } catch {
      return { success: true, data: resultStr };
    }
  }

  /**
   * List all available tool names with descriptions and schemas.
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    // Create a minimal context just to enumerate tools
    // We use a dummy registry creation with no real context
    const deps = this.createToolDepsWithoutContext();
    const dummyContext = {
      userId: '',
      userName: '',
      userEmail: '',
      user: {} as any,
      userProfile: null,
      userIndexes: [],
      isOnboarding: false,
      hasName: false,
    };
    const registry = createToolRegistry(deps, dummyContext);
    return Array.from(registry.values()).map(t => ({
      name: t.name,
      description: t.description,
    }));
  }

  private createToolDeps(context: Awaited<ReturnType<typeof resolveChatContext>>): ToolDeps {
    const indexScope = context.userIndexes.map(m => m.indexId);
    const userDb = createUserDatabase(this.database as Parameters<typeof createUserDatabase>[0], context.userId);
    const systemDb = createSystemDatabase(this.database as Parameters<typeof createSystemDatabase>[0], context.userId, indexScope, this.embedder);

    return {
      database: this.database,
      userDb,
      systemDb,
      scraper: this.scraper,
      embedder: this.embedder,
      cache: new RedisCacheAdapter(),
      integration: new ComposioIntegrationAdapter(),
      graphs: this.compileGraphs(),
    };
  }

  private createToolDepsWithoutContext(): ToolDeps {
    return {
      database: this.database,
      userDb: {} as any,
      systemDb: {} as any,
      scraper: this.scraper,
      embedder: this.embedder,
      cache: new RedisCacheAdapter(),
      integration: new ComposioIntegrationAdapter(),
      graphs: this.compileGraphs(),
    };
  }

  private compileGraphs(): ToolDeps['graphs'] {
    const intentGraph = new IntentGraphFactory(this.database, this.embedder, intentQueue).createGraph();
    const profileGraph = new ProfileGraphFactory(this.database, this.embedder, this.scraper).createGraph();
    const hydeCache = new RedisCacheAdapter();
    const lensInferrer = new LensInferrer();
    const hydeGenerator = new HydeGenerator();
    const compiledHydeGraph = new HydeGraphFactory(
      this.database as unknown as HydeGraphDatabase,
      this.embedder,
      hydeCache,
      lensInferrer,
      hydeGenerator,
    ).createGraph();
    const negotiationGraph = new NegotiationGraphFactory(
      conversationDatabaseAdapter,
      new NegotiationProposer(),
      new NegotiationResponder(),
    ).createGraph();
    const opportunityGraph = new OpportunityGraphFactory(
      this.database,
      this.embedder,
      compiledHydeGraph,
      undefined,
      undefined,
      negotiationGraph,
    ).createGraph();
    const indexGraph = new IndexGraphFactory(this.database).createGraph();
    const indexMembershipGraph = new IndexMembershipGraphFactory(this.database).createGraph();
    const intentIndexGraph = new IntentIndexGraphFactory(this.database).createGraph();

    return {
      profile: profileGraph,
      intent: intentGraph,
      index: indexGraph,
      indexMembership: indexMembershipGraph,
      intentIndex: intentIndexGraph,
      opportunity: opportunityGraph,
    };
  }
}

export const toolService = new ToolService();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd protocol && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors. Some adapter imports may need path adjustments — fix any import errors.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/services/tool.service.ts
git commit -m "$(cat <<'EOF'
feat: add ToolService for HTTP tool invocation
EOF
)"
```

---

### Task 4: Create Tool Controller

**Files:**
- Create: `protocol/src/controllers/tool.controller.ts`

- [ ] **Step 1: Create the controller**

```typescript
import { z } from 'zod';

import { Controller, Post, Get, UseGuards } from '../lib/router/router.decorators';
import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';
import { toolService } from '../services/tool.service';
import { log } from '../lib/log';

const logger = log.controller.from('tool');

const InvokeSchema = z.object({
  query: z.record(z.unknown()).default({}),
});

@Controller('/tools')
export class ToolController {
  /**
   * Invoke a tool by name.
   * Body: { query: { ...tool-specific params } }
   */
  @Post('/:toolName')
  @UseGuards(AuthGuard)
  async invoke(req: Request, user: AuthenticatedUser, params: { toolName: string }) {
    const { toolName } = params;
    logger.verbose('Tool invoke', { userId: user.id, toolName });

    const raw = await req.json().catch(() => ({}));
    const parsed = InvokeSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    try {
      const result = await toolService.invokeTool(user.id, toolName, parsed.data.query);

      if (!result.success) {
        return Response.json(result, { status: 400 });
      }

      return Response.json(result);
    } catch (err) {
      logger.error('Tool invoke failed', { toolName, userId: user.id, error: err });

      if (err instanceof Error && 'statusCode' in err) {
        return Response.json(
          { success: false, error: err.message },
          { status: (err as { statusCode: number }).statusCode },
        );
      }

      return Response.json(
        { success: false, error: 'Internal server error' },
        { status: 500 },
      );
    }
  }

  /**
   * List all available tools with descriptions.
   */
  @Get('/')
  @UseGuards(AuthGuard)
  async list(_req: Request, _user: AuthenticatedUser) {
    const tools = await toolService.listTools();
    return Response.json({ tools });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd protocol && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/controllers/tool.controller.ts
git commit -m "$(cat <<'EOF'
feat: add ToolController for POST /api/tools/:toolName
EOF
)"
```

---

### Task 5: Register Tool Controller in Main

**Files:**
- Modify: `protocol/src/main.ts`

- [ ] **Step 1: Add import and registration**

Add the import alongside other controller imports:

```typescript
import { ToolController } from './controllers/tool.controller';
```

Add to the `controllerInstances` map (after existing registrations):

```typescript
controllerInstances.set(ToolController, new ToolController());
```

- [ ] **Step 2: Verify server starts**

Run: `cd protocol && bun run dev`
Expected: Server starts on port 3001 without errors. Check logs for "Tool" controller registration.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/main.ts
git commit -m "$(cat <<'EOF'
feat: register ToolController in server startup
EOF
)"
```

---

### Task 6: Integration Test for Tool Controller

**Files:**
- Create: `protocol/tests/tool.controller.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

import { config } from 'dotenv';
config({ path: '.env' });

import { ToolController } from '../src/controllers/tool.controller';
import type { AuthenticatedUser } from '../src/guards/auth.guard';
import { userService } from '../src/services/user.service';

describe('ToolController Integration', () => {
  let controller: ToolController;
  let testUserId: string;
  const testEmail = 'test-tool-controller@example.com';

  beforeAll(async () => {
    const existing = await userService.findByEmail(testEmail);
    if (existing) {
      await userService.deleteById(existing.id);
    }

    const user = await userService.createTestUser({
      email: testEmail,
      name: 'Tool Test User',
    });
    testUserId = user.id;
    controller = new ToolController();
  }, 30000);

  afterAll(async () => {
    if (testUserId) {
      await userService.deleteById(testUserId);
    }
  });

  test('GET /tools should list available tools', async () => {
    const mockUser: AuthenticatedUser = { id: testUserId, email: testEmail, name: 'Tool Test User' };
    const response = await controller.list({} as Request, mockUser);
    const body = await response.json() as { tools: Array<{ name: string; description: string }> };

    expect(body.tools).toBeArray();
    expect(body.tools.length).toBeGreaterThan(0);

    const toolNames = body.tools.map(t => t.name);
    expect(toolNames).toContain('read_intents');
    expect(toolNames).toContain('list_contacts');
    expect(toolNames).toContain('scrape_url');
  }, 30000);

  test('POST /tools/read_intents should return intents', async () => {
    const mockUser: AuthenticatedUser = { id: testUserId, email: testEmail, name: 'Tool Test User' };
    const mockRequest = new Request('http://localhost/api/tools/read_intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: {} }),
    });

    const response = await controller.invoke(mockRequest, mockUser, { toolName: 'read_intents' });
    const body = await response.json() as { success: boolean; data?: unknown; error?: string };

    expect(body.success).toBe(true);
  }, 60000);

  test('POST /tools/unknown_tool should return error', async () => {
    const mockUser: AuthenticatedUser = { id: testUserId, email: testEmail, name: 'Tool Test User' };
    const mockRequest = new Request('http://localhost/api/tools/unknown_tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: {} }),
    });

    const response = await controller.invoke(mockRequest, mockUser, { toolName: 'unknown_tool' });
    const body = await response.json() as { success: boolean; error?: string };

    expect(body.success).toBe(false);
    expect(body.error).toContain('Unknown tool');
  }, 10000);
}, 120000);
```

- [ ] **Step 2: Run test**

Run: `cd protocol && bun test tests/tool.controller.spec.ts`
Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add protocol/tests/tool.controller.spec.ts
git commit -m "$(cat <<'EOF'
test: add integration tests for ToolController
EOF
)"
```

---

### Task 7: CLI `callTool` Method and Types

**Files:**
- Modify: `cli/src/types.ts`
- Modify: `cli/src/api.client.ts`

- [ ] **Step 1: Add ToolResult type to types.ts**

Add at the end of `cli/src/types.ts`:

```typescript
/** Generic result from POST /api/tools/:toolName. */
export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Add callTool to ApiClient**

Add the import of `ToolResult` to `api.client.ts` and add this method to the `ApiClient` class:

```typescript
/**
 * Invoke a tool by name via the HTTP tool API.
 *
 * @param toolName - Tool name (e.g. 'read_intents', 'create_intent').
 * @param query - Tool-specific query parameters.
 * @returns Parsed tool result.
 * @throws Error on auth failure or network error.
 */
async callTool(toolName: string, query: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await this.post(`/api/tools/${toolName}`, { query });
  return (await res.json()) as ToolResult;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd cli && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add cli/src/types.ts cli/src/api.client.ts
git commit -m "$(cat <<'EOF'
feat(cli): add callTool method to ApiClient for tool HTTP API
EOF
)"
```

---

### Task 8: Add `--json` Global Flag

**Files:**
- Modify: `cli/src/args.parser.ts`
- Modify: `cli/src/main.ts`

- [ ] **Step 1: Add json flag to ParsedCommand interface**

Add to the `ParsedCommand` interface in `args.parser.ts`:

```typescript
/** Output raw JSON instead of formatted text. */
json?: boolean;
```

- [ ] **Step 2: Parse --json flag**

In the `parseArgs` function's while loop, add a case before the `arg.startsWith("--")` fallback:

```typescript
} else if (arg === "--json") {
  result.json = true;
  i++;
}
```

- [ ] **Step 3: Pass json flag through main.ts**

In `main.ts`, pass `args.json` to all command handlers. Each handler will check this flag and output JSON when set. For now, just ensure the flag is parsed — individual commands will use it in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add cli/src/args.parser.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add --json global flag for machine-readable output
EOF
)"
```

---

### Task 9: CLI Contact Command

**Files:**
- Create: `cli/src/contact.command.ts`
- Modify: `cli/src/main.ts`
- Modify: `cli/src/args.parser.ts`
- Modify: `cli/src/output/formatters.ts`
- Modify: `cli/src/output/index.ts`

- [ ] **Step 1: Add contact to known commands in args.parser.ts**

Add `"contact"` to `KNOWN_COMMANDS` set and the `ParsedCommand.command` union type.

Add a `CONTACT_SUBCOMMANDS` set:

```typescript
const CONTACT_SUBCOMMANDS = new Set(["list", "add", "remove", "import"]);
```

Add contact parsing after the network command block:

```typescript
if (result.command === "contact") {
  if (positionals.length > 0 && CONTACT_SUBCOMMANDS.has(positionals[0])) {
    result.subcommand = positionals[0] as ParsedCommand["subcommand"];
    result.positionals = positionals.slice(1);
  }
}
```

Add `"add"`, `"remove"`, `"import"`, `"update"`, `"link"`, `"unlink"`, `"links"`, `"discover"`, `"search"` to the `subcommand` union type.

- [ ] **Step 2: Create contact.command.ts**

```typescript
/**
 * Contact command handlers for the Index CLI.
 * Implements: list, add, remove, import subcommands.
 */
import type { ApiClient } from './api.client';
import * as output from './output';

const CONTACT_HELP = `
Usage:
  index contact list                       List your contacts
  index contact add <email> [--name <n>]   Add a contact by email
  index contact remove <email>             Remove a contact
  index contact import --gmail             Import contacts from Gmail
`;

/**
 * Route a contact subcommand to the appropriate handler.
 */
export async function handleContact(
  client: ApiClient,
  subcommand: string | undefined,
  positionals: string[],
  options: { json?: boolean; name?: string; gmail?: boolean },
): Promise<void> {
  if (!subcommand) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No subcommand provided' }));
    } else {
      console.log(CONTACT_HELP);
    }
    return;
  }

  switch (subcommand) {
    case 'list': {
      const result = await client.callTool('list_contacts', {});
      if (options.json) {
        console.log(JSON.stringify(result));
        return;
      }
      if (!result.success) {
        output.error(result.error ?? 'Failed to list contacts', 1);
        return;
      }
      const data = result.data as { count: number; contacts: Array<{ userId: string; name: string; email: string; isGhost: boolean }> };
      output.heading('Contacts');
      output.contactTable(data.contacts);
      output.dim(`\n  ${data.count} contact${data.count !== 1 ? 's' : ''}`);
      console.log();
      return;
    }

    case 'add': {
      const email = positionals[0];
      if (!email) {
        output.error('Missing email. Usage: index contact add <email>', 1);
        return;
      }
      const result = await client.callTool('add_contact', { email, name: options.name });
      if (options.json) {
        console.log(JSON.stringify(result));
        return;
      }
      if (!result.success) {
        output.error(result.error ?? 'Failed to add contact', 1);
        return;
      }
      const data = result.data as { message: string };
      output.success(data.message);
      return;
    }

    case 'remove': {
      const email = positionals[0];
      if (!email) {
        output.error('Missing email. Usage: index contact remove <email>', 1);
        return;
      }
      // First list contacts to resolve email → userId
      const listResult = await client.callTool('list_contacts', {});
      if (!listResult.success) {
        output.error('Failed to resolve contact', 1);
        return;
      }
      const contacts = (listResult.data as { contacts: Array<{ userId: string; email: string }> }).contacts;
      const match = contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (!match) {
        output.error(`No contact found with email: ${email}`, 1);
        return;
      }
      const result = await client.callTool('remove_contact', { contactUserId: match.userId });
      if (options.json) {
        console.log(JSON.stringify(result));
        return;
      }
      if (!result.success) {
        output.error(result.error ?? 'Failed to remove contact', 1);
        return;
      }
      output.success(`Removed ${email} from contacts.`);
      return;
    }

    case 'import': {
      if (options.gmail) {
        const result = await client.callTool('import_gmail_contacts', {});
        if (options.json) {
          console.log(JSON.stringify(result));
          return;
        }
        if (!result.success) {
          output.error(result.error ?? 'Failed to import Gmail contacts', 1);
          return;
        }
        const data = result.data as { message: string };
        output.success(data.message);
      } else {
        output.error('Specify import source: --gmail', 1);
      }
      return;
    }
  }
}
```

- [ ] **Step 3: Add contactTable formatter to output/formatters.ts**

```typescript
export function contactTable(contacts: Array<{ userId: string; name: string; email: string; isGhost?: boolean }>): void {
  if (contacts.length === 0) {
    console.log('  No contacts yet.');
    return;
  }

  const nameWidth = Math.max(6, ...contacts.map(c => c.name.length));
  const header = `  ${padTo('Name', nameWidth)}  Email`;
  console.log(`${BOLD}${header}${RESET}`);

  for (const c of contacts) {
    const ghost = c.isGhost ? ` ${DIM}(ghost)${RESET}` : '';
    console.log(`  ${padTo(c.name, nameWidth)}  ${c.email}${ghost}`);
  }
}
```

Export `contactTable` from `output/index.ts`.

- [ ] **Step 4: Wire contact command in main.ts**

Import `handleContact` and add the case in the switch:

```typescript
case "contact":
  await handleContact(client, args.subcommand, args.positionals ?? [], {
    json: args.json,
    name: args.name,
    gmail: args.gmail,
  });
  return;
```

Add `--name` and `--gmail` flag parsing to `args.parser.ts`.

- [ ] **Step 5: Update HELP_TEXT**

Add contact commands to the help text in `main.ts`.

- [ ] **Step 6: Commit**

```bash
git add cli/src/contact.command.ts cli/src/args.parser.ts cli/src/main.ts cli/src/output/formatters.ts cli/src/output/index.ts
git commit -m "$(cat <<'EOF'
feat(cli): add contact command (list, add, remove, import)
EOF
)"
```

---

### Task 10: CLI Intent Subcommands (update, link, unlink, links)

**Files:**
- Modify: `cli/src/intent.command.ts`
- Modify: `cli/src/args.parser.ts`

- [ ] **Step 1: Update args parser for new intent subcommands**

Add `"update"`, `"link"`, `"unlink"`, `"links"` to `INTENT_SUBCOMMANDS` set.

Update `parseIntentArgs` to handle the new subcommands:

```typescript
case "update":
  result.intentId = rest[0];
  if (rest.length > 1) {
    result.intentContent = rest.slice(1).join(" ");
  }
  break;
case "link":
case "unlink":
  result.intentId = rest[0];
  result.targetId = rest[1]; // networkId
  break;
case "links":
  result.intentId = rest[0];
  break;
```

- [ ] **Step 2: Add handler cases to intent.command.ts**

Add to the `handleIntent` function, passing the `ApiClient` and new options. The function signature needs `json` option:

```typescript
case "update": {
  if (!options.intentId || !options.intentContent) {
    output.error("Usage: index intent update <id> <content>", 1);
    return;
  }
  output.info("Updating signal...");
  const result = await client.callTool("update_intent", {
    intentId: options.intentId,
    newDescription: options.intentContent,
  });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to update signal", 1);
    return;
  }
  output.success("Signal updated.");
  return;
}

case "link": {
  if (!options.intentId || !options.targetId) {
    output.error("Usage: index intent link <intentId> <networkId>", 1);
    return;
  }
  const result = await client.callTool("create_intent_index", {
    intentId: options.intentId,
    indexId: options.targetId,
  });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to link", 1);
    return;
  }
  output.success("Signal linked to network.");
  return;
}

case "unlink": {
  if (!options.intentId || !options.targetId) {
    output.error("Usage: index intent unlink <intentId> <networkId>", 1);
    return;
  }
  const result = await client.callTool("delete_intent_index", {
    intentId: options.intentId,
    indexId: options.targetId,
  });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to unlink", 1);
    return;
  }
  output.success("Signal unlinked from network.");
  return;
}

case "links": {
  if (!options.intentId) {
    output.error("Usage: index intent links <intentId>", 1);
    return;
  }
  const result = await client.callTool("read_intent_indexes", {
    intentId: options.intentId,
  });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to list links", 1);
    return;
  }
  const data = result.data as { intentIndexes?: Array<{ indexId: string; indexTitle: string; relevancyScore?: number }> };
  output.heading("Linked Networks");
  if (!data.intentIndexes?.length) {
    output.dim("  No linked networks.");
  } else {
    for (const link of data.intentIndexes) {
      const score = link.relevancyScore != null ? ` (${Math.round(link.relevancyScore * 100)}%)` : "";
      console.log(`  ${link.indexTitle}${score}`);
    }
  }
  console.log();
  return;
}
```

- [ ] **Step 3: Update intent help text**

```typescript
const INTENT_HELP = `
Usage:
  index intent list [--archived] [--limit <n>]       List your signals
  index intent show <id>                             Show signal details
  index intent create <content>                      Create a signal from text
  index intent update <id> <content>                 Update a signal
  index intent archive <id>                          Archive a signal
  index intent link <intentId> <networkId>           Link signal to network
  index intent unlink <intentId> <networkId>         Unlink signal from network
  index intent links <intentId>                      List linked networks
`;
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/intent.command.ts cli/src/args.parser.ts
git commit -m "$(cat <<'EOF'
feat(cli): add intent update, link, unlink, links subcommands
EOF
)"
```

---

### Task 11: CLI Opportunity Discover Subcommand

**Files:**
- Modify: `cli/src/opportunity.command.ts`
- Modify: `cli/src/args.parser.ts`

- [ ] **Step 1: Add discover to opportunity subcommands**

Add `"discover"` to `OPPORTUNITY_SUBCOMMANDS` in `args.parser.ts`.

Add `--target` and `--introduce` flag parsing:

```typescript
} else if (arg === "--target") {
  result.target = args[i + 1];
  i += 2;
} else if (arg === "--introduce") {
  result.introduce = args[i + 1];
  i += 2;
}
```

Add `target?: string` and `introduce?: string` to `ParsedCommand`.

- [ ] **Step 2: Add discover case in opportunity.command.ts**

```typescript
case "discover": {
  const query = options.positionals?.join(" ");
  if (!query && !options.introduce) {
    output.error("Usage: index opportunity discover <query>", 1);
    return;
  }
  output.info("Discovering opportunities...");
  const toolQuery: Record<string, unknown> = {};
  if (options.introduce) {
    // Introduction mode: --introduce <userId1> with second positional as userId2
    toolQuery.mode = 'introduction';
    toolQuery.sourceUserId = options.introduce;
    toolQuery.targetUserId = options.positionals?.[0];
  } else if (options.target) {
    toolQuery.mode = 'direct';
    toolQuery.targetUserId = options.target;
    toolQuery.searchQuery = query;
  } else {
    toolQuery.searchQuery = query;
  }
  const result = await client.callTool("create_opportunities", toolQuery);
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Discovery failed", 1);
    return;
  }
  output.success("Discovery complete.");
  const data = result.data as { message?: string };
  if (data?.message) {
    output.dim(`  ${data.message}`);
  }
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add cli/src/opportunity.command.ts cli/src/args.parser.ts
git commit -m "$(cat <<'EOF'
feat(cli): add opportunity discover subcommand
EOF
)"
```

---

### Task 12: CLI Profile Search and Scrape Commands

**Files:**
- Modify: `cli/src/profile.command.ts`
- Create: `cli/src/scrape.command.ts`
- Modify: `cli/src/args.parser.ts`
- Modify: `cli/src/main.ts`

- [ ] **Step 1: Add search subcommand to profile.command.ts**

Add a `"search"` case to the profile handler:

```typescript
case "search": {
  const query = positionals.slice(1).join(" ") || positionals[0];
  if (!query) {
    output.error("Usage: index profile search <query>", 1);
    return;
  }
  const result = await client.callTool("read_user_profiles", { query });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Search failed", 1);
    return;
  }
  const data = result.data as { profiles: Array<{ userId: string; name: string; profile?: { bio: string; skills: string[] } }> };
  output.heading("Search Results");
  if (!data.profiles?.length) {
    output.dim("  No profiles found.");
  } else {
    for (const p of data.profiles) {
      console.log(`  ${p.name} (${p.userId.slice(0, 8)})`);
      if (p.profile?.bio) {
        output.dim(`    ${p.profile.bio.slice(0, 100)}`);
      }
    }
  }
  console.log();
  return;
}
```

- [ ] **Step 2: Create scrape.command.ts**

```typescript
/**
 * Scrape command handler for the Index CLI.
 */
import type { ApiClient } from './api.client';
import * as output from './output';

/**
 * Scrape a URL and display extracted content.
 */
export async function handleScrape(
  client: ApiClient,
  positionals: string[],
  options: { json?: boolean; objective?: string },
): Promise<void> {
  const url = positionals[0];
  if (!url) {
    output.error('Usage: index scrape <url> [--objective <text>]', 1);
    return;
  }

  output.info(`Scraping ${url}...`);
  const result = await client.callTool('scrape_url', {
    url,
    objective: options.objective,
  });

  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }

  if (!result.success) {
    output.error(result.error ?? 'Scrape failed', 1);
    return;
  }

  const data = result.data as { url: string; contentLength: number; content: string };
  output.heading(`Content from ${data.url}`);
  console.log(data.content);
  output.dim(`\n  ${data.contentLength} characters extracted`);
  console.log();
}
```

- [ ] **Step 3: Wire in args parser and main.ts**

Add `"scrape"` to `KNOWN_COMMANDS` and `ParsedCommand.command` union.

Add `--objective` flag parsing.

In `main.ts`, add:

```typescript
import { handleScrape } from './scrape.command';

// In the switch:
case "scrape":
  await handleScrape(client, args.positionals ?? [], {
    json: args.json,
    objective: args.objective,
  });
  return;
```

- [ ] **Step 4: Update HELP_TEXT**

Add profile search and scrape commands.

- [ ] **Step 5: Commit**

```bash
git add cli/src/profile.command.ts cli/src/scrape.command.ts cli/src/args.parser.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add profile search and scrape commands
EOF
)"
```

---

### Task 13: Final Type Check and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full type check on protocol**

Run: `cd protocol && npx tsc --noEmit --pretty`
Expected: No errors. Fix any that appear.

- [ ] **Step 2: Run full type check on CLI**

Run: `cd cli && npx tsc --noEmit --pretty`
Expected: No errors. Fix any that appear.

- [ ] **Step 3: Run protocol tests**

Run: `cd protocol && bun test tests/tool.controller.spec.ts`
Expected: All tests pass.

- [ ] **Step 4: Run lint**

Run: `cd protocol && bun run lint && cd ../cli && bun run lint`
Expected: No lint errors.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: fix type errors and lint issues from tool HTTP API implementation
EOF
)"
```
