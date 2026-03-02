# Opportunity Dedup & Early Termination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix duplicate candidate evaluation (same user evaluated N times across indexes) and blind pagination (offering "show more" when no query-relevant candidates remain).

**Architecture:** Two localized changes in the opportunity graph. Fix 1 adds a userId dedup step in the evaluation node before batching. Fix 2 adds a `discoverySource` tag to `CandidateMatch`, tags all discovery paths, and skips pagination caching when remaining candidates have no query-sourced entries.

**Tech Stack:** TypeScript, LangGraph, Bun test

---

### Task 1: Add `discoverySource` field to `CandidateMatch`

**Files:**
- Modify: `protocol/src/lib/protocol/states/opportunity.state.ts:48-57`

**Step 1: Add the field**

In `CandidateMatch` interface, add after the `candidateSummary` field:

```typescript
/** How this candidate was found: 'query' (HyDE from search text) or 'profile-similarity'. */
discoverySource?: 'query' | 'profile-similarity';
```

**Step 2: Commit**

```bash
git add protocol/src/lib/protocol/states/opportunity.state.ts
git commit -m "feat(opportunity): add discoverySource field to CandidateMatch"
```

---

### Task 2: Tag discovery source in all discovery paths

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts`

There are 4 places where `CandidateMatch` objects are constructed in the discovery node. Each needs a `discoverySource` tag.

**Step 1: Tag query HyDE path (`runQueryHydeDiscovery` inner function, ~lines 786-808)**

This function builds candidates from `searchWithHydeEmbeddings` results when there's a search query. Both the intent-type and profile-type pushes inside `runQueryHydeDiscovery` should get `discoverySource: 'query'`:

In the intent-type push (~line 787-795), add `discoverySource: 'query' as const,` after `candidateSummary: undefined,`:
```typescript
allCandidates.push({
  candidateUserId: result.userId as Id<"users">,
  candidateIntentId: result.id as Id<"intents">,
  indexId: targetIndex.indexId,
  similarity: result.score,
  lens: result.matchedVia,
  candidatePayload: "",
  candidateSummary: undefined,
  discoverySource: 'query' as const,
});
```

In the profile-type push (~line 800-807), add `discoverySource: 'query' as const,` after `candidateSummary: undefined,`:
```typescript
allCandidates.push({
  candidateUserId: result.userId as Id<"users">,
  indexId: targetIndex.indexId,
  similarity: result.score,
  lens: result.matchedVia,
  candidatePayload: "",
  candidateSummary: undefined,
  discoverySource: 'query' as const,
});
```

**Step 2: Tag profile merge path (~lines 455-468)**

This is the `profileCandidates` array built when the profile+query path merges profile-similarity results. Add `discoverySource: 'profile-similarity' as const,` to the push inside the profile merge loop:

```typescript
profileCandidates.push({
  candidateUserId: result.userId as Id<"users">,
  candidateIntentId:
    result.type === "intent"
      ? (result.id as Id<"intents">)
      : undefined,
  indexId: targetIndex.indexId,
  similarity: result.score,
  lens: result.matchedVia,
  candidatePayload: "",
  candidateSummary: undefined,
  discoverySource: 'profile-similarity' as const,
});
```

**Step 3: Tag profile mirror path (no search query, ~lines 520-540)**

This path runs when `discoverySource === "profile"` and there's no search query. Both the intent and non-intent pushes need `discoverySource: 'profile-similarity' as const,`:

Intent push (~line 522-530):
```typescript
allCandidates.push({
  candidateUserId: result.userId as Id<"users">,
  candidateIntentId: result.id as Id<"intents">,
  indexId: targetIndex.indexId,
  similarity: result.score,
  lens: result.matchedVia,
  candidatePayload: "",
  candidateSummary: undefined,
  discoverySource: 'profile-similarity' as const,
});
```

Non-intent push (~line 532-539):
```typescript
allCandidates.push({
  candidateUserId: result.userId as Id<"users">,
  indexId: targetIndex.indexId,
  similarity: result.score,
  lens: result.matchedVia,
  candidatePayload: "",
  candidateSummary: undefined,
  discoverySource: 'profile-similarity' as const,
});
```

**Step 4: Commit**

```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts
git commit -m "feat(opportunity): tag candidates with discoverySource in all discovery paths"
```

---

### Task 3: Deduplicate candidates by userId in evaluation node

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:934-941`
- Test: `protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`

**Step 1: Write failing test**

Add a new describe block in `opportunity.graph.spec.ts` after the "Discovery node" describe:

