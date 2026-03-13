# Introducer Discovery Flow (IND-140) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user asks "who should I introduce to @Person", discover matches for that person and present them as introduction cards where the current user is the introducer.

**Architecture:** Add an `onBehalfOfUserId` parameter that flows through the discovery pipeline (state → prep → evaluation → persist → enrichment → card formatting). When set, prep fetches the target user's intents/profile instead of the current user's, evaluation uses the target as the source entity, persist assigns the current user as `introducer` actor, and enrichment/card formatting returns `viewerRole: "introducer"` with dual-party headlines. The chat prompt gets a new Pattern 6a for "discover for introduction."

**Tech Stack:** TypeScript, LangGraph, Zod, bun:test

**Root cause:** Discovery mode always treats `state.userId` as a party. There's no concept of "discovering on behalf of another user." The `create_introduction` mode requires both parties to be known upfront, creating a gap for the "discover who to introduce to @Person" scenario.

**Key design decisions:**
- `discovererId` in the evaluator should be set to `onBehalfOfUserId` (the target user), not `state.userId`. The evaluator uses `discovererId` to mask the source user's name in the prompt (line 399 of `opportunity.evaluator.ts`). The target user IS the source for discovery purposes.
- `getUserIndexIds` in prep still uses `state.userId` (the introducer) — their memberships gate which indexes can be searched.
- `getUser(state.userId)` call in persist for introducer name is fetched once before the loop, not inside it.
- Frontend `OpportunityCardInChat.tsx` already handles `viewerRole === "introducer"` (line 283) — no frontend changes needed.

---

## Chunk 1: State + Graph Layer (onBehalfOfUserId threading)

### Task 1: Add `onBehalfOfUserId` to opportunity graph state

**Files:**
- Modify: `protocol/src/lib/protocol/states/opportunity.state.ts:144-148`

- [ ] **Step 1: Add onBehalfOfUserId annotation**

After the `targetUserId` annotation (line 148), add:

```typescript
/** Optional: discover on behalf of this user (introducer flow). When set, prep/eval use this user's profile/intents; userId becomes the introducer. */
onBehalfOfUserId: Annotation<Id<'users'> | undefined>({
  reducer: (curr, next) => next ?? curr,
  default: () => undefined,
}),
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/states/opportunity.state.ts
git commit -m "feat(opportunity): add onBehalfOfUserId to graph state annotation"
```

### Task 2: Update test helper + thread `onBehalfOfUserId` through prep node

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts:46-128`
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:112-167` (prepNode)

The existing `createMockGraph` helper has limitations that need fixing for these tests:
1. Returns `compiledGraph` (not `graph`) — all new tests must use `compiledGraph`
2. `getProfile` is a static value, not a function — needs overriding to accept a function for userId-dependent returns
3. `getActiveIntents` takes no args — needs overriding similarly

- [ ] **Step 1: Extend `createMockGraph` to support function overrides**

Add an extended helper below `createMockGraph` in the test file:

