---
trigger: "Create domain knowledge docs covering the business logic of protocol/src/lib/protocol/ — what intents, opportunities, indexes, profiles, HyDE, negotiations etc. mean and how they work. Domain knowledge = business logic, not design/architecture."
type: docs
branch: docs/domain-knowledge
created: 2026-03-26
---

## Related Files

### Database Schema (primary source of truth for domain model)
- protocol/src/schemas/database.schema.ts — all table definitions, enums (intentStatus, opportunityStatus, speechActType, intentMode, sourceType), JSON column types (OpportunityDetection, OpportunityActor, OpportunityInterpretation, OpportunityContext, UserSocials, OnboardingState, NotificationPreferences)

### Agent Prompts (encode business rules)
- protocol/src/lib/protocol/agents/intent.verifier.ts — speech act classification (Searle's theory), felicity conditions (authority, sincerity, clarity), semantic entropy, DIRECTIVE vs COMMISSIVE vs ASSERTIVE vs EXPRESSIVE
- protocol/src/lib/protocol/agents/intent.inferrer.ts — how intents are extracted from natural language
- protocol/src/lib/protocol/agents/intent.reconciler.ts — create/update/expire decision logic
- protocol/src/lib/protocol/agents/intent.indexer.ts — relevancy scoring (0.0-1.0), qualification threshold 0.7
- protocol/src/lib/protocol/agents/opportunity.evaluator.ts — scoring bands (90-100 Must Meet, 70-89 Should Meet), valency roles (Agent/Patient/Peer), visibility implications per role, deduplication rules, same-side matching rejection
- protocol/src/lib/protocol/agents/negotiation.proposer.ts — bilateral negotiation proposer behavior
- protocol/src/lib/protocol/agents/negotiation.responder.ts — bilateral negotiation responder behavior
- protocol/src/lib/protocol/agents/chat.prompt.ts — system prompt, voice/constraints, banned vocabulary, session context
- protocol/src/lib/protocol/agents/lens.inferrer.ts — dynamic lens inference replacing hardcoded strategies
- protocol/src/lib/protocol/agents/profile.generator.ts — profile structure (identity/narrative/attributes)
- protocol/src/lib/protocol/agents/hyde.generator.ts — HyDE document generation per target corpus

### Graph Business Logic
- protocol/src/lib/protocol/graphs/intent.graph.ts — intent lifecycle: prep → inference → verification → reconciliation → execution
- protocol/src/lib/protocol/graphs/opportunity.graph.ts — discovery paths (intent-based, profile-based, direct connection), scoping, evaluation, ranking, negotiation, persistence
- protocol/src/lib/protocol/graphs/profile.graph.ts — profile lifecycle: check → scrape → generate → embed → HyDE
- protocol/src/lib/protocol/graphs/hyde.graph.ts — cache-aware HyDE generation with dynamic lenses
- protocol/src/lib/protocol/graphs/negotiation.graph.ts — bilateral consensus: init → turn → finalize
- protocol/src/lib/protocol/graphs/maintenance.graph.ts — feed health scoring and rediscovery triggers
- protocol/src/lib/protocol/graphs/home.graph.ts — home feed categorization and card presentation

### Support Files (business rules)
- protocol/src/lib/protocol/support/feed.health.ts — composition scoring, freshness decay, maintenance thresholds
- protocol/src/lib/protocol/support/opportunity.utils.ts — feed soft targets, strategy selection
- protocol/src/lib/protocol/support/opportunity.persist.ts — opportunity persistence rules
- protocol/src/lib/protocol/support/opportunity.enricher.ts — opportunity enrichment
- protocol/src/lib/protocol/support/opportunity.sanitize.ts — opportunity sanitization rules

### State Definitions (domain model shapes)
- protocol/src/lib/protocol/states/intent.state.ts
- protocol/src/lib/protocol/states/opportunity.state.ts
- protocol/src/lib/protocol/states/profile.state.ts
- protocol/src/lib/protocol/states/hyde.state.ts
- protocol/src/lib/protocol/states/negotiation.state.ts
- protocol/src/lib/protocol/states/maintenance.state.ts
- protocol/src/lib/protocol/states/chat.state.ts

### Event System (domain events)
- protocol/src/events/intent.event.ts — onCreated, onUpdated, onArchived
- protocol/src/events/index_membership.event.ts — onMemberAdded

### Services (business logic orchestration)
- protocol/src/services/intent.service.ts
- protocol/src/services/contact.service.ts
- protocol/src/services/task.service.ts

## Relevant Docs

### Design Papers (rich domain theory — READ THESE CLOSELY)
- protocol/src/lib/protocol/docs/The Semantic Intersection of Profile, Intent and Opportunity.md — constitutive facts (profile), commissive acts (intents), constraint satisfaction (opportunities), felicity conditions
- protocol/src/lib/protocol/docs/Latent Opportunity Lifecycle.md — opportunity discovery lifecycle, role-based visibility, agent-driven stages
- protocol/src/lib/protocol/docs/HyDE Strategies for Explicit Intent Matching and Retrieval.md — HyDE types (Mirror/Direct, Reciprocal, Contextual) for semantic matching
- protocol/src/lib/protocol/docs/Semantic Governance Database Schemas for Active Intent Architecture.md — semantic entropy (Shannon theory), referential anchoring, constraint density
- protocol/src/lib/protocol/docs/Linguistic Architectures for Multi-Agent Opportunity Detection.md — mapping commissive acts to constitutive facts, implicit inference, felicity verification
- protocol/src/lib/protocol/docs/Architectural Strategies for Semantic Governance and Intent Reconciliation.md — constraint density filtering, referential vs attributive intent distinction, elaboration loops

### Protocol README (overview with mermaid diagrams)
- protocol/src/lib/protocol/README.md — core concepts table, message flow diagrams, tool-to-subgraph mapping, business logic flows, key invariants

### Project-Level Domain Docs
- HOWITWORKS.md — intent-driven discovery model: profiles as authority, intents as commissive acts, opportunities as constraint satisfaction
- QUICKSTART.md — API quickstart showing domain workflows (create member, join index, add intent, discover)
- README.md — project mission: discovery protocol replacing profile-based social networks

### Implementation Flow Docs
- protocol/docs/intent-and-opportunity-flows.md — intent creation, HyDE generation, opportunity discovery flows
- protocol/docs/opportunity-redesign-plan.md — opportunity model: unified schema, extensible JSON, message-first connections
- protocol/docs/intent-enrichment-approaches.md — enriching opaque intents with concept-rich details
- protocol/docs/intent-graph-database-design.md — intent lifecycle management (create/update/expire)
- protocol/docs/analysis-create-intent-vs-read-intents-scope-mismatch.md — index-scoped vs user-global intent behavior

### Blog Posts (business perspective)
- frontend/content/blog/intent-is-the-new-search/index.md — intent declaration replaces search; agents surface mutual fits
- frontend/content/blog/building-a-discovery-protocol/index.md — connection as declaration vs search; agent-based discovery philosophy

## Scope

Create domain knowledge documentation in `docs/domain/` that explains the **business logic** — what each concept means, how it behaves, what rules govern it, and why. These are NOT architecture/design docs (those go elsewhere). Domain docs answer: "What is an intent?", "How does opportunity scoring work?", "What are felicity conditions and why do they matter?"

### Proposed docs (one per major domain area):

1. **`docs/domain/intents.md`** — What an intent is, speech act types (COMMISSIVE/DIRECTIVE), felicity conditions (authority, sincerity, clarity), semantic entropy and referential anchors, intent modes (REFERENTIAL vs ATTRIBUTIVE), lifecycle (ACTIVE→PAUSED→FULFILLED→EXPIRED), confidence scoring, incognito intents, source tracking (file/integration/link/discovery_form/enrichment), intent-index assignment with relevancy scoring, reconciliation rules (create/update/expire)

2. **`docs/domain/opportunities.md`** — What an opportunity is, discovery triggers (intent creation, user query, direct connection), valency roles (Agent/Patient/Peer) and their visibility implications, scoring bands (90-100 Must Meet, 70-89 Should Meet, <70 rejected), status lifecycle (latent→draft→pending→viewed→accepted→rejected→expired), dual-interpretation model, deduplication rules, agent-creates-user-sends pattern, same-side matching rejection, index-scoped discovery

3. **`docs/domain/indexes.md`** — What an index is (community/context for discovery), personal indexes (one per user, auto-created on registration), index prompts (purpose description for LLM evaluation), member prompts (custom criteria), auto-assignment, join policies (anyone/invite_only), invitation links, permissions model (owner/member/contact), contacts-as-members pattern, ghost users (imported contacts who haven't signed up), relevancy scoring on intent-index junction

4. **`docs/domain/profiles.md`** — Profile structure (identity: name/bio/location, narrative: context, attributes: interests/skills), vector embeddings (2000-dim text-embedding-3-large), profile generation from identity signals (web scraping, user input), profile enrichment, implicit intents extraction, profile-based discovery

5. **`docs/domain/hyde.md`** — What HyDE (Hypothetical Document Embeddings) is and why it exists, dynamic lens inference (replacing hardcoded strategies), target corpus concept (profiles vs intents), cache-aware generation (Redis + PostgreSQL), the full pipeline: lens inference → cache check → generation → embedding → caching

6. **`docs/domain/negotiation.md`** — Bilateral agent-to-agent negotiation, proposer/responder roles, turn-based protocol (propose/counter/accept/reject), consensus determination, fit scoring, agreed roles, how negotiation gates opportunity persistence, A2A conversation integration

7. **`docs/domain/feed-and-maintenance.md`** — Home feed composition, feed health scoring (composition 40%, freshness 30%, expiration ratio 30%), soft targets for connection/connectorFlow/expired counts, freshness decay window, maintenance triggers for rediscovery, opportunity card presentation and dynamic categorization

### Key guidance:
- Read the design papers in `protocol/src/lib/protocol/docs/` CLOSELY — they contain the theoretical foundation (speech act theory, semantic governance, constraint satisfaction)
- Read the agent system prompts — they encode the actual business rules the LLM follows
- Read `database.schema.ts` — the enums and JSON types define the domain model
- Read `HOWITWORKS.md` — the highest-level business narrative
- Write for someone who needs to understand WHAT the system does and WHY, not HOW the code is structured
- Use frontmatter with `type: domain` and relevant `tags`
