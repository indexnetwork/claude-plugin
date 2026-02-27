# Discovery Tuning Rethink — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine discovery parameters, replace hard eval cap with user-driven pagination, add funnel instrumentation, and fix code review issues — all on the existing `feat/observability-and-discovery-optimizations` worktree.

**Architecture:** The changes touch 4 layers: types (widen debug data), embedder (SQL dedup), opportunity graph (batched eval + continuation mode), and tool/support (pagination with Redis cache). The graph gains a `continue_discovery` operation mode that routes past discovery straight to evaluation with pre-loaded candidates from Redis.

**Tech Stack:** Drizzle ORM (SQL DISTINCT ON via raw SQL), Redis (ioredis via RedisCacheAdapter), LangGraph state annotations, Zod schemas.

**Worktree:** `/Users/aposto/Projects/index/.worktrees/feat-observability-and-discovery-optimizations`

**Note:** Do NOT auto-commit. Stage changes and let the user review before committing.

---

## Phase 1: Quick Fixes (independent, no inter-dependencies)

### Task 1: Widen `DebugMetaStep.data` type (backend)

**Files:**
- Modify: `protocol/src/types/chat-streaming.types.ts:289-297`

**Step 1: Replace narrow data type with `Record<string, unknown>`**

In `chat-streaming.types.ts`, replace the `DebugMetaStep` interface's `data` field:

```typescript
// BEFORE (lines 289-297):
data?: {
    clarity?: number;
    authority?: number;
    sincerity?: number;
    entropy?: number;
    classification?: string;
    score?: number;
};

// AFTER:
data?: Record<string, unknown>;
```

This allows opportunity trace data (candidateCount, byStrategy, searchQuery, etc.) to flow through type-safely.

**Step 2: Verify no compile errors**

Run: `cd protocol && npx tsc --noEmit`
Expected: No errors related to DebugMetaStep.data

---

### Task 2: Add `data` field to `AgentStreamEvent` type

**Files:**
- Modify: `protocol/src/lib/protocol/agents/chat.agent.ts:59-61`

**Step 1: Widen the steps array type in tool_activity end event**

Find the `AgentStreamEvent` type union (line ~59-61). The tool_activity end variant:

```typescript
// BEFORE:
| { type: "tool_activity"; phase: "end"; name: string; success: boolean; summary?: string; steps?: Array<{ step: string; detail?: string }> }

// AFTER:
| { type: "tool_activity"; phase: "end"; name: string; success: boolean; summary?: string; steps?: Array<{ step: string; detail?: string; data?: Record<string, unknown> }> }
```

**Step 2: Verify no compile errors**

Run: `cd protocol && npx tsc --noEmit`

---

### Task 3: Widen frontend `ToolCallStep.data` type

**Files:**
- Modify: `frontend/src/contexts/AIChatContext.tsx:42-54`

**Step 1: Replace narrow data type**

```typescript
// BEFORE (lines 44-53):
export interface ToolCallStep {
  step: string;
  detail?: string;
  data?: {
    clarity?: number;
    authority?: number;
    sincerity?: number;
    entropy?: number;
    classification?: string;
    score?: number;
  };
}

// AFTER:
export interface ToolCallStep {
  step: string;
  detail?: string;
  data?: Record<string, unknown>;
}
```

**Step 2: Check that ToolCallsDisplay still compiles**

The `ToolCallsDisplay` component accesses `step.data?.clarity`, `step.data?.score`, etc. With `Record<string, unknown>`, these become `unknown` — verify that the component already does runtime checks (it should, since it conditionally renders based on data presence).

Run: `cd frontend && npx tsc --noEmit`

If type errors appear in ToolCallsDisplay, add type narrowing casts where accessed:
```typescript
const clarity = step.data?.clarity as number | undefined;
```

---

