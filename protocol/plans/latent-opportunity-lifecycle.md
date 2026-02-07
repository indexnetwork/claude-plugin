# Latent Opportunity Lifecycle — Implementation Plan

> **Status**: READY  
> **Branch**: `feat/latent-opportunities`  
> **Scope**: Add `latent` opportunity status, update discovery to persist as latent, add `send_opportunity` chat tool, update `create_opportunity_between_members` to create as latent.  
> **See also**: [Design Doc](../src/lib/protocol/docs/Latent%20Opportunity%20Lifecycle.md), [Opportunity Graph README](../src/lib/protocol/graphs/opportunity/README.md)

---

## Overview

When a user says "find opportunities for me," the agent discovers, evaluates, and persists opportunities in a **latent** state — visible only to the requesting user, with no notifications sent. The user then chooses to **send** (promote to pending + notify) or dismiss. Users never directly create opportunities; they only act on agent-created ones.

---

## Current State (post-cleanup)

| Component | Location | Current Behavior |
|-----------|----------|-----------------|
| Status enum | `src/schemas/database.schema.ts:18` | `pending, viewed, accepted, rejected, expired` |
| `OpportunityStatus` type | `src/lib/protocol/interfaces/database.interface.ts:284` | Mirrors enum |
| `persistOpportunitiesNode` | `src/lib/protocol/graphs/opportunity/opportunity.graph.ts:393` | Hardcodes `status: 'pending'` |
| `create_opportunities` tool | `src/lib/protocol/graphs/chat/chat.tools.ts` | Calls `runDiscoverFromQuery` → full opportunity graph (persist as latent) |
| `create_opportunity_between_members` | `src/lib/protocol/graphs/chat/chat.tools.ts:1111-1232` | Creates with `status: 'pending'`, immediately queues notifications |
| `PATCH /:id/status` | `src/controllers/opportunity.controller.ts:78-120` | Accepts `pending, viewed, accepted, rejected, expired` |
| `updateOpportunityStatus` | `src/adapters/database.adapter.ts:2121-2131` | Same union as controller |
| Notifications | `src/queues/notification.queue.ts` | `queueOpportunityNotification(id, recipientId, priority)` |
| Latest migration | `drizzle/0022_rename_personal_index_to_my_own_private.sql` | — |

---

## Implementation Steps

### Step 1: Schema and types — add `latent` status

**Goal**: Make `latent` a valid opportunity status at every layer.

**Files to change**:

1. **`src/schemas/database.schema.ts`** (line 18)
   - Change `opportunityStatusEnum` from `['pending', 'viewed', 'accepted', 'rejected', 'expired']` to `['latent', 'pending', 'viewed', 'accepted', 'rejected', 'expired']`.

2. **`src/lib/protocol/interfaces/database.interface.ts`** (line 284)
   - Change `OpportunityStatus` to: `'latent' | 'pending' | 'viewed' | 'accepted' | 'rejected' | 'expired'`

3. **`src/adapters/database.adapter.ts`**
   - `OpportunityDatabaseAdapter.updateOpportunityStatus` (line 2121-2124): add `'latent'` to the status union.
   - `ChatDatabaseAdapter.updateOpportunityStatus` (line 1868-1871): add `'latent'` to the status union.

4. **`src/controllers/opportunity.controller.ts`** (line 102)
   - Add `'latent'` to the `allowed` array: `const allowed = ['latent', 'pending', 'viewed', 'accepted', 'rejected', 'expired'];`

**Verification**: `bun run lint` passes; TypeScript compiles.

---

### Step 2: Database migration

**Goal**: Add `latent` value to the PostgreSQL enum.

**Action**:
1. Run `bun run db:generate` to auto-generate the migration from the schema change.
2. Verify the generated SQL is equivalent to:
   ```sql
   ALTER TYPE opportunity_status ADD VALUE IF NOT EXISTS 'latent' BEFORE 'pending';
   ```
3. Run `bun run db:migrate` to apply.

**Verification**: `bun run db:studio` — confirm `opportunity_status` enum includes `latent`.

---

### Step 3: Opportunity graph — support `initialStatus` option

**Goal**: Let callers control what status persisted opportunities get.

**Files to change**:

