---
trigger: "IND-212 — Proactive introducer opportunity discovery"
type: feat
branch: feat/introducer-discovery
base-branch: dev
created: 2026-03-27
version-bump: minor
linear-issue: IND-212
---

## Related Files
- protocol/src/lib/protocol/graphs/opportunity.graph.ts
- protocol/src/lib/protocol/graphs/home.graph.ts
- protocol/src/lib/protocol/graphs/maintenance.graph.ts
- protocol/src/lib/protocol/states/maintenance.state.ts
- protocol/src/lib/protocol/states/opportunity.state.ts
- protocol/src/lib/protocol/support/opportunity.utils.ts
- protocol/src/lib/protocol/support/opportunity.discover.ts
- protocol/src/lib/protocol/support/opportunity.persist.ts
- protocol/src/lib/protocol/agents/opportunity.evaluator.ts
- protocol/src/services/opportunity.service.ts
- protocol/src/queues/opportunity.queue.ts
- protocol/src/events/intent.event.ts
- protocol/src/lib/protocol/support/opportunity.constants.ts
- protocol/src/lib/protocol/agents/home.categorizer.ts

## Relevant Docs
- docs/domain/opportunities.md
- docs/domain/feed-and-maintenance.md
- docs/specs/feed-maintenance-reintegration.md
- docs/domain/hyde.md
- docs/domain/profiles.md

## Related Issues
- IND-193 Agent wake up: cap feed (3 connections, 2 connector initiators, max 2 expired) + proactive agent self-maintenance (Done)
- IND-145 Gain knowledge and refactor opportunity expiration paths (Todo)

## Scope
Build a background pipeline that proactively discovers introducer opportunities — identifying pairs of contacts in a user's network whose intents/profiles complement each other and surfacing them as connector-flow opportunities on the home feed.

### Phase 1 (MVP) — Contact-scoped discovery
- For each of user's top-N contacts (sorted by interaction recency or intent freshness), run a scoped HyDE discovery against other contacts
- Reuse existing opportunity.graph.ts with onBehalfOfUserId + scoped to personal index
- Cap at 5 contacts per maintenance cycle, 3 candidates per contact
- Persist with detection.source = 'introducer_discovery'
- Introducer opportunities start as latent (user acts as quality gate before parties see them)

### Maintenance integration
- Extend MaintenanceGraph with an introducer discovery node alongside existing intent rediscovery
- Low connector-flow composition score should trigger introducer discovery
- Wire into intent events and scheduled cron (lower frequency than intent rediscovery)

### Home feed composition
- Introducer opportunities naturally fill connector-flow slots via existing classifyOpportunity() (checks for introducer role in actors)
- Both intent opportunities and introducer opportunities flow through selectByComposition()

### Observability
- New detection.source value: 'introducer_discovery'
- Log pair evaluation count, opportunities created per cycle
- Include in home view meta response for debugging