```typescript
describe('Evaluation node: userId dedup', () => {
  test('when same user appears via multiple indexes, evaluates them only once (deduped by userId)', async () => {
    const { compiledGraph, mockEmbedder } = createMockGraph({
      getUserIndexIds: () => Promise.resolve(['idx-1', 'idx-2'] as Id<'indexes'>[]),
      getIndex: (id: string) => Promise.resolve({ id, title: `Index ${id}` }),
      getIndexMemberCount: () => Promise.resolve(5),
      evaluatorResult: [
        {
          reasoning: 'Bob is a great match.',
          score: 88,
          actors: [
            { userId: 'user-source', role: 'patient' as const, intentId: null },
            { userId: 'user-bob', role: 'agent' as const, intentId: null },
          ],
        },
      ],
    });

    // Same user appears in two indexes from search results
    spyOn(mockEmbedder, 'searchWithHydeEmbeddings').mockResolvedValue([
      { type: 'intent' as const, id: 'intent-bob-1', userId: 'user-bob', score: 0.9, matchedVia: 'mirror' as const, indexId: 'idx-1' },
      { type: 'intent' as const, id: 'intent-bob-2', userId: 'user-bob', score: 0.85, matchedVia: 'mirror' as const, indexId: 'idx-2' },
    ]);

    const result = (await compiledGraph.invoke({
      userId: 'user-source' as Id<'users'>,
      searchQuery: 'co-founder',
      options: { minScore: 70 },
    } as OpportunityGraphInvokeInput)) as OpportunityGraphInvokeResult;

    // Should have deduped to 1 candidate (user-bob), not 2
    // The trace should show only 1 candidate entry for user-bob
    const candidateTraceEntries = result.trace.filter(
      (t: { node: string; data?: Record<string, unknown> }) =>
        t.node === 'candidate' && t.data?.userId === 'user-bob'
    );
    expect(candidateTraceEntries.length).toBe(1);
    expect(result.opportunities.length).toBe(1);
  });
});
```

**Step 2: Verify test fails**

Run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: FAIL — `candidateTraceEntries.length` will be 2 (one per index).

**Step 3: Implement dedup**

In the evaluation node (~line 935-941), after sorting and before slicing, add userId dedup:

Replace:
```typescript
const EVAL_BATCH_SIZE = 25;
const sortedCandidates = [...state.candidates].sort(
  (a, b) => b.similarity - a.similarity,
);

const batchToEvaluate = sortedCandidates.slice(0, EVAL_BATCH_SIZE);
const remaining = sortedCandidates.slice(EVAL_BATCH_SIZE);
```

With:
```typescript
const EVAL_BATCH_SIZE = 25;
const sortedCandidates = [...state.candidates].sort(
  (a, b) => b.similarity - a.similarity,
);

// Dedup by userId — keep the entry with highest similarity (first after sort)
const seenUserIds = new Set<string>();
const dedupedCandidates = sortedCandidates.filter((c) => {
  if (seenUserIds.has(c.candidateUserId)) return false;
  seenUserIds.add(c.candidateUserId);
  return true;
});

if (dedupedCandidates.length < sortedCandidates.length) {
  logger.info("[Graph:Evaluation] Deduped candidates by userId", {
    before: sortedCandidates.length,
    after: dedupedCandidates.length,
    removed: sortedCandidates.length - dedupedCandidates.length,
  });
}

const batchToEvaluate = dedupedCandidates.slice(0, EVAL_BATCH_SIZE);
const remaining = dedupedCandidates.slice(EVAL_BATCH_SIZE);
```

**Step 4: Verify test passes**

Run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts
git commit -m "fix(opportunity): deduplicate candidates by userId before evaluation batching"
```

---

### Task 4: Early termination when query candidates exhausted

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts` (evaluation node, after computing `remaining`)
- Test: `protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`

**Step 1: Write failing test**

Add to `opportunity.graph.spec.ts`:

