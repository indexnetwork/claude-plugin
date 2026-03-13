# Cache Home Presenter & Categorizer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache `presentHomeCard()` and categorizer results in the home graph to eliminate redundant LLM calls on repeated home page loads.

**Architecture:** Add cache-aware nodes to `home.graph.ts` following the HyDE graph pattern (check → conditional generate → cache). Inject `OpportunityCache` into `HomeGraphFactory`. Presenter results cached per `{opportunityId}:{viewerId}`, categorizer results cached per hash of opportunity ID set. 24h TTL, no event-driven invalidation.

**Tech Stack:** LangGraph (StateGraph, conditional edges), Redis via `RedisCacheAdapter`, `OpportunityCache` interface, Node `crypto` for hashing.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `protocol/src/lib/protocol/states/home.state.ts` | Modify | Add cache-related state fields |
| `protocol/src/lib/protocol/graphs/home.graph.ts` | Modify | Add 4 cache nodes + 2 conditional edges |
| `protocol/src/services/opportunity.service.ts` | Modify | Inject `OpportunityCache` into `HomeGraphFactory` |

---

## Chunk 1: Implementation

### Task 1: Add cache state fields to `home.state.ts`

**Files:**
- Modify: `protocol/src/lib/protocol/states/home.state.ts`

- [ ] **Step 1: Add state fields**

Add these fields to `HomeGraphState` Annotation.Root (after the existing `expired` field, before `error`):

```typescript
/** Presenter results retrieved from cache (opportunityId → HomeCardItem). */
cachedCards: Annotation<Map<string, HomeCardItem>>({
  reducer: (curr, next) => next ?? curr,
  default: () => new Map(),
}),

/** Opportunities that had no cache hit and need presenter generation. */
uncachedOpportunities: Annotation<Opportunity[]>({
  reducer: (curr, next) => next ?? curr,
  default: () => [],
}),

/** Whether categorizer results were found in cache. */
categoryCacheHit: Annotation<boolean>({
  reducer: (curr, next) => next ?? curr,
  default: () => false,
}),
```

Import `Opportunity` type if not already imported (it is already imported on line 2).

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/states/home.state.ts
git commit -m "feat(home): add cache-related state fields to HomeGraphState"
```

---

### Task 2: Add `OpportunityCache` injection to `HomeGraphFactory`

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/home.graph.ts`

- [ ] **Step 1: Add cache import and constructor parameter**

Add import at the top of `home.graph.ts`:

```typescript
import { createHash } from 'crypto';
import type { OpportunityCache } from '../interfaces/cache.interface';
```

Change the `HomeGraphFactory` constructor (line 184-185) from:

```typescript
export class HomeGraphFactory {
  constructor(private database: HomeGraphDb) {}
```

To:

```typescript
export class HomeGraphFactory {
  constructor(private database: HomeGraphDb, private cache: OpportunityCache) {}
```

- [ ] **Step 2: Add cache TTL constant**

Add after the existing constants (line 47):

```typescript
const HOME_CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds
```

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/graphs/home.graph.ts
git commit -m "feat(home): inject OpportunityCache into HomeGraphFactory"
```

---

### Task 3: Add presenter cache check and write nodes

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/home.graph.ts`

- [ ] **Step 1: Add `checkPresenterCacheNode`**

Add this node inside `createGraph()`, after the `loadOpportunitiesNode` definition and before `generateCardTextNode`:

```typescript
const checkPresenterCacheNode = async (state: typeof HomeGraphState.State) => {
  return timed("HomeGraph.checkPresenterCache", async () => {
    const { opportunities, userId } = state;
    if (opportunities.length === 0) {
      return { cachedCards: new Map(), uncachedOpportunities: [] };
    }

    const keys = opportunities.map(
      (opp) => `home:card:${opp.id}:${userId}`
    );
    const results = await this.cache.mget<HomeCardItem>(keys);

    const cachedCards = new Map<string, HomeCardItem>();
    const uncachedOpportunities: typeof opportunities = [];

    for (let i = 0; i < opportunities.length; i++) {
      const cached = results[i];
      if (cached) {
        cachedCards.set(opportunities[i].id, cached);
      } else {
        uncachedOpportunities.push(opportunities[i]);
      }
    }

    logger.verbose('[HomeGraph:checkPresenterCache]', {
      total: opportunities.length,
      cacheHits: cachedCards.size,
      cacheMisses: uncachedOpportunities.length,
    });

    return { cachedCards, uncachedOpportunities };
  });
};
```

- [ ] **Step 2: Add `cachePresenterResultsNode`**

Add this node after `generateCardTextNode`:

