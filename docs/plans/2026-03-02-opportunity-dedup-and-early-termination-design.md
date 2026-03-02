# Opportunity Discovery: Candidate Dedup & Early Termination

**Date**: 2026-03-02
**Status**: Approved

## Problem

Two bugs in the opportunity discovery pipeline waste LLM tokens and mislead users:

1. **Duplicate candidate evaluation across indexes**: Candidates are keyed by `(userId, indexId)` during discovery. A user appearing in 4 indexes becomes 4 separate evaluator entities. A batch of 25 "candidates" may contain only ~6 unique people, each evaluated 4 times. This wastes LLM tokens and inflates trace logs.

2. **Blind pagination with no early termination**: Discovery merges query-driven HyDE candidates (semantically relevant to the search) with profile-similarity candidates (similar to the user's general profile). Candidates are sorted by similarity and batched in slices of 25. When the HyDE pool is small (e.g., 8 candidates for "painters"), all query-relevant candidates are consumed in batch 1. Remaining batches contain only profile-similarity candidates (engineers, PMs) that can never match the query. The system still caches them and the chat model offers "show me more", leading to guaranteed-empty follow-ups.

## Design

### Fix 1: Deduplicate candidates by userId in evaluation node

**Location**: `opportunity.graph.ts`, evaluation node

After sorting candidates by similarity descending, deduplicate by `candidateUserId` keeping the entry with the highest similarity score. This happens before slicing into `batchToEvaluate`, so the batch contains 25 unique people.

```
// Current flow:
sort by similarity → slice(0, 25) → build entities → evaluate

// New flow:
sort by similarity → dedup by userId (keep first/best) → slice(0, 25) → build entities → evaluate
```

The deduped entry retains its `indexId` (whichever index had the highest similarity). The `userIdToIndexId` map and downstream persist logic work unchanged since they already key by userId.

**Impact**: 4x more people coverage per evaluation batch. Trace logs show each person once.

### Fix 2: Tag candidates with discovery source, skip pagination when query candidates exhausted

**A. State type change** (`opportunity.state.ts`)

Add an optional `discoverySource` field to `CandidateMatch`:

```typescript
export interface CandidateMatch {
  // ... existing fields ...
  discoverySource?: 'query' | 'profile-similarity';
}
```

**B. Discovery node tagging** (`opportunity.graph.ts`)

All discovery paths tag candidates at creation time:
- Query HyDE path (`runQueryHydeDiscovery`): `discoverySource: 'query'`
- Profile search merge: `discoverySource: 'profile-similarity'`
- Profile mirror (no search query): `discoverySource: 'profile-similarity'`
- Intent HyDE path: `discoverySource: 'query'`

**C. Evaluation node early termination** (`opportunity.graph.ts`)

After dedup and batching, if the search was query-driven and remaining candidates contain zero `'query'`-sourced entries, set `remainingCandidates = []`. This prevents Redis caching in `opportunity.discover.ts`, which prevents the tool from offering pagination to the LLM.

When remaining candidates do contain query entries (e.g., a popular search with 40+ HyDE hits), pagination works unchanged.

## Files Changed

| File | Change |
|------|--------|
| `protocol/src/lib/protocol/states/opportunity.state.ts` | Add `discoverySource` to `CandidateMatch` |
| `protocol/src/lib/protocol/graphs/opportunity.graph.ts` | Dedup by userId in evaluation node; tag discovery source in all discovery paths; early termination check in evaluation node |
