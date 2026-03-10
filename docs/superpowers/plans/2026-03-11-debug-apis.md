# Debug APIs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side debug endpoints for intents, home view, and chat — with frontend bug icons that copy debug JSON to clipboard.

**Architecture:** Three `GET` endpoints on a new `DebugController`, gated by `DebugGuard` (env-based) + `AuthGuard`. Frontend uses a shared `DebugCopyButton` component placed in the intent list, home page, and chat header.

**Tech Stack:** Bun, Express decorators (`@Controller`, `@Get`, `@UseGuards`), Drizzle ORM, React, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-11-debug-apis-design.md`

---

## Chunk 1: Backend — Guard + Controller + Intent Debug

### Task 1: Create DebugGuard

**Files:**
- Create: `protocol/src/guards/debug.guard.ts`

The guard returns void when debug is enabled, throws when disabled. Pattern matches `AuthGuard` in `protocol/src/guards/auth.guard.ts`.

- [ ] **Step 1: Create the guard file**

```typescript
// protocol/src/guards/debug.guard.ts

/**
 * Environment-based guard that gates debug API endpoints.
 * Returns void when debug is enabled; throws (404) when disabled.
 * Enabled when NODE_ENV === 'development' or ENABLE_DEBUG_API === 'true'.
 */
export const DebugGuard = async (_req: Request): Promise<void> => {
  const isDev = process.env.NODE_ENV === "development";
  const isExplicitlyEnabled = process.env.ENABLE_DEBUG_API === "true";

  if (!isDev && !isExplicitlyEnabled) {
    throw new Error("Not found");
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/guards/debug.guard.ts
git commit -m "feat(debug): add DebugGuard for env-based debug API gating"
```

---

### Task 2: Create DebugController with intent debug endpoint

**Files:**
- Create: `protocol/src/controllers/debug.controller.ts`
- Modify: `protocol/src/main.ts` (register controller)

This controller uses `@UseGuards(DebugGuard, AuthGuard)` — DebugGuard first so unauthenticated 404s are returned before auth is checked. The controller queries the DB directly using the Drizzle client (following the same pattern as other controllers that receive adapters).

- [ ] **Step 1: Create the debug controller with intent debug endpoint**

The intent debug endpoint gathers:
- Intent record (text, status, confidence, embedding presence, timestamps)
- HyDE document count + timestamps from `hyde_documents` where `sourceType = 'intent'` and `sourceId = intentId`
- Index assignments from `intent_indexes` joined with `indexes`
- Opportunities where this intent appears in the `actors` JSONB array
- A diagnosis object summarizing pipeline health

```typescript
// protocol/src/controllers/debug.controller.ts
import { eq, sql, and, desc, asc, count } from "drizzle-orm";

import { db } from "../lib/drizzle/drizzle";
import {
  intents,
  hydeDocuments,
  intentIndexes,
  indexes,
  opportunities,
} from "../schemas/database.schema";
import { AuthGuard } from "../guards/auth.guard";
import { DebugGuard } from "../guards/debug.guard";
import { Controller, Get, UseGuards } from "../lib/router/router.decorators";

import type { AuthenticatedUser } from "../guards/auth.guard";
import type { RouteParams } from "../lib/router/router.decorators";

/**
 * Debug API controller for diagnosing intent, home, and chat pipelines.
 * Gated behind DebugGuard (env-based) + AuthGuard.
 */
@Controller("/debug")
export class DebugController {
  /**
   * Returns a full diagnostic snapshot for a single intent.
   * Includes intent data, HyDE documents, index assignments,
   * opportunities, and a diagnosis checklist.
   */
  @Get("/intents/:id")
  @UseGuards(DebugGuard, AuthGuard)
  async getIntentDebug(
    _req: Request,
    user: AuthenticatedUser,
    params: RouteParams,
  ) {
    const intentId = params?.id;
    if (!intentId) {
      return Response.json({ error: "Intent ID required" }, { status: 400 });
    }

    // 1. Fetch intent
    const [intent] = await db
      .select()
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, user.id)));

    if (!intent) {
      return Response.json({ error: "Intent not found" }, { status: 404 });
    }

    // 2. HyDE documents
    const hydeDocs = await db
      .select({
        id: hydeDocuments.id,
        createdAt: hydeDocuments.createdAt,
      })
      .from(hydeDocuments)
      .where(
        and(
          eq(hydeDocuments.sourceType, "intent"),
          eq(hydeDocuments.sourceId, intentId),
        ),
      )
      .orderBy(asc(hydeDocuments.createdAt));

    // 3. Index assignments
    const indexAssignments = await db
      .select({
        indexId: intentIndexes.indexId,
        indexTitle: indexes.title,
        indexPrompt: indexes.prompt,
      })
      .from(intentIndexes)
      .innerJoin(indexes, eq(intentIndexes.indexId, indexes.id))
      .where(eq(intentIndexes.intentId, intentId));

    // 4. Opportunities involving this intent
    const allOpportunities = await db
      .select()
      .from(opportunities)
      .where(
        sql`${opportunities.actors}::jsonb @> ${JSON.stringify([{ intent: intentId }])}::jsonb`,
      )
      .orderBy(desc(opportunities.createdAt));

    const byStatus: Record<string, number> = {};
    for (const opp of allOpportunities) {
      byStatus[opp.status] = (byStatus[opp.status] || 0) + 1;
    }

    const opportunityItems = allOpportunities.map((opp) => {
      const counterpart = opp.actors.find(
        (a: { userId: string }) => a.userId !== user.id,
      );
      return {
        opportunityId: opp.id,
        counterpartUserId: counterpart?.userId ?? null,
        confidence: opp.confidence,
        status: opp.status,
        createdAt: opp.createdAt,
        indexId: opp.context?.indexId ?? null,
      };
    });

    // 5. Diagnosis
    const hasEmbedding = intent.embedding != null;
    const hasHydeDocuments = hydeDocs.length > 0;
    const isInAtLeastOneIndex = indexAssignments.length > 0;
    const hasOpportunities = allOpportunities.length > 0;

    const actionableStatuses = new Set(["pending", "viewed"]);
    const actionableCount = allOpportunities.filter((o) =>
      actionableStatuses.has(o.status),
    ).length;

    const filterReasons: string[] = [];
    for (const [status, count] of Object.entries(byStatus)) {
      if (!actionableStatuses.has(status)) {
        filterReasons.push(`${status}: ${count}`);
      }
    }

    return Response.json({
      exportedAt: new Date().toISOString(),
      intent: {
        id: intent.id,
        text: intent.payload,
        summary: intent.summary,
        status: intent.archivedAt ? "archived" : "active",
        confidence: intent.confidence,
        inferenceType: intent.inferenceType,
        sourceType: intent.sourceType,
        hasEmbedding,
        createdAt: intent.createdAt,
        updatedAt: intent.updatedAt,
      },
      hydeDocuments: {
        count: hydeDocs.length,
        oldestGeneratedAt: hydeDocs[0]?.createdAt ?? null,
        newestGeneratedAt: hydeDocs[hydeDocs.length - 1]?.createdAt ?? null,
      },
      indexAssignments: indexAssignments.map((ia) => ({
        indexId: ia.indexId,
        indexTitle: ia.indexTitle,
        indexPrompt: ia.indexPrompt,
      })),
      opportunities: {
        total: allOpportunities.length,
        byStatus,
        items: opportunityItems,
      },
      diagnosis: {
        hasEmbedding,
        hasHydeDocuments,
        isInAtLeastOneIndex,
        hasOpportunities,
        allOpportunitiesFilteredFromHome:
          hasOpportunities && actionableCount === 0,
        filterReasons,
      },
    });
  }
}
```

- [ ] **Step 2: Register DebugController in main.ts**

In `protocol/src/main.ts`, add the import and registration. Find the controller imports section and add:

```typescript
import { DebugController } from "./controllers/debug.controller";
```

Find the `controllerInstances` map and add:

```typescript
controllerInstances.set(DebugController, new DebugController());
```

- [ ] **Step 3: Test manually**

```bash
cd /Users/aposto/Projects/index/.worktrees/feat-debug-apis/protocol
bun run dev
```

Test with curl (replace `<jwt>` and `<intentId>` with real values):
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:3001/debug/intents/<intentId> | jq .
```

