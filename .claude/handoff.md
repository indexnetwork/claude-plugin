---
trigger: "Introducer discovery chat flow produces broken cards: (1) all cards show intro target name instead of counterpart, (2) evaluator results not mapping back to candidates ('No evaluation returned'), (3) duplicate candidates across indexes due to indexId in dedup key"
type: fix
branch: fix/introducer-discovery-cards
base-branch: dev
created: 2026-03-29
version-bump: patch
---

## Related Files
- protocol/src/lib/protocol/support/opportunity.discover.ts (lines 194, 304-314, 437-456 — secondParty not included in FormattedDiscoveryCandidate return)
- protocol/src/lib/protocol/tools/opportunity.tools.ts (lines 43-134 buildMinimalOpportunityCard, lines 651-677 discovery card formatting — missing secondParty wiring)
- protocol/src/lib/protocol/graphs/opportunity.graph.ts (lines 979 dedup key includes indexId; lines 1523-1529 evaluatedByUserId map empty; lines 1548-1582 trace entries fallback to "No evaluation returned")
- protocol/src/adapters/embedder.adapter.ts (lines 152-191, 400-423 — per-index search, mergeAndRankCandidates)
- protocol/src/types/chat-streaming.types.ts (OpportunityCardPayload — secondParty field)

## Relevant Docs
- docs/specs/introducer-discovery.md
- docs/domain/opportunities.md
- docs/domain/feed-and-maintenance.md
- docs/design/protocol-deep-dive.md

## Related Issues
- IND-166 Same user has 3 different profiles being created and agent suggesting all of them (Done)
- IND-176 Show user feedback when a step fails during discovery process (Done)

## Scope
Three bugs in the introducer discovery pipeline (chat flow "who should I connect @brad.holden with?"):

### Bug 1: Introducer cards show intro target instead of counterpart
All cards have `userId` and `name` set to Brad Holden (the intro target) instead of the actual counterpart (Yanki, Mark Beylin). The `secondParty` field is missing from `FormattedDiscoveryCandidate` interface. The enrichment in `opportunity.discover.ts` identifies secondParty (lines 304-314) but never includes it in the return object (lines 437-456). The chat formatter in `opportunity.tools.ts` (lines 651-677) doesn't wire secondParty either.

Fix: Add `secondParty` to `FormattedDiscoveryCandidate`, populate it in enrichOpportunities when viewerIsIntroducer, and pass it through in the chat card formatter.

### Bug 2: Evaluator results not mapping back to candidates
All 25 candidates get "No evaluation returned for this candidate" even though 18 passed. The `evaluatedByUserId` map (opportunity.graph.ts lines 1523-1529) is empty because the evaluator's results aren't surviving the pairwise transformation pipeline. Need to trace why `evaluatedOpportunities` doesn't contain the scored results.

Fix: Debug the pairwise transformation (lines 1424-1470) to find where evaluations are being dropped. Ensure evaluatedByUserId is populated from the actual LLM scoring results.

### Bug 3: Duplicate candidates across indexes
Dedup key at line ~979 is `${candidateUserId}:${indexId}:${intentId ?? 'profile'}` — includes indexId, so the same user in 7 indexes appears 7 times. userId 9e92680b appears 7 times with 100% similarity.

Fix: Remove indexId from the dedup key. Use `${candidateUserId}:${candidateIntentId ?? 'profile'}` to keep the best score per user per intent/profile.