```typescript
/**
 * Extended mock graph builder that accepts function overrides for getProfile and getActiveIntents.
 * Used by onBehalfOfUserId tests that need userId-dependent mock responses.
 */
function createMockGraphWithFnOverrides(deps: {
  getProfileFn?: (userId: string) => Promise<ProfileDocument | null>;
  getActiveIntentsFn?: (userId: string) => Promise<Array<{ id: Id<'intents'>; payload: string; summary: string | null; createdAt: Date }>>;
  evaluatorResult?: EvaluatedOpportunityWithActors[];
  getUserIndexIds?: () => Promise<Id<'indexes'>[]>;
}) {
  const mockDb: OpportunityGraphDatabase = {
    getProfile: deps.getProfileFn ?? (() => Promise.resolve(null)),
    createOpportunity: (data) =>
      Promise.resolve({
        id: 'opp-1',
        detection: data.detection,
        actors: data.actors,
        interpretation: data.interpretation,
        context: data.context,
        confidence: data.confidence,
        status: data.status ?? 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      }),
    opportunityExistsBetweenActors: () => Promise.resolve(false),
    getOpportunityBetweenActors: () => Promise.resolve(null),
    findOverlappingOpportunities: () => Promise.resolve([]),
    getUserIndexIds: deps.getUserIndexIds ?? (() => Promise.resolve(['idx-1'] as Id<'indexes'>[])),
    getActiveIntents:
      deps.getActiveIntentsFn ??
      (() =>
        Promise.resolve([{
          id: 'intent-1' as Id<'intents'>,
          payload: 'Looking for a technical co-founder',
          summary: 'Co-founder',
          createdAt: new Date(),
        }])),
    getIndex: () => Promise.resolve({ id: 'idx-1', title: 'Test Index' }),
    getIndexMemberCount: () => Promise.resolve(2),
    getIndexIdsForIntent: () => Promise.resolve(['idx-1']),
    getUser: (_userId: string) => Promise.resolve({ id: _userId, name: 'Test User', email: 'test@example.com' }),
    isIndexMember: () => Promise.resolve(true),
    getOpportunity: () => Promise.resolve(null),
    getOpportunitiesForUser: () => Promise.resolve([]),
    updateOpportunityStatus: () => Promise.resolve(null),
    getIntent: () => Promise.resolve(null),
    getContactUserIds: () => Promise.resolve([]),
  };

  const dummyEmbedding = new Array(2000).fill(0.1);
  const mockEmbedder: Embedder = {
    generate: () => Promise.resolve(dummyEmbedding),
    search: () => Promise.resolve([]),
    searchWithHydeEmbeddings: () =>
      Promise.resolve([{
        type: 'intent' as const,
        id: 'intent-bob' as Id<'intents'>,
        userId: 'user-bob',
        score: 0.9,
        matchedVia: 'mirror' as const,
        indexId: 'idx-1',
      }]),
    searchWithProfileEmbedding: () => Promise.resolve([]),
  } as unknown as Embedder;

  const mockHydeGenerator = {
    invoke: () =>
      Promise.resolve({
        hydeEmbeddings: { mirror: dummyEmbedding, reciprocal: dummyEmbedding },
      }),
  };

  const evaluator = createMockEvaluator(deps.evaluatorResult ?? defaultMockEvaluatorResult);
  const queueNotification = async () => undefined;
  const factory = new OpportunityGraphFactory(mockDb, mockEmbedder, mockHydeGenerator, evaluator, queueNotification);
  const compiledGraph = factory.createGraph();
  return { compiledGraph, mockDb };
}
```

- [ ] **Step 2: Write the failing test for prep node**

Add a new describe block after the existing `create_introduction path` tests:

```typescript
describe('onBehalfOfUserId (introducer discovery) path', () => {
  const onBehalfUserId = 'user-target' as Id<'users'>;

  test('prep node fetches target user profile and intents when onBehalfOfUserId is set', async () => {
    const getProfileCalls: string[] = [];
    const getActiveIntentsCalls: string[] = [];

    const { compiledGraph } = createMockGraphWithFnOverrides({
      getProfileFn: async (userId: string) => {
        getProfileCalls.push(userId);
        if (userId === onBehalfUserId) {
          return {
            embedding: dummyEmbedding,
            identity: { name: 'Target User', bio: 'Target bio' },
            narrative: { context: 'Target context' },
            attributes: { skills: ['skill-a'], interests: ['interest-a'] },
          } as ProfileDocument;
        }
        return null;
      },
      getActiveIntentsFn: async (userId: string) => {
        getActiveIntentsCalls.push(userId);
        if (userId === onBehalfUserId) {
          return [{
            id: 'intent-target' as Id<'intents'>,
            payload: 'Target intent payload',
            summary: 'Target summary',
            createdAt: new Date(),
          }];
        }
        return [];
      },
    });

    await compiledGraph.invoke({
      userId: 'user-source' as Id<'users'>,
      onBehalfOfUserId: onBehalfUserId,
      searchQuery: 'find collaborators',
      options: { limit: 1 },
    });

    // Prep should have fetched the target user's profile and intents
    expect(getProfileCalls).toContain(onBehalfUserId);
    expect(getActiveIntentsCalls).toContain(onBehalfUserId);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: FAIL — prep fetches `state.userId`, not `onBehalfOfUserId`

- [ ] **Step 4: Modify prep node to use onBehalfOfUserId**

In `opportunity.graph.ts` prepNode (lines 132-134), change:

```typescript
// Before:
const [intents, profile] = await Promise.all([
  this.database.getActiveIntents(state.userId),
  this.database.getProfile(state.userId),
]);