1. **`src/lib/protocol/agents/opportunity/opportunity.evaluator.ts`** (~line 97-106)
   - Add to `OpportunityEvaluatorOptions`:
     ```typescript
     initialStatus?: OpportunityStatus;
     ```
   - Import `OpportunityStatus` from the interfaces.

2. **`src/lib/protocol/graphs/opportunity/opportunity.graph.ts`** (line 393)
   - Replace:
     ```typescript
     status: 'pending',
     ```
   - With:
     ```typescript
     status: state.options.initialStatus ?? 'pending',
     ```

**Verification**: Existing behavior unchanged (defaults to `'pending'`). Unit test (step 8) will confirm `initialStatus` pass-through.

---

### Step 4: Discovery — persist as latent (create_opportunities)

**Goal**: When the chat `create_opportunities` tool runs discovery, opportunities are created with `latent` status. The tool was renamed from `find_opportunities` to `create_opportunities` to reflect the create strategy; discover node passes `initialStatus: 'latent'`. Master prompts (chat.agent.ts, chat.streaming.ts) were updated so the agent uses create_opportunities and describes drafts.

**Files changed**: `src/lib/protocol/graphs/chat/nodes/discover.nodes.ts`, `chat.tools.ts` (rename find_opportunities → create_opportunities), `chat.agent.ts`, `chat.streaming.ts`

In `runDiscoverFromQuery`, the `opportunityGraph.invoke(...)` call includes:

```typescript
const result = await opportunityGraph.invoke({
  sourceUserId: userId,
  sourceText: query,
  indexScope,
  options: {
    hydeDescription: query,
    strategies,
    limit,
    initialStatus: 'latent',  // NEW: opportunities start as drafts
  },
});
```

**Verification**: Call `create_opportunities` via chat; check DB for `status = 'latent'` on created opportunities.

---

### Step 5: New chat tool — `send_opportunity`

**Goal**: Allow users to promote a latent opportunity to pending and trigger notifications.

**File to change**: `src/lib/protocol/graphs/chat/chat.tools.ts`

Add a new tool after the existing discovery tools section:

```typescript
const sendOpportunity = tool(
  async (args: { opportunityId: string }) => {
    logger.info("Tool: send_opportunity", { userId, opportunityId: args.opportunityId });

    try {
      const opportunity = await database.getOpportunity(args.opportunityId);
      if (!opportunity) {
        return error("Opportunity not found.");
      }
      if (opportunity.status !== 'latent') {
        return error(`Opportunity is already ${opportunity.status}; only draft (latent) opportunities can be sent.`);
      }
      const isActor = opportunity.actors.some((a) => a.identityId === userId);
      if (!isActor) {
        return error("You are not part of this opportunity.");
      }

      await database.updateOpportunityStatus(args.opportunityId, 'pending');

      const recipients = opportunity.actors.filter((a) => a.identityId !== userId);
      for (const recipient of recipients) {
        await queueOpportunityNotification(opportunity.id, recipient.identityId, 'high');
      }

      const recipientNames = recipients.map((a) => a.identityId);
      return success({
        sent: true,
        opportunityId: opportunity.id,
        notified: recipientNames,
        message: "Opportunity sent. The other person has been notified.",
      });
    } catch (err) {
      logger.error("send_opportunity failed", { error: err });
      return error("Failed to send opportunity. Please try again.");
    }
  },
  {
    name: "send_opportunity",
    description:
      "Sends a draft (latent) opportunity to the other person, promoting it to pending and triggering a notification. Use after create_opportunities or create_opportunity_between_members when the user wants to send the intro.",
    schema: z.object({
      opportunityId: z.string().describe("The opportunity ID to send (from create_opportunities or list_my_opportunities)"),
    }),
  }
);
```

Also add `sendOpportunity` to the returned tools array in `createChatTools`.

**Verification**: Create a latent opportunity, then call `send_opportunity` via chat; confirm status changes to `pending` and notification is queued.

---

### Step 6: Update `create_opportunity_between_members` — latent + no notifications

**Goal**: Curator-suggested opportunities also start as drafts.

**File to change**: `src/lib/protocol/graphs/chat/chat.tools.ts`

1. In the `CreateOpportunityData` object (~line 1199), change:
   ```typescript
   status: "pending",
   ```
   to:
   ```typescript
   status: "latent",
   ```