Verify:
- Returns intent data, hydeDocuments, indexAssignments, opportunities, diagnosis
- Returns 404 when `ENABLE_DEBUG_API` is not set and `NODE_ENV` is not development

- [ ] **Step 4: Commit**

```bash
git add protocol/src/controllers/debug.controller.ts protocol/src/main.ts
git commit -m "feat(debug): add DebugController with intent debug endpoint"
```

---

## Chunk 2: Backend — Home Debug + Chat Debug

### Task 3: Add home debug endpoint

**Files:**
- Modify: `protocol/src/controllers/debug.controller.ts`

This endpoint gathers user-level stats across the entire pipeline: intents, embeddings, HyDE docs, index assignments, opportunities, and home view filtering.

- [ ] **Step 1: Add the home debug method to DebugController**

Add this method to the `DebugController` class. It needs to query:
- All user intents with embedding/hyde/index stats
- User's index memberships
- All opportunities for the user with status breakdown
- Simulate home graph filtering to report what was filtered and why

```typescript
  /**
   * Returns a home-level diagnostic snapshot for the authenticated user.
   * Summarizes intents, indexes, opportunities, and home view filtering.
   */
  @Get("/home")
  @UseGuards(DebugGuard, AuthGuard)
  async getHomeDebug(_req: Request, user: AuthenticatedUser) {
    // 1. User's intents
    const userIntents = await db
      .select({
        id: intents.id,
        hasEmbedding: sql<boolean>`${intents.embedding} IS NOT NULL`.as(
          "has_embedding",
        ),
        archivedAt: intents.archivedAt,
      })
      .from(intents)
      .where(eq(intents.userId, user.id));

    const activeIntents = userIntents.filter((i) => !i.archivedAt);
    const archivedIntents = userIntents.filter((i) => i.archivedAt);
    const withEmbeddings = userIntents.filter((i) => i.hasEmbedding);

    // 2. HyDE doc counts per intent
    const hydeCountRows = await db
      .select({
        sourceId: hydeDocuments.sourceId,
        count: count().as("count"),
      })
      .from(hydeDocuments)
      .where(eq(hydeDocuments.sourceType, "intent"))
      .groupBy(hydeDocuments.sourceId);

    const hydeCountMap = new Map(
      hydeCountRows.map((r) => [r.sourceId, Number(r.count)]),
    );
    const intentIdsWithHyde = userIntents.filter(
      (i) => (hydeCountMap.get(i.id) ?? 0) > 0,
    );

    // 3. Index assignments
    const userIntentIds = userIntents.map((i) => i.id);
    let indexAssignmentRows: { intentId: string; indexId: string }[] = [];
    if (userIntentIds.length > 0) {
      indexAssignmentRows = await db
        .select({
          intentId: intentIndexes.intentId,
          indexId: intentIndexes.indexId,
        })
        .from(intentIndexes)
        .where(
          sql`${intentIndexes.intentId} IN (${sql.join(
            userIntentIds.map((id) => sql`${id}`),
            sql`,`,
          )})`,
        );
    }

    const intentsInIndexes = new Set(indexAssignmentRows.map((r) => r.intentId));
    const orphanedCount = userIntents.filter(
      (i) => !i.archivedAt && !intentsInIndexes.has(i.id),
    ).length;

    // 4. User's indexes (via index_members)
    const { indexMembers } = await import("../schemas/database.schema");
    const userIndexRows = await db
      .select({
        indexId: indexMembers.indexId,
        indexTitle: indexes.title,
      })
      .from(indexMembers)
      .innerJoin(indexes, eq(indexMembers.indexId, indexes.id))
      .where(eq(indexMembers.userId, user.id));

    // Count intents per index for this user
    const indexDetails = userIndexRows.map((row) => {
      const assignedCount = indexAssignmentRows.filter(
        (a) => a.indexId === row.indexId,
      ).length;
      return {
        indexId: row.indexId,
        title: row.indexTitle,
        userIntentsAssigned: assignedCount,
      };
    });

    // 5. Opportunities
    const userOpportunities = await db
      .select()
      .from(opportunities)
      .where(
        sql`${opportunities.actors}::jsonb @> ${JSON.stringify([{ userId: user.id }])}::jsonb`,
      );

    const oppByStatus: Record<string, number> = {};
    for (const opp of userOpportunities) {
      oppByStatus[opp.status] = (oppByStatus[opp.status] || 0) + 1;
    }

    // 6. Simulate home view filtering
    const { canUserSeeOpportunity, isActionableForViewer } = await import(
      "../lib/protocol/support/opportunity.utils"
    );

    let notActionable = 0;
    let notVisible = 0;
    const actionableOpps: typeof userOpportunities = [];

    for (const opp of userOpportunities) {
      if (!canUserSeeOpportunity(opp.actors, opp.status, user.id)) {
        notVisible++;
        continue;
      }
      if (!isActionableForViewer(opp.actors, opp.status, user.id)) {
        notActionable++;
        continue;
      }
      actionableOpps.push(opp);
    }

    // Dedup by counterpart
    const seenCounterparts = new Set<string>();
    let duplicateCounterpart = 0;
    for (const opp of actionableOpps) {
      const counterpart = opp.actors.find(
        (a: { userId: string }) => a.userId !== user.id,
      );
      if (counterpart && seenCounterparts.has(counterpart.userId)) {
        duplicateCounterpart++;
      } else if (counterpart) {
        seenCounterparts.add(counterpart.userId);
      }
    }

    const cardsReturned = seenCounterparts.size;

    // 7. Diagnosis
    const hasActiveIntents = activeIntents.length > 0;
    const intentsHaveEmbeddings = withEmbeddings.length > 0;
    const intentsHaveHydeDocuments = intentIdsWithHyde.length > 0;
    const intentsAreIndexed = intentsInIndexes.size > 0;
    const hasOpportunities = userOpportunities.length > 0;
    const opportunitiesReachHome = cardsReturned > 0;

    let bottleneck: string | null = null;
    if (!hasActiveIntents) {
      bottleneck = "No active intents";
    } else if (!intentsHaveEmbeddings) {
      bottleneck = `${activeIntents.length - withEmbeddings.length} intents missing embeddings`;
    } else if (!intentsHaveHydeDocuments) {
      const missing = activeIntents.length - intentIdsWithHyde.length;
      bottleneck = `${missing} intents missing HyDE documents`;
    } else if (!intentsAreIndexed) {
      bottleneck = `${orphanedCount} active intents not assigned to any index`;
    } else if (!hasOpportunities) {
      bottleneck = "No opportunities discovered yet";
    } else if (!opportunitiesReachHome) {
      bottleneck = `All ${userOpportunities.length} opportunities filtered out of home view`;
    }

    return Response.json({
      exportedAt: new Date().toISOString(),
      userId: user.id,
      intents: {
        total: userIntents.length,
        byStatus: {
          active: activeIntents.length,
          archived: archivedIntents.length,
        },
        withEmbeddings: withEmbeddings.length,
        withHydeDocuments: intentIdsWithHyde.length,
        inAtLeastOneIndex: intentsInIndexes.size,
        orphaned: orphanedCount,
      },
      indexes: indexDetails,
      opportunities: {
        total: userOpportunities.length,
        byStatus: oppByStatus,
        actionable: cardsReturned,
      },
      homeView: {
        cardsReturned,
        filteredOut: {
          notActionable,
          duplicateCounterpart,
          notVisible,
        },
      },
      diagnosis: {
        hasActiveIntents,
        intentsHaveEmbeddings,
        intentsHaveHydeDocuments,
        intentsAreIndexed,
        hasOpportunities,
        opportunitiesReachHome,
        bottleneck,
      },
    });
  }
```