### Task 4: Unify `minScore` to 0.40

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:335,636`
- Modify: `protocol/src/adapters/embedder.adapter.ts` (default parameter)

**Step 1: Fix opportunity graph discovery node**

```typescript
// Line 335: change 0.30 → 0.40
const minScore = 0.40;

// Line 636: change 0.20 → 0.40
minScore: 0.40,
```

**Step 2: Update embedder default**

In `embedder.adapter.ts`, find the `searchWithHydeEmbeddings` method signature (line ~145). If `minScore` has a default of `0.30`, change it:

```typescript
// BEFORE:
minScore = 0.30

// AFTER:
minScore = 0.40
```

Check `searchWithProfileEmbedding` and `searchProfilesByProfileEmbedding` for any hardcoded minScore defaults too.

**Step 3: Verify no compile errors**

Run: `cd protocol && npx tsc --noEmit`

---

### Task 5: Delete orphaned `useTypewriter.ts`

**Files:**
- Delete: `frontend/src/hooks/useTypewriter.ts`

**Step 1: Verify no imports**

Search for any remaining imports:
```bash
grep -r "useTypewriter" frontend/src/
```
Expected: No results.

**Step 2: Delete the file**

```bash
rm frontend/src/hooks/useTypewriter.ts
```

---

## Phase 2: Embedder Optimization

### Task 6: Replace overfetch with SQL subquery dedup

**Files:**
- Modify: `protocol/src/adapters/embedder.adapter.ts:46-49,212-267,311-358`

**Step 1: Remove overfetch constants**

Delete lines 46-49:
```typescript
// DELETE THESE:
const OVERFETCH_MULTIPLIER = 10;
// ... up to MAX_OVERFETCH_ROWS
const MAX_OVERFETCH_ROWS = 500;
```

**Step 2: Rewrite `searchProfilesForHyde` with SQL dedup**

The challenge: `DISTINCT ON` requires the ORDER BY to start with the DISTINCT ON column, but we want results ordered by similarity globally. Solution: use a Drizzle subquery.

Replace lines 232-266 of `searchProfilesForHyde`:

```typescript
// Replace overfetch+JS-dedupe with SQL subquery dedup
// Inner query: DISTINCT ON (userId) keeps best match per user
// Outer query: re-sorts by similarity globally and applies limit
const innerQuery = db
  .selectDistinctOn([userProfiles.userId], {
    userId: userProfiles.userId,
    similarity: sql<number>`1 - (${userProfiles.embedding} <=> ${vectorStr}::vector)`,
    indexId: indexMembers.indexId,
  })
  .from(userProfiles)
  .innerJoin(indexMembers, eq(userProfiles.userId, indexMembers.userId))
  .where(and(...conditions))
  .orderBy(userProfiles.userId, sql`${userProfiles.embedding} <=> ${vectorStr}::vector`)
  .as('deduped');

const results = await db
  .select()
  .from(innerQuery)
  .orderBy(sql`${innerQuery.similarity} DESC`)
  .limit(limit);

return results.map((r) => ({
  type: 'profile' as const,
  id: r.userId,
  userId: r.userId,
  score: r.similarity,
  matchedVia: strategy,
  indexId: r.indexId,
}));
```

Note: Drizzle ORM supports `selectDistinctOn` — see [Drizzle docs](https://orm.drizzle.team/docs/select#distinct). If `selectDistinctOn` is not available in the project's Drizzle version, fall back to raw SQL:

```typescript
const results = await db.execute<{ userId: string; similarity: number; indexId: string }>(sql`
  SELECT * FROM (
    SELECT DISTINCT ON (up.user_id)
      up.user_id AS "userId",
      1 - (up.embedding <=> ${vectorStr}::vector) AS similarity,
      im.index_id AS "indexId"
    FROM user_profiles up
    INNER JOIN index_members im ON up.user_id = im.user_id
    WHERE ${and(...conditions)}
    ORDER BY up.user_id, up.embedding <=> ${vectorStr}::vector
  ) deduped
  ORDER BY similarity DESC
  LIMIT ${limit}
`);
```

**Step 3: Apply same change to `searchProfilesByProfileEmbedding`**

Same pattern — replace the overfetch+JS-dedupe block (lines 327-357) with the SQL subquery approach. Only difference: `matchedVia` is `'mirror'` instead of the strategy parameter.

**Step 4: Remove dead JS dedup code**

Delete the `byUser` Map dedup blocks from both methods since SQL handles it now.

**Step 5: Verify**

Run: `cd protocol && npx tsc --noEmit`

---

## Phase 3: Funnel Trace Instrumentation

### Task 7: Add `durationMs` timing to graph trace entries

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts` (discovery, evaluation, persist nodes)