```typescript
describe('Evaluation node: early termination', () => {
  test('when search is query-driven and remaining candidates have no query-sourced entries, remainingCandidates is empty', async () => {
    // Create 30 candidates: 5 from query, 25 from profile-similarity
    // With EVAL_BATCH_SIZE=25, batch 1 gets all 5 query + 20 profile
    // Remaining 5 are all profile-similarity → should be cleared
    const queryCandidates = Array.from({ length: 5 }, (_, i) => ({
      type: 'intent' as const,
      id: `intent-query-${i}`,
      userId: `user-query-${i}`,
      score: 0.9 - i * 0.01,
      matchedVia: 'Painters' as const,
      indexId: 'idx-1',
    }));
    const profileCandidates = Array.from({ length: 25 }, (_, i) => ({
      type: 'profile' as const,
      id: `user-profile-${i}`,
      userId: `user-profile-${i}`,
      score: 0.6 - i * 0.005,
      matchedVia: 'profile-similarity' as const,
      indexId: 'idx-1',
    }));

    const { compiledGraph, mockEmbedder } = createMockGraph({
      evaluatorResult: [],
    });

    spyOn(mockEmbedder, 'searchWithHydeEmbeddings').mockResolvedValue([
      ...queryCandidates,
      ...profileCandidates,
    ]);

    const result = (await compiledGraph.invoke({
      userId: 'user-source' as Id<'users'>,
      searchQuery: 'painters',
      options: { minScore: 50 },
    } as OpportunityGraphInvokeInput)) as OpportunityGraphInvokeResult;

    // All query candidates consumed in batch 1, remaining are profile-only
    // Early termination should clear remainingCandidates
    expect(result.remainingCandidates.length).toBe(0);
  });

  test('when remaining candidates still have query-sourced entries, remainingCandidates is preserved', async () => {
    // Create 30 query candidates — after batch of 25, 5 remain with discoverySource='query'
    const allQueryCandidates = Array.from({ length: 30 }, (_, i) => ({
      type: 'intent' as const,
      id: `intent-q-${i}`,
      userId: `user-q-${i}`,
      score: 0.95 - i * 0.01,
      matchedVia: 'Painters' as const,
      indexId: 'idx-1',
    }));

    const { compiledGraph, mockEmbedder } = createMockGraph({
      evaluatorResult: [],
    });

    spyOn(mockEmbedder, 'searchWithHydeEmbeddings').mockResolvedValue(allQueryCandidates);

    const result = (await compiledGraph.invoke({
      userId: 'user-source' as Id<'users'>,
      searchQuery: 'painters',
      options: { minScore: 50 },
    } as OpportunityGraphInvokeInput)) as OpportunityGraphInvokeResult;

    // 5 query-sourced candidates remain — pagination should be preserved
    expect(result.remainingCandidates.length).toBe(5);
  });
});
```

**Step 2: Verify test fails**

Run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: First test FAIL — `remainingCandidates.length` will be 5 (not cleared). Second test should pass already.

**Step 3: Implement early termination**

In the evaluation node, after computing `remaining` (after the dedup block from Task 3), add the early termination check:

After:
```typescript
const batchToEvaluate = dedupedCandidates.slice(0, EVAL_BATCH_SIZE);
const remaining = dedupedCandidates.slice(EVAL_BATCH_SIZE);
```

Add:
```typescript
// Early termination: if search was query-driven and no query-sourced candidates remain,
// clear remaining to prevent pointless pagination through profile-similarity leftovers
const isQueryDriven = !!state.searchQuery?.trim();
const queryRemaining = remaining.filter(
  (c) => c.discoverySource === 'query',
);
const effectiveRemaining =
  isQueryDriven && queryRemaining.length === 0 ? [] : remaining;

if (isQueryDriven && remaining.length > 0 && queryRemaining.length === 0) {
  logger.info(
    "[Graph:Evaluation] Early termination: no query-sourced candidates remain",
    {
      droppedProfileCandidates: remaining.length,
    },
  );
}
```

Then update all references to `remaining` below this point to use `effectiveRemaining`. There are 3 places:

1. The `remaining.length > 0` log (~line 943): change to `effectiveRemaining.length > 0`
2. The `remaining: remaining.length` in trace data (~line 1157): change to `remaining: effectiveRemaining.length`
3. The `remainingCandidates: remaining` in the return (~line 1203): change to `remainingCandidates: effectiveRemaining`

**Step 4: Verify tests pass**

Run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts
git commit -m "fix(opportunity): skip pagination when no query-sourced candidates remain"
```

---

### Task 5: Verify all existing tests still pass

**Step 1: Run the full opportunity graph test suite**

Run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: All tests PASS (existing + new)

**Step 2: Run the opportunity discover spec to check nothing broke in the pagination layer**

Run: `cd protocol && bun test src/lib/protocol/support/tests/opportunity.discover.spec.ts`
Expected: All tests PASS

**Step 3: Commit all changes (if any fixups needed)**

Only if test failures required fixes. Otherwise this task is just verification.
