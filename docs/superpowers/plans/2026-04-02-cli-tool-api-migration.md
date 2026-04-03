# CLI Tool API Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate CLI create/update commands from direct REST endpoints to the Tool HTTP API, making the CLI consistent: Tools for all writes, REST for reads and deletes only.

**Architecture:** Five CLI commands currently call REST endpoints for write operations (`intent create`, `intent archive`, `opportunity accept/reject`, `profile sync`). Each is migrated to call `client.callTool()` with the corresponding ChatAgent tool. The `POST /api/intents/process` controller endpoint is removed since it has no other callers. Short ID resolution (for `intent archive` and `opportunity accept/reject`) is handled by first calling the existing REST read endpoint, then passing the full UUID to the tool.

**Tech Stack:** TypeScript, Bun test runner, Tool HTTP API (`POST /api/tools/:toolName`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `cli/src/intent.command.ts` | Modify | Migrate `create` and `archive` from REST to tools |
| `cli/src/opportunity.command.ts` | Modify | Migrate `accept`/`reject` from REST to tool |
| `cli/src/profile.command.ts` | Modify | Migrate `sync` from REST to tools |
| `cli/src/api.client.ts` | Modify | Remove `processIntent`, `archiveIntent`, `updateOpportunityStatus`, `syncProfile` methods |
| `cli/tests/tool-calls.test.ts` | Modify | Add contract tests for new tool calls |
| `protocol/src/controllers/tests/tool.controller.spec.ts` | Modify | Add integration tests for new tool calls |
| `protocol/src/controllers/intent.controller.ts` | Modify | Remove `process` endpoint |
| `cli/tests/api.client.test.ts` | Modify | Remove tests for deleted methods |
| `cli/tests/opportunity.command.test.ts` | Modify | Remove `updateOpportunityStatus` API tests |
| `cli/tests/profile.command.test.ts` | Modify | Remove `syncProfile` API tests |

---

### Task 1: Migrate `intent create` to `create_intent` tool

**Files:**
- Modify: `cli/src/intent.command.ts:81-94`
- Modify: `cli/tests/tool-calls.test.ts`

The `create_intent` tool accepts `{ description: string, indexId?: string }`. The CLI currently calls `client.processIntent(content)` which hits `POST /api/intents/process`.

- [ ] **Step 1: Add failing test in `cli/tests/tool-calls.test.ts`**

Inside the `intent` describe block, add:

```typescript
    it("create calls create_intent with description (CLI: intent create)", async () => {
      mock.setToolResponse("create_intent", { success: true, data: { message: "Intent created" } });

      await handleIntent(client, "create", {
        intentContent: "Looking for a CTO with AI experience",
        json: true,
      });

      expect(mock.toolCalls).toHaveLength(1);
      expect(mock.toolCalls[0].toolName).toBe("create_intent");
      expect(mock.toolCalls[0].query).toEqual({
        description: "Looking for a CTO with AI experience",
      });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: FAIL — `intent create` still calls `processIntent` REST method, not `callTool`.

- [ ] **Step 3: Modify `intent.command.ts` — replace `create` case**

Replace the `case "create"` block (lines 81-94) with:

```typescript
    case "create": {
      if (!options.intentContent) {
        output.error("Missing content. Usage: index intent create <content>", 1);
        return;
      }
      output.info("Processing signal...");
      const result = await client.callTool("create_intent", {
        description: options.intentContent,
      });
      if (options.json) { console.log(JSON.stringify(result)); return; }
      if (!result.success) { output.error(result.error ?? "Failed to create signal", 1); return; }
      output.success("Signal created.");
      const data = result.data as { message?: string };
      if (data?.message) output.dim(`  ${data.message}`);
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/intent.command.ts cli/tests/tool-calls.test.ts
git commit -m "refactor(cli): migrate intent create from REST to create_intent tool"
```

---

### Task 2: Migrate `intent archive` to `delete_intent` tool

**Files:**
- Modify: `cli/src/intent.command.ts:116-125`
- Modify: `cli/tests/tool-calls.test.ts`

The `delete_intent` tool requires a full UUID (`intentId`). The CLI accepts short ID prefixes. To resolve: call `client.getIntent(shortId)` first (REST read — stays), then pass `intent.id` to the tool.

- [ ] **Step 1: Add failing test in `cli/tests/tool-calls.test.ts`**

Inside the `intent` describe block, add:

```typescript
    it("archive calls delete_intent with intentId (CLI: intent archive)", async () => {
      // Mock the REST read endpoint for short ID resolution
      mock.onRest("GET", "/api/intents/abc123", () =>
        Response.json({ intent: { id: "full-uuid-abc123", payload: "test", status: "active" } }),
      );
      mock.setToolResponse("delete_intent", { success: true, data: {} });

      await handleIntent(client, "archive", {
        intentId: "abc123",
        json: true,
      });

      expect(mock.toolCalls).toHaveLength(1);
      expect(mock.toolCalls[0].toolName).toBe("delete_intent");
      expect(mock.toolCalls[0].query).toEqual({ intentId: "full-uuid-abc123" });
    });
```

Note: The `tool-calls.test.ts` mock server already has `onRest` for registering REST handlers. Need to add `handleIntent` to the imports if not already there.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: FAIL — `archive` still calls `client.archiveIntent()`.

- [ ] **Step 3: Modify `intent.command.ts` — replace `archive` case**

Replace the `case "archive"` block (lines 116-125) with:

```typescript
    case "archive": {
      if (!options.intentId) {
        output.error("Missing signal ID. Usage: index intent archive <id>", 1);
        return;
      }
      // Resolve short ID to full UUID via REST read
      const intent = await client.getIntent(options.intentId);
      const result = await client.callTool("delete_intent", { intentId: intent.id });
      if (options.json) { console.log(JSON.stringify(result)); return; }
      if (!result.success) { output.error(result.error ?? "Failed to archive signal", 1); return; }
      output.success(`Signal ${options.intentId} archived.`);
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/intent.command.ts cli/tests/tool-calls.test.ts
git commit -m "refactor(cli): migrate intent archive from REST to delete_intent tool"
```

---

### Task 3: Migrate `opportunity accept/reject` to `update_opportunity` tool

**Files:**
- Modify: `cli/src/opportunity.command.ts:157-167`
- Modify: `cli/tests/tool-calls.test.ts`

The `update_opportunity` tool accepts `{ opportunityId: string, status: "pending"|"accepted"|"rejected"|"expired" }`. The CLI accepts short IDs for opportunities, so resolve via `client.getOpportunity(shortId)` first (REST read — stays).

- [ ] **Step 1: Add failing tests in `cli/tests/tool-calls.test.ts`**

Inside the `opportunity` describe block, add:

```typescript
    it("accept calls update_opportunity with status accepted (CLI: opportunity accept)", async () => {
      mock.onRest("GET", "/api/opportunities/abc", () =>
        Response.json({ id: "full-uuid-abc", status: "pending" }),
      );
      mock.setToolResponse("update_opportunity", { success: true, data: {} });

      await handleOpportunity(client, "accept", {
        targetId: "abc",
        json: true,
      });

      expect(mock.toolCalls).toHaveLength(1);
      expect(mock.toolCalls[0].toolName).toBe("update_opportunity");
      expect(mock.toolCalls[0].query).toEqual({
        opportunityId: "full-uuid-abc",
        status: "accepted",
      });
    });

    it("reject calls update_opportunity with status rejected (CLI: opportunity reject)", async () => {
      mock.onRest("GET", "/api/opportunities/xyz", () =>
        Response.json({ id: "full-uuid-xyz", status: "pending" }),
      );
      mock.setToolResponse("update_opportunity", { success: true, data: {} });

      await handleOpportunity(client, "reject", {
        targetId: "xyz",
        json: true,
      });

      expect(mock.toolCalls).toHaveLength(1);
      expect(mock.toolCalls[0].toolName).toBe("update_opportunity");
      expect(mock.toolCalls[0].query).toEqual({
        opportunityId: "full-uuid-xyz",
        status: "rejected",
      });
    });
```

- [ ] **Step 2: Run test to verify they fail**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: FAIL — `accept`/`reject` still call `client.updateOpportunityStatus()`.

- [ ] **Step 3: Modify `opportunity.command.ts` — replace `opportunityStatusUpdate` function**

Replace the `opportunityStatusUpdate` function (lines 157-167) with:

```typescript
async function opportunityStatusUpdate(
  client: ApiClient,
  id: string,
  status: "accepted" | "rejected",
  json?: boolean,
): Promise<void> {
  // Resolve short ID to full UUID via REST read
  const opportunity = await client.getOpportunity(id);
  const result = await client.callTool("update_opportunity", {
    opportunityId: opportunity.id,
    status,
  });
  if (json) { console.log(JSON.stringify(result)); return; }
  if (!result.success) { output.error(result.error ?? `Failed to ${status === "accepted" ? "accept" : "reject"} opportunity`, 1); return; }
  output.success(`Opportunity ${status === "accepted" ? "accepted" : "rejected"}.`);
}
```

- [ ] **Step 4: Run test to verify they pass**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/opportunity.command.ts cli/tests/tool-calls.test.ts
git commit -m "refactor(cli): migrate opportunity accept/reject from REST to update_opportunity tool"
```

---

### Task 4: Migrate `profile sync` to profile tools

**Files:**
- Modify: `cli/src/profile.command.ts:113-117`
- Modify: `cli/tests/tool-calls.test.ts`

`profile sync` should check if a profile exists via `read_user_profiles`, then call `create_user_profile` (if none) or `update_user_profile` (if exists). The `create_user_profile` tool accepts `{ confirm: true }` to trigger a full profile generation from existing user data.

- [ ] **Step 1: Add failing tests in `cli/tests/tool-calls.test.ts`**

Add a new test inside the `profile` describe block:

```typescript
    it("sync calls create_user_profile when no profile exists (CLI: profile sync)", async () => {
      mock.setToolResponse("read_user_profiles", {
        success: true,
        data: { hasProfile: false },
      });
      mock.setToolResponse("create_user_profile", { success: true, data: {} });

      await handleProfile(client, "sync", [], { json: true });

      const toolNames = mock.toolCalls.map((c) => c.toolName);
      expect(toolNames).toContain("read_user_profiles");
      expect(toolNames).toContain("create_user_profile");
      const createCall = mock.toolCalls.find((c) => c.toolName === "create_user_profile")!;
      expect(createCall.query).toEqual({ confirm: true });
    });

    it("sync calls update_user_profile when profile exists (CLI: profile sync)", async () => {
      mock.setToolResponse("read_user_profiles", {
        success: true,
        data: { hasProfile: true, profile: { name: "Test", bio: "Engineer" } },
      });
      mock.setToolResponse("update_user_profile", { success: true, data: {} });

      await handleProfile(client, "sync", [], { json: true });

      const toolNames = mock.toolCalls.map((c) => c.toolName);
      expect(toolNames).toContain("read_user_profiles");
      expect(toolNames).toContain("update_user_profile");
      const updateCall = mock.toolCalls.find((c) => c.toolName === "update_user_profile")!;
      expect(updateCall.query).toEqual({ action: "regenerate" });
    });
```

- [ ] **Step 2: Run test to verify they fail**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: FAIL — `sync` still calls `client.syncProfile()`.

- [ ] **Step 3: Modify `profile.command.ts` — replace `profileSync` function**

Replace the `profileSync` function (lines 113-117) with:

```typescript
async function profileSync(client: ApiClient, json?: boolean): Promise<void> {
  if (!json) output.info("Regenerating profile...");
  // Check if profile exists
  const check = await client.callTool("read_user_profiles", { userId: "me" });
  const hasProfile = check.success && (check.data as Record<string, unknown>)?.hasProfile;

  let result;
  if (hasProfile) {
    result = await client.callTool("update_user_profile", { action: "regenerate" });
  } else {
    result = await client.callTool("create_user_profile", { confirm: true });
  }

  if (json) { console.log(JSON.stringify(result)); return; }
  if (!result.success) { output.error(result.error ?? "Profile regeneration failed", 1); return; }
  output.success("Profile regeneration triggered. It may take a moment to complete.");
}
```

Also update the caller in `handleProfile` to pass json — change the `if (subcommand === "sync")` block (lines 52-55):

```typescript
  if (subcommand === "sync") {
    await profileSync(client, options.json);
    return;
  }
```

- [ ] **Step 4: Run test to verify they pass**

Run: `cd cli && bun test tests/tool-calls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/profile.command.ts cli/tests/tool-calls.test.ts
git commit -m "refactor(cli): migrate profile sync from REST to create/update profile tools"
```

---

### Task 5: Remove unused REST methods from `api.client.ts`

**Files:**
- Modify: `cli/src/api.client.ts`
- Modify: `cli/tests/api.client.test.ts`
- Modify: `cli/tests/opportunity.command.test.ts`
- Modify: `cli/tests/profile.command.test.ts`

After Tasks 1-4, these `ApiClient` methods are no longer called: `processIntent`, `archiveIntent`, `updateOpportunityStatus`, `syncProfile`.

- [ ] **Step 1: Remove `processIntent` method from `api.client.ts`**

Delete lines 227-230 (the `processIntent` method and its JSDoc).

- [ ] **Step 2: Remove `archiveIntent` method from `api.client.ts`**

Delete lines 232-242 (the `archiveIntent` method and its JSDoc).

- [ ] **Step 3: Remove `updateOpportunityStatus` method from `api.client.ts`**

Delete lines 154-157 (the `updateOpportunityStatus` method and its JSDoc).

- [ ] **Step 4: Remove `syncProfile` method from `api.client.ts`**

Delete lines 110-114 (the `syncProfile` method and its JSDoc).

- [ ] **Step 5: Remove corresponding tests**

In `cli/tests/api.client.test.ts`: Remove the `processIntent` and `archiveIntent` describe blocks.

In `cli/tests/opportunity.command.test.ts`: Remove the `updateOpportunityStatus` describe block.

In `cli/tests/profile.command.test.ts`: Remove the `syncProfile` describe block.

- [ ] **Step 6: Verify all tests pass**

Run: `cd cli && bun test`
Expected: All tests pass (some test count reduction from removed tests).

- [ ] **Step 7: Commit**

```bash
git add cli/src/api.client.ts cli/tests/api.client.test.ts cli/tests/opportunity.command.test.ts cli/tests/profile.command.test.ts
git commit -m "refactor(cli): remove unused REST methods from ApiClient"
```

---

### Task 6: Remove `POST /api/intents/process` from protocol controller

**Files:**
- Modify: `protocol/src/controllers/intent.controller.ts:190-211`
- Modify: `protocol/src/controllers/tests/intent.controller.spec.ts`

This endpoint has no frontend callers — it was CLI-only. The other three REST endpoints (`archive`, `opportunity status`, `profile sync`) are still used by the frontend and stay.

- [ ] **Step 1: Remove `process` method from `intent.controller.ts`**

Delete lines 190-211 (the `process` method, its JSDoc, and decorators). This is the last method in the class, so the closing `}` for the class stays.

- [ ] **Step 2: Remove process-related tests from `intent.controller.spec.ts`**

Remove the three test blocks that test the `process` method:
- `"process should handle explicit intent content"`
- `"process should handle implicit intent (no content)"`
- `"process should work with empty profile"`

- [ ] **Step 3: Run protocol type check**

Run: `cd protocol && bunx tsc --noEmit`
Expected: Clean (no errors referencing `process` method).

- [ ] **Step 4: Run intent controller tests**

Run: `cd protocol && bun test src/controllers/tests/intent.controller.spec.ts`
Expected: PASS (remaining tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add protocol/src/controllers/intent.controller.ts protocol/src/controllers/tests/intent.controller.spec.ts
git commit -m "refactor(protocol): remove POST /api/intents/process endpoint (CLI migrated to tool)"
```

---

### Task 7: Add integration tests for new tool call shapes

**Files:**
- Modify: `protocol/src/controllers/tests/tool.controller.spec.ts`

Add integration tests for the newly migrated tool calls to verify they're accepted by the real tool handlers.

- [ ] **Step 1: Add tests inside the "CLI tool call contracts" describe block**

```typescript
    test("create_intent with description (CLI: intent create)", async () => {
      const { status, data } = await invokeTool("create_intent", {
        description: "Looking for a CTO with AI experience",
      });
      expect(status).toBe(200);
      expect(String(data.error ?? "")).not.toContain("Invalid query");
    }, 60_000);

    test("delete_intent with intentId (CLI: intent archive)", async () => {
      const { status, data } = await invokeTool("delete_intent", {
        intentId: "00000000-0000-0000-0000-000000000000",
      });
      expect(status).toBe(200);
      expect(String(data.error ?? "")).not.toContain("Invalid query");
    }, 60_000);

    test("update_opportunity with opportunityId + status (CLI: opportunity accept)", async () => {
      const { status, data } = await invokeTool("update_opportunity", {
        opportunityId: "00000000-0000-0000-0000-000000000000",
        status: "accepted",
      });
      expect(status).toBe(200);
      expect(String(data.error ?? "")).not.toContain("Invalid query");
    }, 60_000);

    test("create_user_profile with confirm (CLI: profile sync - no profile)", async () => {
      const { status, data } = await invokeTool("create_user_profile", {
        confirm: true,
      });
      expect(status).toBe(200);
      expect(String(data.error ?? "")).not.toContain("Invalid query");
    }, 60_000);

    test("update_user_profile with action (CLI: profile sync - has profile)", async () => {
      const { status, data } = await invokeTool("update_user_profile", {
        action: "regenerate",
      });
      expect(status).toBe(200);
      expect(String(data.error ?? "")).not.toContain("Invalid query");
    }, 60_000);
```

- [ ] **Step 2: Run integration tests**

Run: `cd protocol && bun test src/controllers/tests/tool.controller.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add protocol/src/controllers/tests/tool.controller.spec.ts
git commit -m "test(protocol): add integration tests for migrated CLI tool calls"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `docs/specs/api-reference.md`

- [ ] **Step 1: Remove `POST /api/intents/process` from api-reference.md**

Find and remove the documentation for the `POST /api/intents/process` endpoint in the Intents section.

- [ ] **Step 2: Run full CLI test suite**

Run: `cd cli && bun test`
Expected: All tests pass.

- [ ] **Step 3: Run full protocol tool controller tests**

Run: `cd protocol && bun test src/controllers/tests/tool.controller.spec.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/api-reference.md
git commit -m "docs: remove POST /api/intents/process from API reference"
```