// After:
const discoveryUserId = state.onBehalfOfUserId ?? state.userId;
const [intents, profile] = await Promise.all([
  this.database.getActiveIntents(discoveryUserId),
  this.database.getProfile(discoveryUserId),
]);
```

`getUserIndexIds` (line 123) stays as `state.userId` — the introducer's memberships gate index access.

- [ ] **Step 5: Run test to verify it passes**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts
git commit -m "feat(opportunity): prep node fetches target user data when onBehalfOfUserId is set"
```

### Task 3: Thread `onBehalfOfUserId` through evaluation node

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:871-938` (evaluation node)

The evaluation node builds a `sourceEntity` from `state.userId`. When `onBehalfOfUserId` is set, the source entity should use the target user's profile, and `discovererId` should be set to the target user (since the evaluator masks the discoverer's name at line 399 of `opportunity.evaluator.ts` — the target IS the source for discovery purposes).

- [ ] **Step 1: Write the failing test**

Add to the `onBehalfOfUserId` describe block. Since we need to capture evaluator input, create a new helper that accepts a custom evaluator:

```typescript
  test('evaluation node uses target user as source entity when onBehalfOfUserId is set', async () => {
    let capturedInput: any = null;
    const capturingEvaluator: OpportunityEvaluatorLike = {
      invokeEntityBundle: async (input: any) => {
        capturedInput = input;
        return defaultMockEvaluatorResult;
      },
    };

    // Build graph manually with the capturing evaluator
    const mockDb: OpportunityGraphDatabase = {
      getProfile: async (userId: string) => {
        if (userId === onBehalfUserId) {
          return {
            embedding: dummyEmbedding,
            identity: { name: 'Target User', bio: 'Target bio' },
          } as ProfileDocument;
        }
        return { embedding: dummyEmbedding, identity: { name: 'Source User' } } as ProfileDocument;
      },
      createOpportunity: (data) => Promise.resolve({
        id: 'opp-1', detection: data.detection, actors: data.actors,
        interpretation: data.interpretation, context: data.context,
        confidence: data.confidence, status: data.status ?? 'pending',
        createdAt: new Date(), updatedAt: new Date(), expiresAt: null,
      }),
      opportunityExistsBetweenActors: () => Promise.resolve(false),
      getOpportunityBetweenActors: () => Promise.resolve(null),
      findOverlappingOpportunities: () => Promise.resolve([]),
      getUserIndexIds: () => Promise.resolve(['idx-1'] as Id<'indexes'>[]),
      getActiveIntents: async (userId: string) => [{
        id: 'intent-1' as Id<'intents'>,
        payload: userId === onBehalfUserId ? 'Target intent' : 'Source intent',
        summary: null, createdAt: new Date(),
      }],
      getIndex: () => Promise.resolve({ id: 'idx-1', title: 'Test Index' }),
      getIndexMemberCount: () => Promise.resolve(2),
      getIndexIdsForIntent: () => Promise.resolve(['idx-1']),
      getUser: (_id: string) => Promise.resolve({ id: _id, name: 'User', email: 'u@e.com' }),
      isIndexMember: () => Promise.resolve(true),
      getOpportunity: () => Promise.resolve(null),
      getOpportunitiesForUser: () => Promise.resolve([]),
      updateOpportunityStatus: () => Promise.resolve(null),
      getIntent: () => Promise.resolve(null),
      getContactUserIds: () => Promise.resolve([]),
    };
    const mockEmbedder = {
      generate: () => Promise.resolve(dummyEmbedding),
      search: () => Promise.resolve([]),
      searchWithHydeEmbeddings: () => Promise.resolve([{
        type: 'intent' as const, id: 'intent-bob' as Id<'intents'>,
        userId: 'user-bob', score: 0.9, matchedVia: 'mirror' as const, indexId: 'idx-1',
      }]),
      searchWithProfileEmbedding: () => Promise.resolve([]),
    } as unknown as Embedder;
    const mockHyde = { invoke: () => Promise.resolve({ hydeEmbeddings: { mirror: dummyEmbedding, reciprocal: dummyEmbedding } }) };
    const factory = new OpportunityGraphFactory(mockDb, mockEmbedder, mockHyde, capturingEvaluator, async () => undefined);
    const compiledGraph = factory.createGraph();

    await compiledGraph.invoke({
      userId: 'user-source' as Id<'users'>,
      onBehalfOfUserId: onBehalfUserId,
      searchQuery: 'find collaborators',
    });

    expect(capturedInput).not.toBeNull();
    expect(capturedInput.discovererId).toBe(onBehalfUserId);
    const sourceEntity = capturedInput.entities?.find((e: any) => e.userId === onBehalfUserId);
    expect(sourceEntity).toBeDefined();
    expect(sourceEntity?.profile?.name).toBe('Target User');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: FAIL — discovererId still equals `user-source`

- [ ] **Step 3: Modify evaluation node**

In `opportunity.graph.ts` evaluation node, apply three changes:

```typescript
// Line 872 — change:
const sourceProfile = await this.database.getProfile(state.userId);
// to:
const discoveryUserId = state.onBehalfOfUserId ?? state.userId;
const sourceProfile = await this.database.getProfile(discoveryUserId);

// Line 874 — change:
const sourceEntity: EvaluatorEntity = {
  userId: state.userId,
// to:
const sourceEntity: EvaluatorEntity = {
  userId: discoveryUserId,

// Line 934 — change:
const input: EvaluatorInput = {
  discovererId: state.userId,
// to:
const input: EvaluatorInput = {
  discovererId: discoveryUserId,
```

- [ ] **Step 4: Run test to verify it passes**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts
git commit -m "feat(opportunity): evaluation node uses target user when onBehalfOfUserId is set"
```

### Task 4: Thread `onBehalfOfUserId` through persist node

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts:1340-1480` (persistNode, discovery path)

When `onBehalfOfUserId` is set in discovery mode, the persist node must:
1. Keep the evaluator's actors (target user + candidate) as parties
2. Add `state.userId` (the introducer) as an `introducer` actor
3. Set detection source to `manual` with introducer metadata
4. Dedup against existing opportunities between target + candidate (not introducer + candidate)

Note: `getUser` exists on `OpportunityGraphDatabase` (line 87 of test file confirms mock). Fetch introducer name once before the persist loop.

- [ ] **Step 1: Write the failing test**

Add to the `onBehalfOfUserId` describe block:

```typescript
  test('persist node assigns userId as introducer actor when onBehalfOfUserId is set', async () => {
    const { compiledGraph } = createMockGraphWithFnOverrides({
      getProfileFn: async (userId: string) => ({
        embedding: dummyEmbedding,
        identity: { name: userId === onBehalfUserId ? 'Target User' : 'Bob' },
      } as ProfileDocument),
      evaluatorResult: [{
        reasoning: 'Great match for target user.',
        score: 85,
        actors: [
          { userId: onBehalfUserId, role: 'patient' as const, intentId: null },
          { userId: 'user-bob', role: 'agent' as const, intentId: null },
        ],
      }],
    });

    const result = await compiledGraph.invoke({
      userId: 'user-source' as Id<'users'>,
      onBehalfOfUserId: onBehalfUserId,
      searchQuery: 'find collaborators',
      options: { limit: 1 },
    });

    expect(result.opportunities.length).toBeGreaterThan(0);
    const opp = result.opportunities[0];
    const introducerActor = opp.actors.find((a: OpportunityActor) => a.role === 'introducer');
    const targetActor = opp.actors.find((a: OpportunityActor) => a.userId === onBehalfUserId);

    expect(introducerActor).toBeDefined();
    expect(introducerActor!.userId).toBe('user-source');
    expect(targetActor).toBeDefined();
    expect(targetActor!.role).not.toBe('introducer');
    expect(opp.detection?.source).toBe('manual');
  });
}); // end of onBehalfOfUserId describe block
```

- [ ] **Step 2: Run test to verify it fails**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: FAIL — persist treats userId as party, no introducer actor

- [ ] **Step 3: Modify persist node for onBehalfOfUserId**

In `opportunity.graph.ts` persistNode, add an `onBehalfOfUserId` branch between the `introductionContext` branch (line 1352) and the standard discovery branch (line 1401).

**First**, fetch the introducer user name ONCE before the persist loop (add before the `for` loop at line 1340):

```typescript
// Fetch introducer name once (outside loop) for onBehalfOfUserId path
const introducerUserForOnBehalf = state.onBehalfOfUserId
  ? await this.database.getUser(state.userId)
  : null;
```

**Then**, add the new branch:

```typescript
} else if (state.onBehalfOfUserId) {
  // Introducer discovery path: userId is the introducer, onBehalfOfUserId is a party.
  // Evaluator returned actors with onBehalfOfUserId as the source — keep those,
  // and add userId as introducer.
  const evaluatorActors: OpportunityActor[] = evaluated.actors.map((a: EvaluatedOpportunityActor) => ({
    indexId: a.indexId ?? indexIdForActors,
    userId: a.userId,
    role: a.role,
    ...(a.intentId ? { intent: a.intentId } : {}),
  }));
  const viewerAlreadyInActors = evaluatorActors.some(a => a.userId === state.userId);
  actors = viewerAlreadyInActors
    ? evaluatorActors
    : [
        ...evaluatorActors,
        { indexId: indexIdForActors!, userId: state.userId, role: 'introducer' as const },
      ];

  // Dedup: check between target + candidate (not introducer + candidate)
  const candidateUserId = evaluated.actors.find((a) => a.userId !== state.onBehalfOfUserId)?.userId;
  const overlapping = candidateUserId
    ? await this.database.findOverlappingOpportunities(
        [state.onBehalfOfUserId as Id<'users'>, candidateUserId as Id<'users'>],
        { excludeStatuses: DEDUP_SKIP_STATUSES },
      )
    : [];
  if (overlapping.length > 0) {
    const existing = overlapping[0];
    if (existing.status === 'expired') {
      const reactivated = await this.database.updateOpportunityStatus(existing.id, 'draft');
      if (reactivated) reactivatedOpportunities.push(reactivated);
    } else if (candidateUserId) {
      existingBetweenActors.push({
        candidateUserId: candidateUserId as Id<'users'>,
        indexId: (state.indexId ?? indexIdForActors ?? '') as Id<'indexes'>,
        existingOpportunityId: existing.id as Id<'opportunities'>,
        existingStatus: existing.status,
      });
    }
    continue;
  }

  data = {
    detection: {
      source: 'manual',
      createdBy: state.userId,
      createdByName: introducerUserForOnBehalf?.name ?? undefined,
      timestamp: now,
    },
    actors,
    interpretation: {
      category: 'collaboration',
      reasoning: evaluated.reasoning,
      confidence: evaluated.score / 100,
      signals: [{
        type: 'curator_judgment',
        weight: 1,
        detail: `Discovery on behalf of another user by ${introducerUserForOnBehalf?.name ?? 'a member'} via chat`,
      }],
    },
    context: {
      indexId: state.indexId ?? indexIdForActors,
      ...(state.options.conversationId ? { conversationId: state.options.conversationId } : {}),
    },
    confidence: String(evaluated.score / 100),
    status: initialStatus,
  };
} else {
  // Existing discovery path (unchanged) ...
```

- [ ] **Step 4: Run test to verify it passes**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`

- [ ] **Step 5: Run ALL existing graph tests to verify no regressions**

Ask user to run: `cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts protocol/src/lib/protocol/graphs/tests/opportunity.graph.spec.ts
git commit -m "feat(opportunity): persist node creates introducer actor when onBehalfOfUserId is set"
```

## Chunk 2: Discover + Tools + Prompt Layer

### Task 5: Thread `onBehalfOfUserId` through `runDiscoverFromQuery` and fix enrichment

**Files:**
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:33-64` (DiscoverInput)
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:279-308` (minimal path in enrichOpportunities)
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:359-384` (narrator chip in enrichOpportunities)
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:414-420` (CachedDiscoverySession)
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:430-519` (runDiscoverFromQuery)
- Modify: `protocol/src/lib/protocol/support/opportunity.discover.ts:682-739` (continueDiscovery)

- [ ] **Step 1: Add `onBehalfOfUserId` to `DiscoverInput`**

In `opportunity.discover.ts`, add to the `DiscoverInput` interface (after `targetUserId`, line 45):

```typescript
/** When set, discover on behalf of this user (introducer flow). The caller (userId) becomes the introducer. */
onBehalfOfUserId?: string;
```

- [ ] **Step 2: Add `onBehalfOfUserId` to `CachedDiscoverySession`**

In `CachedDiscoverySession` (line 414-420), add:

```typescript
interface CachedDiscoverySession {
  candidates: CandidateMatch[];
  userId: string;
  onBehalfOfUserId?: string;  // <-- add
  query: string;
  indexScope: string[];
  options: OpportunityGraphOptions;
}
```

- [ ] **Step 3: Pass `onBehalfOfUserId` to graph invoke and cache**

In `runDiscoverFromQuery` (line 430-519):

```typescript
// Add to destructuring (after targetUserId):
onBehalfOfUserId,

// Pass to graph invoke (line 475):
const result = await opportunityGraph.invoke({
  userId,
  onBehalfOfUserId,  // <-- add
  searchQuery: queryOrEmpty || undefined,
  // ... rest unchanged
});

// Add to cache (line 513-519):
await input.cache.set(cacheKey, {
  candidates: remainingCandidates,
  userId,
  onBehalfOfUserId,  // <-- add
  query: queryOrEmpty,
  indexScope,
  options,
} satisfies CachedDiscoverySession, { ttl: 1800 });
```

- [ ] **Step 4: Pass `onBehalfOfUserId` in `continueDiscovery`**

In `continueDiscovery` graph invoke (line 729-739):

```typescript
const result = await opportunityGraph.invoke({
  userId,
  onBehalfOfUserId: cached.onBehalfOfUserId,  // <-- add
  searchQuery: cached.query || undefined,
  candidates: cached.candidates,
  operationMode: 'continue_discovery' as const,
  options: { ...cached.options, limit, ...(chatSessionId ? { conversationId: chatSessionId } : {}) },
});
```

And in the cache update (line 767-770):

```typescript
await cache.set(cacheKey, {
  ...cached,
  candidates: remaining,
} satisfies CachedDiscoverySession, { ttl: 1800 });
```

This already spreads `cached` which includes `onBehalfOfUserId`. No change needed here.

- [ ] **Step 5: Fix minimal path enrichment for introducer cards**

In `enrichOpportunities`, the minimal path (lines 279-308) always produces standard card labels. Fix it to produce introducer-specific labels when the viewer is the introducer:

```typescript
// In the minimal path (lines 285-305), replace with:
homeCardPresentations = baseEnriched.map((item) => {
  const name = counterpartName(item)?.trim();
  const reasoning = item.opportunity.interpretation?.reasoning ?? "";
  const introducerName = item.opportunity.detection?.createdByName ?? undefined;
  const viewerIsIntroducer = item.opportunity.actors.some(
    (a) => a.role === "introducer" && a.userId === userId,
  );

  // For introducer view, find the second party (target user) name
  let secondPartyName: string | undefined;
  if (viewerIsIntroducer) {
    const otherPartyActors = item.opportunity.actors.filter(
      (a) => a.role !== "introducer" && a.userId !== item.candidateUserId,
    );
    if (otherPartyActors.length > 0) {
      const otherUserId = otherPartyActors[0].userId;
      secondPartyName = nameByUserId.get(otherUserId) ?? undefined;
    }
  }

  return {
    headline: viewerIsIntroducer && secondPartyName
      ? `${name} → ${secondPartyName}`
      : (name ? `Connection with ${name}` : "Suggested connection"),
    personalizedSummary:
      viewerCentricCardSummary(reasoning, name, MINIMAL_MAIN_TEXT_MAX_CHARS, viewerName, introducerName),
    suggestedAction: "Start a conversation to connect.",
    narratorRemark: narratorRemarkFromReasoning(reasoning, name, viewerName),
    primaryActionLabel: viewerIsIntroducer ? "Introduce Them" : "Start Chat",
    secondaryActionLabel: "Skip",
    mutualIntentsLabel: "Suggested connection",
  };
});
```

- [ ] **Step 6: Fix narrator chip for viewer-as-introducer**

In `enrichOpportunities` narrator chip logic (lines 364-383), add a check for when the viewer IS the introducer:

```typescript
// Replace lines 364-383 with:
let narratorChip: FormattedDiscoveryCandidate["narratorChip"];
if (homeCard) {
  const viewerIsIntroducer = item.opportunity.actors.some(
    (a) => a.role === "introducer" && a.userId === userId,
  );
  if (viewerIsIntroducer) {
    narratorChip = {
      name: "You",
      text: homeCard.narratorRemark,
      userId: userId,
    };
  } else {
    const introducerActor = item.opportunity.actors.find(
      (a) => a.role === "introducer" && a.userId !== userId,
    );
    if (introducerActor && ctx?.introducerName) {
      narratorChip = {
        name: ctx.introducerName,
        text: homeCard.narratorRemark,
        userId: introducerActor.userId,
        avatar: avatarByUserId.get(introducerActor.userId) ?? null,
      };
    } else {
      narratorChip = {
        name: "Index",
        text: homeCard.narratorRemark,
      };
    }
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add protocol/src/lib/protocol/support/opportunity.discover.ts
git commit -m "feat(opportunity): thread onBehalfOfUserId through discover + fix enrichment for introducer cards"
```

### Task 6: Add `introTargetUserId` to `create_opportunities` tool

**Files:**
- Modify: `protocol/src/lib/protocol/tools/opportunity.tools.ts:121-630`
- Test: `protocol/src/lib/protocol/tools/tests/opportunity.tools.spec.ts`

Since the enrichment layer (Task 5) now handles introducer-specific card formatting, the tool's card formatting code only needs to pass through the enrichment data — no inline overrides needed.

- [ ] **Step 1: Write the test for `buildMinimalOpportunityCard` with introducer**

Add a new describe block in `opportunity.tools.spec.ts`:

```typescript
describe('buildMinimalOpportunityCard - introducer discovery (IND-140)', () => {
  const mockIntroducerOpp = {
    id: 'opp-intro-disc',
    status: 'draft',
    interpretation: {
      reasoning: 'Target User and Bob share interest in AI infrastructure.',
      confidence: 0.85,
    },
    actors: [
      { userId: 'target-user', role: 'patient' },
      { userId: 'user-bob', role: 'agent' },
      { userId: 'introducer-user', role: 'introducer' },
    ],
    detection: { source: 'manual', createdByName: 'Introducer Name' },
  } as unknown as Opportunity;

  it('should return viewerRole "introducer" when viewer is the introducer', () => {
    const card = buildMinimalOpportunityCard(
      mockIntroducerOpp,
      'introducer-user',
      'target-user',
      'Target User',
      null,
      undefined,
      null,
      'Introducer Name',
      'Bob',
    );
    expect(card.viewerRole).toBe('introducer');
    expect(card.primaryActionLabel).toBe('Introduce Them');
    expect(card.headline).toBe('Target User → Bob');
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (should already work — `buildMinimalOpportunityCard` handles introducer role)

Ask user to run: `cd protocol && bun test src/lib/protocol/tools/tests/opportunity.tools.spec.ts`
Expected: PASS

- [ ] **Step 3: Add `introTargetUserId` to the tool's query schema**

In `opportunity.tools.ts`, add to the `querySchema` (after `targetUserId`, around line 156):

```typescript
introTargetUserId: z
  .string()
  .optional()
  .describe(
    "Introducer discovery mode: find matches FOR this user ID (the current user becomes the introducer). " +
    "Use when the user asks 'who should I introduce to @Person'. " +
    "Do NOT combine with partyUserIds (that's full introduction mode)."
  ),
```

- [ ] **Step 4: Thread `introTargetUserId` to discovery mode**

In the discovery mode section (around line 499-512), pass `onBehalfOfUserId`:

```typescript
const result = await runDiscoverFromQuery({
  opportunityGraph: graphs.opportunity,
  database,
  userId: context.userId,
  query: searchQuery,
  indexScope,
  limit: 20,
  minimalForChat: true,
  triggerIntentId,
  targetUserId: query.targetUserId?.trim() || undefined,
  onBehalfOfUserId: query.introTargetUserId?.trim() || undefined,  // <-- add
  cache,
  ...(context.sessionId ? { chatSessionId: context.sessionId } : {}),
  contactsOnly: context.contactsOnly ?? false,
});
```

The card formatting code (lines 560-585) passes through data from the enrichment layer as-is — no inline overrides needed since Task 5 fixed the enrichment.

- [ ] **Step 5: Update the tool description**

Update the `description` field (line 127-135):

```typescript
description:
  "Creates opportunities (connections). NOT for looking up a specific person by name — use read_user_profiles(query=name) for that.\n\n" +
  "Four modes:\n" +
  "1. **Discovery**: pass searchQuery and/or indexId. Finds matching people based on intent overlap.\n" +
  "2. **Introduction**: pass partyUserIds (2+ user IDs) + entities (pre-gathered profiles and intents). " +
  "You MUST gather profiles and intents from shared indexes BEFORE calling this. " +
  "Optionally pass hint (the user's reason for the introduction).\n" +
  "3. **Direct connection**: pass targetUserId (a single user ID) + searchQuery (reason for connecting). " +
  "Creates an opportunity between the current user and the target user.\n" +
  "4. **Introducer discovery**: pass introTargetUserId (user ID to find matches FOR). " +
  "Discovers matches for that person; current user becomes the introducer. " +
  "Use when user asks 'who should I introduce to @Person'.\n\n" +
  "Results are saved as drafts; use update_opportunity(status='pending') to send.",
```

- [ ] **Step 6: Commit**

```bash
git add protocol/src/lib/protocol/tools/opportunity.tools.ts protocol/src/lib/protocol/tools/tests/opportunity.tools.spec.ts
git commit -m "feat(opportunity): add introTargetUserId to create_opportunities tool for introducer discovery"
```

### Task 7: Add Pattern 6a to chat prompt

**Files:**
- Modify: `protocol/src/lib/protocol/agents/chat.prompt.ts:344-361`

- [ ] **Step 1: Add Pattern 6a after Pattern 6**

After the existing Pattern 6 block (line 361), add:

```typescript
### 6a. Discover who to introduce to someone

**When the user asks "who should I introduce to @Person" or "find matches for @Person"** — they want YOU to discover good connections for that person, presented as introduction cards.

\`\`\`
1. Identify the target person's userId from the @mention
2. create_opportunities(introTargetUserId=targetUserId, searchQuery="<optional refinement>")
3. Present the returned cards (they will be formatted as introduction cards automatically)
\`\`\`

This is different from Pattern 6 (where user names BOTH parties). Here the user names ONE person and asks you to find matches. Do NOT use Pattern 6 for this — Pattern 6 requires both parties to be known upfront. Do NOT ask the user for a second person. Do NOT use partyUserIds. The system will find matches automatically.
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/agents/chat.prompt.ts
git commit -m "feat(chat): add Pattern 6a for introducer discovery flow in chat prompt"
```

## Chunk 3: Integration Verification

### Task 8: End-to-end verification

- [ ] **Step 1: Run all affected test files**

Ask user to run:
```bash
cd protocol && bun test src/lib/protocol/graphs/tests/opportunity.graph.spec.ts
cd protocol && bun test src/lib/protocol/tools/tests/opportunity.tools.spec.ts
cd protocol && bun test src/lib/protocol/support/tests/opportunity.discover.spec.ts
```

- [ ] **Step 2: Run lint**

Ask user to run: `cd protocol && bun run lint`

- [ ] **Step 3: Manual smoke test**

Ask user to:
1. Start dev server: `bun run dev`
2. Open chat, ask "who should I introduce to @[SomePerson]"
3. Verify returned cards have:
   - `viewerRole: "introducer"`
   - `primaryActionLabel: "Introduce Them"`
   - Headline format: `"MatchName → TargetName"`
   - Narrator chip with `name: "You"`
4. After initial results, say "show me more" to verify pagination preserves introducer flow

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git commit -m "fix(opportunity): integration fixes for introducer discovery flow"
```