- [ ] **Step 2: Test manually**

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:3001/debug/home | jq .
```

- [ ] **Step 3: Commit**

```bash
git add protocol/src/controllers/debug.controller.ts
git commit -m "feat(debug): add home debug endpoint"
```

---

### Task 4: Add chat debug endpoint

**Files:**
- Modify: `protocol/src/controllers/debug.controller.ts`

This endpoint replaces the frontend-only chat debug assembly. It loads the chat session messages and any stored debug metadata from the DB.

- [ ] **Step 1: Add the chat debug method to DebugController**

```typescript
  /**
   * Returns a chat session debug snapshot.
   * Includes all messages and any stored debug metadata per turn.
   */
  @Get("/chat/:id")
  @UseGuards(DebugGuard, AuthGuard)
  async getChatDebug(
    _req: Request,
    user: AuthenticatedUser,
    params: RouteParams,
  ) {
    const sessionId = params?.id;
    if (!sessionId) {
      return Response.json({ error: "Session ID required" }, { status: 400 });
    }

    const { chatSessions, chatMessages } = await import(
      "../schemas/database.schema"
    );

    // 1. Verify session belongs to user
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(
        and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)),
      );

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // 2. Load messages
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));

    // 3. Build export
    const exportMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 4. Build turns with debug meta from stored metadata
    const assistantIndices = messages
      .map((msg, i) => (msg.role === "assistant" ? i : -1))
      .filter((i) => i >= 0);

    const turns = assistantIndices.map((msgIdx) => {
      const msg = messages[msgIdx];
      const meta = msg.metadata as
        | { debugMeta?: { graph?: string; iterations?: number; tools?: unknown[] } }
        | null;
      const debugMeta = meta?.debugMeta;
      return {
        messageIndex: msgIdx,
        graph: debugMeta?.graph ?? null,
        iterations: debugMeta?.iterations ?? null,
        tools: debugMeta?.tools ?? null,
      };
    });

    return Response.json({
      sessionId,
      exportedAt: new Date().toISOString(),
      title: session.title,
      indexId: session.indexId,
      messages: exportMessages,
      turns,
    });
  }