**Step 1: Add timing to discovery node**

At the start of the discovery node function (around line 300), capture `const startTime = Date.now();`. At the end, before returning, add `durationMs` to the first trace entry's data:

```typescript
// At top of discovery node:
const startTime = Date.now();

// In each trace push for the summary entry, add:
data: {
  ...existingData,
  durationMs: Date.now() - startTime,
}
```

Find the discovery node's summary trace entry (the one with `node: "discovery"`, around line 674). Add `durationMs: Date.now() - startTime` to its `data` object.

For the profile-based discovery path (around line 473-514), do the same — capture timing and add to the trace entry.

**Step 2: Add timing to evaluation node**

Same pattern in the evaluation node (starts ~line 740):
- Capture `const startTime = Date.now();` at the top
- Add `durationMs: Date.now() - startTime` to the summary trace entry at line ~891

**Step 3: Add timing to persist node**

Same pattern in the persist node (starts ~line 1150):
- Capture `const startTime = Date.now();`
- Add `durationMs` to the persist trace entry at line ~1374

**Step 4: Add `threshold_filter` trace entry**

In the evaluation node, after sorting and before the eval cap, add a new trace entry showing the threshold split:

```typescript
// After sorting candidates (line ~748-750), add:
const aboveThreshold = state.candidates.filter(c => c.similarity >= 0.40).length;
const belowThreshold = state.candidates.length - aboveThreshold;

traceEntries.push({
  node: "threshold_filter",
  detail: `${aboveThreshold} above 0.40, ${belowThreshold} below`,
  data: {
    aboveThreshold,
    belowThreshold,
    minScore: 0.40,
    totalCandidates: state.candidates.length,
  },
});
```

---

### Task 8: Add per-strategy `avgSimilarity` to discovery trace

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts` (discovery node trace entries)

**Step 1: Compute per-strategy stats**

In the discovery node, after candidates are collected and deduped, compute per-strategy breakdown. Find the existing trace push that logs `byStrategy` (around line 674-698) and enhance it:

```typescript
// Compute per-strategy stats from deduped candidates
const strategyStats: Record<string, { count: number; avgSimilarity: number }> = {};
for (const c of candidates) {
  const s = c.strategy || 'unknown';
  if (!strategyStats[s]) strategyStats[s] = { count: 0, avgSimilarity: 0 };
  strategyStats[s].count++;
  strategyStats[s].avgSimilarity += c.similarity;
}
for (const s of Object.values(strategyStats)) {
  s.avgSimilarity = s.count > 0 ? Math.round((s.avgSimilarity / s.count) * 1000) / 1000 : 0;
}