```typescript
const cachePresenterResultsNode = async (state: typeof HomeGraphState.State) => {
  return timed("HomeGraph.cachePresenterResults", async () => {
    const { cards, cachedCards, userId } = state;

    // Only cache cards that weren't already from cache
    const newCards = cards.filter((card) => !cachedCards.has(card.opportunityId));

    await Promise.all(
      newCards.map((card) =>
        this.cache.set(
          `home:card:${card.opportunityId}:${userId}`,
          card,
          { ttl: HOME_CACHE_TTL }
        )
      )
    );

    // Merge cached cards into full card list
    const allCards: HomeCardItem[] = [];
    const cardsByOppId = new Map(cards.map((c) => [c.opportunityId, c]));

    // Rebuild in original opportunity order
    for (const [oppId, cachedCard] of cachedCards) {
      if (!cardsByOppId.has(oppId)) {
        allCards.push(cachedCard);
      }
    }
    allCards.push(...cards);

    // Re-sort by _cardIndex to maintain original ordering
    allCards.sort((a, b) => a._cardIndex - b._cardIndex);

    logger.verbose('[HomeGraph:cachePresenterResults]', {
      newlyCached: newCards.length,
      totalCards: allCards.length,
    });

    return { cards: allCards };
  });
};
```

- [ ] **Step 3: Modify `generateCardTextNode` to operate on uncached opportunities only**

In the existing `generateCardTextNode`, change the line that reads opportunities from state (line 267):

From:
```typescript
const opportunities = state.opportunities;
```

To:
```typescript
const opportunities = state.uncachedOpportunities.length > 0
  ? state.uncachedOpportunities
  : state.opportunities;
```

Also update the `_cardIndex` assignment. Since `uncachedOpportunities` is a subset, we need the card indices to reference the original opportunity order. Add a mapping lookup before the chunk loop:

```typescript
const oppIndexMap = new Map(
  state.opportunities.map((opp, idx) => [opp.id, idx])
);
```

Then in the chunk map callback, replace:
```typescript
const cardIndex = i + offset;
```
With:
```typescript
const cardIndex = oppIndexMap.get(opportunity.id) ?? (i + offset);
```

- [ ] **Step 4: Add conditional edge for skipping presenter generation**

Add this routing function inside `createGraph()`:

```typescript
const shouldGenerateCards = (state: typeof HomeGraphState.State): string => {
  if (state.uncachedOpportunities.length > 0) {
    return 'generate';
  }
  logger.verbose('[HomeGraph] All presenter results cached, skipping generation');
  return 'skip';
};
```

- [ ] **Step 5: Commit**

```bash
git add protocol/src/lib/protocol/graphs/home.graph.ts
git commit -m "feat(home): add presenter cache check and write nodes"
```

---

### Task 4: Add categorizer cache check and write nodes

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/home.graph.ts`

- [ ] **Step 1: Add `checkCategorizerCacheNode`**

Add inside `createGraph()`, after `cachePresenterResultsNode`:

```typescript
const checkCategorizerCacheNode = async (state: typeof HomeGraphState.State) => {
  return timed("HomeGraph.checkCategorizerCache", async () => {
    if (state.cards.length === 0) {
      return { categoryCacheHit: false };
    }

    const oppIds = state.cards
      .map((c) => c.opportunityId)
      .sort()
      .join(',');
    const hash = createHash('sha256').update(oppIds).digest('hex').slice(0, 16);
    const key = `home:categories:${state.userId}:${hash}`;

    const cached = await this.cache.get<HomeSectionProposal[]>(key);
    if (cached) {
      logger.verbose('[HomeGraph:checkCategorizerCache] cache hit');
      return { sectionProposals: cached, categoryCacheHit: true };
    }

    logger.verbose('[HomeGraph:checkCategorizerCache] cache miss');
    return { categoryCacheHit: false };
  });
};
```

- [ ] **Step 2: Add `cacheCategorizerResultsNode`**

Add after `categorizeDynamicallyNode`:

```typescript
const cacheCategorizerResultsNode = async (state: typeof HomeGraphState.State) => {
  return timed("HomeGraph.cacheCategorizerResults", async () => {
    if (state.categoryCacheHit || state.sectionProposals.length === 0) {
      return {};
    }

    const oppIds = state.cards
      .map((c) => c.opportunityId)
      .sort()
      .join(',');
    const hash = createHash('sha256').update(oppIds).digest('hex').slice(0, 16);
    const key = `home:categories:${state.userId}:${hash}`;

    await this.cache.set(key, state.sectionProposals, { ttl: HOME_CACHE_TTL });

    logger.verbose('[HomeGraph:cacheCategorizerResults] cached', {
      sectionCount: state.sectionProposals.length,
    });

    return {};
  });
};
```

- [ ] **Step 3: Add conditional routing for categorizer**

```typescript
const shouldCategorize = (state: typeof HomeGraphState.State): string => {
  if (state.categoryCacheHit) {
    logger.verbose('[HomeGraph] Categorizer results cached, skipping');
    return 'skip';
  }
  return 'categorize';
};
```

- [ ] **Step 4: Commit**

```bash
git add protocol/src/lib/protocol/graphs/home.graph.ts
git commit -m "feat(home): add categorizer cache check and write nodes"
```

---

### Task 5: Rewire the graph with conditional edges

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/home.graph.ts`