```

**Note:** This endpoint reads debug metadata from the `chatMessages.metadata` JSONB field. If debug meta is not currently persisted to messages, the turns will show null values — same as the current frontend behavior for loaded history. The existing SSE `debug_meta` approach only works for live sessions. This is an acceptable starting point; persisting debug meta to messages can be a follow-up task.

- [ ] **Step 2: Test manually**

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:3001/debug/chat/<sessionId> | jq .
```

- [ ] **Step 3: Commit**

```bash
git add protocol/src/controllers/debug.controller.ts
git commit -m "feat(debug): add chat debug endpoint"
```

---

## Chunk 3: Frontend — DebugCopyButton + Integration

### Task 5: Create shared DebugCopyButton component

**Files:**
- Create: `frontend/src/components/DebugCopyButton.tsx`

A reusable button: bug icon → loading spinner → green checkmark (success) or red X (error).

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/DebugCopyButton.tsx
import { useState, useCallback } from "react";
import { Bug, Check, X, Loader2 } from "lucide-react";

import { useAPI } from "../contexts/APIContext";

interface DebugCopyButtonProps {
  /** API path to fetch debug data from (e.g. "/debug/intents/abc123") */
  fetchPath: string;
  /** Optional tooltip override */
  title?: string;
  /** Optional size class for the icon (default: "w-4 h-4") */
  iconSize?: string;
}