// In the trace entry data, replace the simple strategies array:
data: {
  ...existingFields,
  byStrategy: strategyStats,  // { mirror: { count: 15, avgSimilarity: 0.52 }, ... }
}
```

Apply this to both the profile-based discovery path and the intent-based discovery path (they have separate trace entries around lines 473-514 and 674-698).

---

## Phase 4: User-Driven Evaluation Pagination

### Task 9: Add `remainingCandidates` and `discoveryId` to opportunity state

**Files:**
- Modify: `protocol/src/lib/protocol/states/opportunity.state.ts:156,260-262`

**Step 1: Extend operationMode**

Add `'continue_discovery'` to the operation mode union (line 156):

```typescript
// BEFORE:
operationMode: Annotation<'create' | 'create_introduction' | 'read' | 'update' | 'delete' | 'send'>({

// AFTER:
operationMode: Annotation<'create' | 'create_introduction' | 'continue_discovery' | 'read' | 'update' | 'delete' | 'send'>({
```

**Step 2: Add `remainingCandidates` annotation**

After the `candidates` annotation (line ~263), add:

```typescript
/** Candidates not yet evaluated (for pagination — cached in Redis by caller). */
remainingCandidates: Annotation<CandidateMatch[]>({
  reducer: (curr, next) => next ?? curr,
  default: () => [],
}),

/** Discovery session ID for pagination (maps to Redis cache key). */
discoveryId: Annotation<string | null>({
  reducer: (curr, next) => next ?? curr,
  default: () => null,
}),
```

---

### Task 10: Modify evaluation node to batch (25) and return remaining

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:747-757`

**Step 1: Change maxCandidates from 50 to 25**

```typescript
// BEFORE (line 747):
const maxCandidates = 50;

// AFTER:
const EVAL_BATCH_SIZE = 25;
```

**Step 2: Store remaining candidates in state return**

Replace the slice + log block (lines 747-757):

```typescript
const EVAL_BATCH_SIZE = 25;
const sortedCandidates = [...state.candidates]
  .sort((a, b) => b.similarity - a.similarity);

const batchToEvaluate = sortedCandidates.slice(0, EVAL_BATCH_SIZE);
const remaining = sortedCandidates.slice(EVAL_BATCH_SIZE);

if (remaining.length > 0) {
  logger.info('[Graph:Evaluation] Batched candidates for evaluation', {
    evaluating: batchToEvaluate.length,
    remaining: remaining.length,
    total: sortedCandidates.length,
  });
}
```

**Step 3: Update the evaluation to use `batchToEvaluate` instead of `sortedCandidates`**

Throughout the evaluation node, replace references to `sortedCandidates` with `batchToEvaluate` (the variable used in `candidateEntities` mapping at line ~782 and trace building at line ~903).

**Step 4: Return `remainingCandidates` in the node's return value**

At the return statement (line ~933), add `remainingCandidates`:

```typescript
return {
  evaluatedOpportunities: passedOpportunities,
  remainingCandidates: remaining,
  trace: traceEntries,
};
```

**Step 5: Add remaining count to evaluation trace**

In the summary trace entry (line ~891-900), add remaining info:

```typescript
data: {
  inputCandidates: batchToEvaluate.length,
  returnedFromEvaluator: evaluatedOpportunities.length,
  passedCount: passed.length,
  remaining: remaining.length,
  batchNumber: 1,  // First batch; continuation batches increment
  minScore,
  durationMs: Date.now() - startTime,
},
```

---

### Task 11: Add `continue_discovery` routing to graph

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:1696-1718,1776-1802`

**Step 1: Update `routeByMode` to handle `continue_discovery`**

```typescript
// BEFORE (line 1696-1705):
const routeByMode = (state: typeof OpportunityGraphState.State): string => {
  const mode = state.operationMode ?? 'create';
  if (mode === 'read') return 'read';
  if (mode === 'update') return 'update';
  if (mode === 'delete') return 'delete_opp';
  if (mode === 'send') return 'send';
  if (mode === 'create_introduction') return 'intro_validation';
  return 'prep';
};

// AFTER:
const routeByMode = (state: typeof OpportunityGraphState.State): string => {
  const mode = state.operationMode ?? 'create';
  if (mode === 'read') return 'read';
  if (mode === 'update') return 'update';
  if (mode === 'delete') return 'delete_opp';
  if (mode === 'send') return 'send';
  if (mode === 'create_introduction') return 'intro_validation';
  // Both 'create' and 'continue_discovery' start at prep
  return 'prep';
};
```

**Step 2: Update `shouldContinueAfterPrep` for continuation**

```typescript
// BEFORE (line 1711-1718):
const shouldContinueAfterPrep = (state: typeof OpportunityGraphState.State): string => {
  if (state.error) {
    logger.info('[Graph:Routing] Error in prep - ending early');
    return END;
  }
  logger.info('[Graph:Routing] Continuing to scope');
  return 'scope';
};

// AFTER:
const shouldContinueAfterPrep = (state: typeof OpportunityGraphState.State): string => {
  if (state.error) {
    logger.info('[Graph:Routing] Error in prep - ending early');
    return END;
  }
  // Continuation mode: skip scope/resolve/discovery, go straight to evaluation
  if (state.operationMode === 'continue_discovery') {
    logger.info('[Graph:Routing] Continue discovery → skipping to evaluation', {
      candidatesLoaded: state.candidates.length,
    });
    return 'evaluation';
  }
  logger.info('[Graph:Routing] Continuing to scope');
  return 'scope';
};
```

**Step 3: Update conditional edges map to include `evaluation`**

```typescript
// BEFORE (line 1799-1802):
.addConditionalEdges('prep', shouldContinueAfterPrep, {
  scope: 'scope',
  [END]: END,
})

// AFTER:
.addConditionalEdges('prep', shouldContinueAfterPrep, {
  scope: 'scope',
  evaluation: 'evaluation',
  [END]: END,
})
```

---

### Task 12: Add Redis caching and `continueDiscovery` to opportunity.discover.ts

**Files:**
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:33-58,190-278`

**Step 1: Add cache import and types**

At the top of the file, add:

```typescript
import { RedisCacheAdapter } from '../../../adapters/cache.adapter';
import { v4 as uuidv4 } from 'uuid';
```

**Step 2: Extend `DiscoverInput` interface**

Add an optional `cache` field (line ~33-58):

```typescript
export interface DiscoverInput {
  // ... existing fields ...
  /** Redis cache for discovery pagination. When provided, remaining candidates are cached. */
  cache?: RedisCacheAdapter;
}
```

**Step 3: Extend `DiscoverResult` interface**

Add pagination metadata (line ~120-135):

```typescript
export interface DiscoverResult {
  // ... existing fields ...
  /** Pagination metadata — present when there are more unevaluated candidates. */
  pagination?: {
    discoveryId: string;
    evaluated: number;
    remaining: number;
  };
}
```

**Step 4: Add caching after graph invocation in `runDiscoverFromQuery`**

After the graph returns (line ~248), check for remaining candidates and cache them:

```typescript
// After: const result = await opportunityGraph.invoke({...});

// Cache remaining candidates for pagination
let pagination: DiscoverResult['pagination'] | undefined;
const remaining = result.remainingCandidates || [];
if (remaining.length > 0 && input.cache) {
  const discoveryId = uuidv4();
  const cacheKey = `discovery:${userId}:${discoveryId}`;
  await input.cache.set(cacheKey, {
    candidates: remaining,
    userId,
    query: queryOrEmpty,
    indexScope,
    options,
  }, { ttl: 1800 }); // 30 minutes
  pagination = {
    discoveryId,
    evaluated: (result.candidates?.length ?? 0) - remaining.length,
    remaining: remaining.length,
  };
}
```

Include `pagination` in the return objects (add to all return paths that include `found: true`).

**Step 5: Create `continueDiscovery` function**

Add a new exported function below `runDiscoverFromQuery`:

```typescript
/**
 * Continue a paginated discovery by evaluating the next batch of cached candidates.
 * Loads candidates from Redis, invokes the opportunity graph in continue_discovery mode.
 */
export async function continueDiscovery(input: {
  opportunityGraph: CompiledOpportunityGraph;
  database: ChatGraphCompositeDatabase;
  cache: RedisCacheAdapter;
  userId: string;
  discoveryId: string;
  limit?: number;
  chatSessionId?: string;
  minimalForChat?: boolean;
}): Promise<DiscoverResult> {
  const { cache, userId, discoveryId, limit = 20, chatSessionId } = input;
  const cacheKey = `discovery:${userId}:${discoveryId}`;

  const cached = await cache.get<{
    candidates: CandidateMatch[];
    userId: string;
    query: string;
    indexScope: string[];
    options: OpportunityGraphOptions;
  }>(cacheKey);

  if (!cached) {
    return {
      found: false,
      count: 0,
      message: "Discovery session expired. Please start a new search.",
    };
  }

  const debugSteps: DiscoverDebugStep[] = [];

  const result = await input.opportunityGraph.invoke({
    userId,
    searchQuery: cached.query || undefined,
    candidates: cached.candidates,
    operationMode: 'continue_discovery' as const,
    options: {
      ...cached.options,
      limit,
      ...(chatSessionId ? { conversationId: chatSessionId } : {}),
    },
  });

  // Extract trace
  const graphTrace = result.trace || [];
  for (const t of graphTrace) {
    debugSteps.push({
      step: t.node,
      detail: t.detail,
      ...(t.data ? { data: t.data } : {}),
    });
  }

  // Update cache with remaining candidates
  const remaining = result.remainingCandidates || [];
  let pagination: DiscoverResult['pagination'] | undefined;
  if (remaining.length > 0) {
    await cache.set(cacheKey, {
      ...cached,
      candidates: remaining,
    }, { ttl: 1800 });
    pagination = {
      discoveryId,
      evaluated: cached.candidates.length - remaining.length,
      remaining: remaining.length,
    };
  } else {
    // No more candidates — delete cache
    await cache.delete(cacheKey);
  }

  // Enrich opportunities (same as runDiscoverFromQuery)
  // ... (reuse the enrichment logic from runDiscoverFromQuery — extract into shared helper if needed)

  const opportunities = result.opportunities || [];
  return {
    found: opportunities.length > 0,
    count: opportunities.length,
    opportunities,
    debugSteps,
    pagination,
  };
}
```

Note: The opportunity enrichment logic (profile lookup, presentation formatting) should be extracted from `runDiscoverFromQuery` into a shared helper to avoid duplication. Check lines ~279-onward in the file to identify the enrichment block.

---

### Task 13: Add `continueFrom` parameter to `create_opportunities` tool

**Files:**
- Modify: `protocol/src/lib/protocol/tools/opportunity.tools.ts:109-160,342-493`

**Step 1: Add `continueFrom` to the tool's Zod schema**

In the `querySchema` (line ~119), add:

```typescript
continueFrom: z
  .string()
  .optional()
  .describe("Discovery pagination: pass the discoveryId from a previous result to evaluate more candidates."),
```

**Step 2: Add continuation handling before discovery mode**

Before the discovery mode block (line ~342), add a new block:

```typescript
// ── Continuation mode ──
if (query.continueFrom) {
  const cache = new RedisCacheAdapter();
  const result = await continueDiscovery({
    opportunityGraph: graphs.opportunity as any,
    database,
    cache,
    userId: context.userId,
    discoveryId: query.continueFrom,
    limit: 20,
    minimalForChat: true,
    ...(context.sessionId ? { chatSessionId: context.sessionId } : {}),
  });

  const allDebugSteps = [...(result.debugSteps ?? [])];

  if (!result.found) {
    return success({
      found: false,
      count: 0,
      message: result.message ?? "No more matching opportunities found in the remaining candidates.",
      debugSteps: allDebugSteps,
    });
  }

  // Format opportunity blocks (same as discovery mode)
  const opportunityBlocks = (result.opportunities ?? []).map((opp) => {
    // ... same formatting as discovery mode lines 443-468 ...
  });

  const blocksText = opportunityBlocks.join("\n\n");
  let message = `Found ${result.count} more connection(s). IMPORTANT: Include the following opportunity code blocks EXACTLY as-is:\n\n${blocksText}`;

  if (result.pagination && result.pagination.remaining > 0) {
    message += `\n\nThere are ${result.pagination.remaining} more candidates I haven't evaluated yet. Ask if the user wants to see more.`;
  }

  return success({
    found: true,
    count: result.count,
    message,
    debugSteps: allDebugSteps,
    ...(result.pagination ? { pagination: result.pagination } : {}),
  });
}
```

**Step 3: Add pagination metadata to first-call discovery result**

In the existing discovery result block (lines ~485-491), add pagination:

```typescript
return success({
  found: true,
  count: result.count,
  message,
  ...(result.existingConnections?.length ? { existingConnections: result.existingConnections } : {}),
  ...(result.pagination ? { pagination: result.pagination } : {}),
  debugSteps: allDebugSteps,
});
```

**Step 4: Add "more candidates" prompt to message**

After building the message (line ~476), add:

```typescript
if (result.pagination && result.pagination.remaining > 0) {
  message += `\n\nThere are ${result.pagination.remaining} more candidates I haven't evaluated yet. Ask if the user wants to see more — they can say "show me more" and you should call create_opportunities with continueFrom="${result.pagination.discoveryId}".`;
}
```

**Step 5: Pass cache to `runDiscoverFromQuery`**

In the `runDiscoverFromQuery` call (line ~387), add the cache:

```typescript
const cache = new RedisCacheAdapter();
const result = await runDiscoverFromQuery({
  // ... existing fields ...
  cache,
});
```

**Step 6: Import `continueDiscovery`**

Add to imports at top of file:

```typescript
import { runDiscoverFromQuery, continueDiscovery } from '../support/opportunity.discover';
```

---

## Phase 5: Verification

### Task 14: Type-check and manual verification

**Step 1: Full type check**

```bash
cd protocol && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

**Step 2: Run existing tests**

```bash
cd protocol && bun test
```

Provide output to user for review.

**Step 3: Manual smoke test**

Start the dev server and test:
1. Open chat, type "find me React developers"
2. Verify trace timeline shows funnel: discovery → threshold_filter → eval_batch → persist
3. Verify durationMs and byStrategy appear in trace data
4. Verify ≤25 candidates evaluated (check trace)
5. If >25 candidates discovered, verify message mentions "N more candidates"
6. Say "show me more" — verify continuation loads from cache and evaluates next batch

---

## Summary of All Changes

| File | Change |
|------|--------|
| `protocol/src/types/chat-streaming.types.ts` | Widen `DebugMetaStep.data` → `Record<string, unknown>` |
| `protocol/src/lib/protocol/agents/chat.agent.ts` | Add `data` to `AgentStreamEvent` steps type |
| `frontend/src/contexts/AIChatContext.tsx` | Widen `ToolCallStep.data` → `Record<string, unknown>` |
| `protocol/src/lib/protocol/graphs/opportunity.graph.ts` | Unify minScore→0.40, batch eval (25), timing, per-strategy stats, continue_discovery routing |
| `protocol/src/adapters/embedder.adapter.ts` | SQL DISTINCT ON, remove overfetch multiplier, update minScore default |
| `protocol/src/lib/protocol/states/opportunity.state.ts` | Add `continue_discovery` mode, `remainingCandidates`, `discoveryId` |
| `protocol/src/lib/protocol/support/opportunity.discover.ts` | Redis caching, `continueDiscovery` function, pagination in results |
| `protocol/src/lib/protocol/tools/opportunity.tools.ts` | `continueFrom` param, continuation handling, pagination in messages |
| `frontend/src/hooks/useTypewriter.ts` | Delete (orphaned) |