- [ ] **Step 1: Replace graph wiring**

Replace the current graph definition (lines 463-474):

```typescript
const graph = new StateGraph(HomeGraphState)
  .addNode('loadOpportunities', loadOpportunitiesNode)
  .addNode('generateCardText', generateCardTextNode)
  .addNode('categorizeDynamically', categorizeDynamicallyNode)
  .addNode('normalizeAndSort', normalizeAndSortNode)
  .addEdge(START, 'loadOpportunities')
  .addEdge('loadOpportunities', 'generateCardText')
  .addEdge('generateCardText', 'categorizeDynamically')
  .addEdge('categorizeDynamically', 'normalizeAndSort')
  .addEdge('normalizeAndSort', END);

return graph.compile();
```

With:

```typescript
const graph = new StateGraph(HomeGraphState)
  .addNode('loadOpportunities', loadOpportunitiesNode)
  .addNode('checkPresenterCache', checkPresenterCacheNode)
  .addNode('generateCardText', generateCardTextNode)
  .addNode('cachePresenterResults', cachePresenterResultsNode)
  .addNode('checkCategorizerCache', checkCategorizerCacheNode)
  .addNode('categorizeDynamically', categorizeDynamicallyNode)
  .addNode('cacheCategorizerResults', cacheCategorizerResultsNode)
  .addNode('normalizeAndSort', normalizeAndSortNode)
  .addEdge(START, 'loadOpportunities')
  .addEdge('loadOpportunities', 'checkPresenterCache')
  .addConditionalEdges('checkPresenterCache', shouldGenerateCards, {
    generate: 'generateCardText',
    skip: 'cachePresenterResults',
  })
  .addEdge('generateCardText', 'cachePresenterResults')
  .addEdge('cachePresenterResults', 'checkCategorizerCache')
  .addConditionalEdges('checkCategorizerCache', shouldCategorize, {
    categorize: 'categorizeDynamically',
    skip: 'normalizeAndSort',
  })
  .addEdge('categorizeDynamically', 'cacheCategorizerResults')
  .addEdge('cacheCategorizerResults', 'normalizeAndSort')
  .addEdge('normalizeAndSort', END);

return graph.compile();
```

- [ ] **Step 2: Update file header comment**

Update the flow comment at the top of the file (line 5) to reflect the new flow:

```typescript
* Flow:
* loadOpportunities → checkPresenterCache → [generateCardText if misses] → cachePresenterResults
* → checkCategorizerCache → [categorizeDynamically if miss] → cacheCategorizerResults → normalizeAndSort
```

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/graphs/home.graph.ts
git commit -m "feat(home): rewire graph with cache-aware conditional edges"
```

---

### Task 6: Inject cache in the service

**Files:**
- Modify: `protocol/src/services/opportunity.service.ts`

- [ ] **Step 1: Add OpportunityCache import and injection**

Add to imports (after the existing `HydeCache` import on line 6):

```typescript
import type { HydeCache, OpportunityCache } from '../lib/protocol/interfaces/cache.interface';
```

Remove the duplicate `HydeCache`-only import if present.

- [ ] **Step 2: Update HomeGraphFactory instantiation**

Change line 89 from:

```typescript
this.homeGraph = new HomeGraphFactory(this.db as unknown as HomeGraphDatabase).createGraph();
```

To:

```typescript
const homeCache: OpportunityCache = new RedisCacheAdapter();
this.homeGraph = new HomeGraphFactory(this.db as unknown as HomeGraphDatabase, homeCache).createGraph();
```

- [ ] **Step 3: Commit**

```bash
git add protocol/src/services/opportunity.service.ts
git commit -m "feat(home): inject OpportunityCache into home graph via service"
```

---

### Task 7: Verify

- [ ] **Step 1: Run lint**

```bash
cd protocol && bun run lint
```

Fix any lint errors.

- [ ] **Step 2: Run build check**

```bash
cd protocol && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Run tests**

```bash
cd protocol && bun test
```

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(home): address lint/type issues from cache implementation"
```