/**
 * A bug icon button that fetches a debug endpoint and copies the
 * JSON response to the clipboard. Shows loading, success, and error states.
 */
export function DebugCopyButton({
  fetchPath,
  title = "Copy debug JSON",
  iconSize = "w-4 h-4",
}: DebugCopyButtonProps) {
  const api = useAPI();
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">(
    "idle",
  );

  const handleClick = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const data = await api.get(fetchPath);
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }, [api, fetchPath, state]);

  const icon = {
    idle: <Bug className={iconSize} />,
    loading: <Loader2 className={`${iconSize} animate-spin`} />,
    copied: <Check className={`${iconSize} text-green-500`} />,
    error: <X className={`${iconSize} text-red-500`} />,
  }[state];

  const label = {
    idle: title,
    loading: "Loading...",
    copied: "Copied!",
    error: "Failed to copy",
  }[state];

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="shrink-0 p-1 rounded text-gray-500 hover:text-[#4091BB] hover:bg-gray-100 focus:outline-none"
      aria-label={label}
    >
      {icon}
    </button>
  );
}
```

**Note:** This uses `api.get()` from the existing `APIContext`. Verify the context provides a `get` method — if it only has `post`, adjust accordingly or add a `get` helper. The API proxy in Vite dev config already forwards `/api/*` to the protocol server.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DebugCopyButton.tsx
git commit -m "feat(debug): add shared DebugCopyButton component"
```

---

### Task 6: Add debug button to intent list

**Files:**
- Modify: `frontend/src/components/IntentList.tsx`

Add a `DebugCopyButton` to each intent row.

- [ ] **Step 1: Add the debug button to each intent row**

In `IntentList.tsx`, import the component:
```typescript
import { DebugCopyButton } from "./DebugCopyButton";
```

Find the row actions area (where archive/remove buttons are) and add the debug button alongside them:
```tsx
<DebugCopyButton fetchPath={`/debug/intents/${intent.id}`} />
```

Place it before or after the existing action buttons in the intent row.

- [ ] **Step 2: Test manually**

Run the frontend dev server, go to Library > Intents, click the bug icon on an intent, verify JSON is copied to clipboard.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/IntentList.tsx
git commit -m "feat(debug): add debug button to intent list"
```

---

### Task 7: Add debug button to home/chat page

**Files:**
- Modify: `frontend/src/components/ChatContent.tsx`

Add two debug buttons:
1. Home debug button in the header area (for home view debugging)
2. Replace existing chat bug icon with `DebugCopyButton`

- [ ] **Step 1: Add home debug button**

In `ChatContent.tsx`, import the component:
```typescript
import { DebugCopyButton } from "./DebugCopyButton";
```

Find the area where home sections are rendered (the header/toolbar near the top of the chat content). Add:
```tsx
<DebugCopyButton
  fetchPath="/debug/home"
  title="Copy home debug JSON"
  iconSize="w-5 h-5"
/>
```

This should be visible when the home view is displayed (when `USE_HOME_API` is true and home sections are showing).

- [ ] **Step 2: Replace chat debug button**

Find the existing bug icon button (around line 1552-1559). Replace the entire `<button>` block with:
```tsx
{sessionId && (
  <DebugCopyButton
    fetchPath={`/debug/chat/${sessionId}`}
    title="Copy chat debug JSON"
    iconSize="w-5 h-5"
  />
)}
```

- [ ] **Step 3: Remove old debug state and handlers**

In `ChatContent.tsx`:
- Remove the `debugCopied` state variable
- Remove the `handleCopyDebug` callback
- Remove the `Bug` import from lucide-react (if no longer used elsewhere in this file)

In `frontend/src/contexts/AIChatContext.tsx`:
- Remove the `debugMetaByTurn` state (`useState<(DebugTurnMeta | null)[]>([])`)
- Remove the `debug_meta` case in the SSE event handler
- Remove `debugMetaByTurn` from the context value
- Remove the `DebugTurnMeta` interface if it's no longer used
- Remove the `Array(assistantCount).fill(null)` line in `loadSession`
- Remove the `setDebugMetaByTurn([])` line in `clearChat`

**Important:** Do this cleanup only after verifying the new `DebugCopyButton` works correctly. If anything breaks, the old code can be restored from git.

- [ ] **Step 4: Test manually**

1. Open the app, go to home page — verify home debug bug icon appears and copies JSON
2. Start a chat session — verify chat debug bug icon appears and copies JSON
3. Go to library > intents — verify per-intent bug icon works
4. Set `NODE_ENV=production` and unset `ENABLE_DEBUG_API` — verify all three return 404

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatContent.tsx frontend/src/contexts/AIChatContext.tsx
git commit -m "feat(debug): integrate DebugCopyButton into home and chat, remove client-side debug assembly"
```

---

## Chunk 4: Cleanup + Verification

### Task 8: Backend cleanup — remove debug_meta SSE emission (optional)

**Files:**
- Modify: `protocol/src/lib/protocol/streamers/chat.streamer.ts`

Since the chat debug endpoint now serves debug data server-side, the `debug_meta` SSE event is no longer consumed by the frontend. However, this is **optional** — removing it is a clean-up step. If other consumers depend on it, skip this task.

- [ ] **Step 1: Check if debug_meta is consumed anywhere else**

Search the codebase for `debug_meta` references outside of the files we've already modified. If there are other consumers, skip this task.

- [ ] **Step 2: Remove debug_meta emission from chat streamer**

In `protocol/src/lib/protocol/streamers/chat.streamer.ts` (around lines 250-263), remove or comment out the `createDebugMetaEvent` yield block.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/streamers/chat.streamer.ts
git commit -m "refactor(debug): remove debug_meta SSE emission from chat streamer"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run linting**

```bash
cd /Users/aposto/Projects/index/.worktrees/feat-debug-apis/protocol
bun run lint
```

```bash
cd /Users/aposto/Projects/index/.worktrees/feat-debug-apis/frontend
bun run lint
```

Fix any lint errors.

- [ ] **Step 2: Run tests**

```bash
cd /Users/aposto/Projects/index/.worktrees/feat-debug-apis/protocol
bun test
```

Fix any test failures.

- [ ] **Step 3: Final manual smoke test**

1. Start both servers (`bun run dev` from worktree root)
2. Click bug icon on an intent in library — verify clipboard JSON has all fields
3. Click bug icon on home page — verify clipboard JSON has diagnosis + bottleneck
4. Click bug icon in chat — verify clipboard JSON has messages + turns
5. Paste any of these into Claude — verify Claude can diagnose issues from the data

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(debug): address lint and test issues"
```
