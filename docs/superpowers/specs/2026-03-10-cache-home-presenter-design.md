# Cache Home Page Opportunity Presenter Results

**Linear Issue**: IND-142
**Branch**: `feat/cache-home-presenter`
**Date**: 2026-03-10

## Problem

Every home page load runs the full opportunity presenter pipeline. `presentHomeCard()` is called per opportunity via the home graph's `generateCardText` node, making LLM calls to generate headline, personalizedSummary, suggestedAction, narratorRemark, and action labels. These run in chunks of 50 concurrently, but the LLM round-trips make the home page slow.

There is no caching for presenter output or categorizer output in the home graph.

## Design

### Approach: Graph-Level Caching

Add cache-aware nodes to `home.graph.ts`, following the HyDE graph's proven pattern (check cache -> conditional generate -> cache results). The cache is injected via the existing `OpportunityCache` interface (get/set/mget) — no new interfaces needed.

### Cache Keys & Storage

- **Presenter**: `home:card:{opportunityId}:{viewerId}` -> full `HomeCardPresentation` object
- **Categorizer**: `home:categories:{sorted-opportunity-ids-hash}` -> category assignments
- **TTL**: 24 hours for both
- **Storage**: `RedisCacheAdapter` injected as `OpportunityCache`

### Revised Home Graph Flow

**Current**: `loadOpportunities -> generateCardText -> categorizeDynamically -> normalizeAndSort`

**Revised**: `loadOpportunities -> checkPresenterCache -> generateCardText (misses only) -> cachePresenterResults -> checkCategorizerCache -> categorizeDynamically (miss only) -> cacheCategorizerResults -> normalizeAndSort`

#### New Nodes

1. **`checkPresenterCacheNode`** — `mget` all presenter cache keys, split state into cached hits and uncached misses
2. **`cachePresenterResultsNode`** — write newly generated presentations to cache
3. **`checkCategorizerCacheNode`** — hash sorted opportunity IDs, check cache for category assignments
4. **`cacheCategorizerResultsNode`** — write category assignments to cache

#### Conditional Edges

- After `checkPresenterCacheNode`: skip `generateCardText` if all opportunities have cached presentations
- After `checkCategorizerCacheNode`: skip `categorizeDynamically` if categories are cached

### State Additions

Add to home graph state annotation:
- `cachedPresentations` — map of opportunityId -> cached presentation
- `uncachedOpportunities` — list of opportunities needing presenter calls
- `categoryCacheHit` — boolean flag for conditional routing

### Injection

`HomeGraphFactory` constructor adds `cache: OpportunityCache` parameter alongside existing dependencies. The service instantiates `RedisCacheAdapter` as `OpportunityCache` and passes it in — same pattern as HyDE graph injection.

### Invalidation Strategy (v1)

No event-driven invalidation. Rationale:

- **Superseded opportunities** produce new opportunity IDs; old cache entries become dead weight, never queried again
- **Chat-originated opportunities** may live longer but tolerate staleness (user already knows why they're in the conversation)
- **24h TTL** bounds maximum staleness
- **Profile modularity** (planned future work) may introduce targeted invalidation later

### Files Changed

- `protocol/src/lib/protocol/graphs/home.graph.ts` — add cache nodes, conditional edges, state fields
- `protocol/src/services/opportunity.service.ts` — inject `RedisCacheAdapter` as `OpportunityCache` into home graph factory