2. Remove the notification loop (~lines 1207-1211):
   ```typescript
   // REMOVE:
   const recipientIds = actors.filter((a) => a.role !== "introducer").map((a) => a.identityId);
   for (const recipientId of recipientIds) {
     if (recipientId === userId) continue;
     await queueOpportunityNotification(opportunity.id, recipientId, "high");
   }
   ```

3. Update the success message:
   ```typescript
   message: "Opportunity created as draft. Say 'send it' to notify both members.",
   ```

**Verification**: Call `create_opportunity_between_members`; confirm opportunity is `latent` in DB and no notifications are queued.

---

### Step 7: Agent system prompt and streaming

**Goal**: The agent knows about the new `send_opportunity` tool and guides users through the latent-to-sent flow.

**Files to change**:

1. **`src/lib/protocol/graphs/chat/chat.agent.ts`**

   - **Discovery tools section** (~lines 61-64): Add:
     ```
     - **send_opportunity**: Send a draft opportunity to the other person, promoting it to active and triggering a notification. Use when the user says "send intro to X" or "send that opportunity".
     ```
   - Discovery tool is **create_opportunities** (already describes drafts; use send_opportunity to notify). Ensure create_opportunities and send_opportunity are both documented in the Discovery section.
   - **Guidelines** (~line 79-80): Add:
     ```
     - After finding opportunities, tell the user they can say "send intro to [name]" to notify the other person. Opportunities start as drafts until explicitly sent.
     - When creating an opportunity between two members, inform the introducer it's a draft and they need to say "send it" to notify both parties.
     ```
   - **Table formatting** (~line 152): Note that `latent` status should display as "Draft" in tables.

2. **`src/lib/protocol/graphs/chat/streaming/chat.streaming.ts`** (~line 33-35)

   Add:
   ```typescript
   send_opportunity: "Sending opportunity...",
   ```

**Verification**: Read system prompt in code; confirm `send_opportunity` is documented and latent/draft guidance is present.

---

### Step 8: Update tests

**Goal**: Existing tests pass; new behavior is covered.

**Files to change**:

1. **`src/lib/protocol/graphs/opportunity/opportunity.graph.spec.ts`**
   - Add test: when `options.initialStatus` is `'latent'`, `createOpportunity` is called with `status: 'latent'`.
   - Add test: when `options.initialStatus` is omitted, `createOpportunity` is called with `status: 'pending'` (backward compat).

2. **`src/lib/protocol/graphs/chat/nodes/discover.nodes.spec.ts`**
   - Verify that `opportunityGraph.invoke` is called with `options.initialStatus: 'latent'`.

**Verification**: `bun test` passes.

---

## Step Summary

| Step | Files | Description |
|------|-------|-------------|
| 1 | `database.schema.ts`, `database.interface.ts`, `database.adapter.ts`, `opportunity.controller.ts` | Add `latent` to status enum, type, adapter, controller |
| 2 | `drizzle/0023_*.sql` | Database migration |
| 3 | `opportunity.evaluator.ts`, `opportunity.graph.ts` | Support `initialStatus` option in persist node |
| 4 | `discover.nodes.ts`, `chat.tools.ts`, `chat.agent.ts`, `chat.streaming.ts` | Pass `initialStatus: 'latent'`; rename find_opportunities → create_opportunities; update prompts |
| 5 | `chat.tools.ts` | New `send_opportunity` tool |
| 6 | `chat.tools.ts` | Update `create_opportunity_between_members` to latent + no notifications |
| 7 | `chat.agent.ts`, `chat.streaming.ts` | System prompt + streaming label |
| 8 | `opportunity.graph.spec.ts`, `discover.nodes.spec.ts` | Tests |

## Checklist

- [ ] Step 1: `latent` in schema, interface, adapter, controller
- [ ] Step 2: Migration generated and applied
- [ ] Step 3: `initialStatus` option in opportunity graph
- [ ] Step 4: Discovery passes `initialStatus: 'latent'`
- [ ] Step 5: `send_opportunity` chat tool implemented
- [ ] Step 6: `create_opportunity_between_members` creates as latent
- [ ] Step 7: System prompt and streaming label updated
- [ ] Step 8: Tests updated and passing
- [ ] `bun run lint` clean
- [ ] `bun test` green
