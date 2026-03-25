---
trigger: "Write protocol deep-dive documentation — how graphs, agents, and tools work together"
type: docs
branch: docs/protocol-deep-dive
created: 2026-03-26
version-bump: none
---

## Related Files
### Graphs
- `protocol/src/lib/protocol/graphs/chat.graph.ts`
- `protocol/src/lib/protocol/graphs/home.graph.ts`
- `protocol/src/lib/protocol/graphs/hyde.graph.ts`
- `protocol/src/lib/protocol/graphs/index.graph.ts`
- `protocol/src/lib/protocol/graphs/index_membership.graph.ts`
- `protocol/src/lib/protocol/graphs/intent.graph.ts`
- `protocol/src/lib/protocol/graphs/intent_index.graph.ts`
- `protocol/src/lib/protocol/graphs/maintenance.graph.ts`
- `protocol/src/lib/protocol/graphs/negotiation.graph.ts`
- `protocol/src/lib/protocol/graphs/opportunity.graph.ts`
- `protocol/src/lib/protocol/graphs/profile.graph.ts`

### Agents
- `protocol/src/lib/protocol/agents/chat.agent.ts`
- `protocol/src/lib/protocol/agents/chat.prompt.ts`
- `protocol/src/lib/protocol/agents/chat.prompt.modules.ts`
- `protocol/src/lib/protocol/agents/intent.inferrer.ts`
- `protocol/src/lib/protocol/agents/intent.reconciler.ts`
- `protocol/src/lib/protocol/agents/intent.verifier.ts`
- `protocol/src/lib/protocol/agents/intent.indexer.ts`
- `protocol/src/lib/protocol/agents/opportunity.evaluator.ts`
- `protocol/src/lib/protocol/agents/opportunity.presenter.ts`
- `protocol/src/lib/protocol/agents/negotiation.proposer.ts`
- `protocol/src/lib/protocol/agents/negotiation.responder.ts`
- `protocol/src/lib/protocol/agents/profile.generator.ts`
- `protocol/src/lib/protocol/agents/hyde.generator.ts`
- `protocol/src/lib/protocol/agents/hyde.strategies.ts`
- `protocol/src/lib/protocol/agents/model.config.ts`

### Tools
- `protocol/src/lib/protocol/tools/profile.tools.ts`
- `protocol/src/lib/protocol/tools/intent.tools.ts`
- `protocol/src/lib/protocol/tools/index.tools.ts`
- `protocol/src/lib/protocol/tools/opportunity.tools.ts`
- `protocol/src/lib/protocol/tools/contact.tools.ts`
- `protocol/src/lib/protocol/tools/utility.tools.ts`
- `protocol/src/lib/protocol/tools/integration.tools.ts`

### States
- `protocol/src/lib/protocol/states/` (11 state files)

### Streamers
- `protocol/src/lib/protocol/streamers/chat.streamer.ts`
- `protocol/src/lib/protocol/streamers/response.streamer.ts`

### Support
- `protocol/src/lib/protocol/support/` (opportunity utilities, chat utilities, protocol logger)

## Relevant Docs
- `protocol/src/lib/protocol/README.md` — protocol layer overview with flow diagrams
- `protocol/src/lib/protocol/docs/Architectural Strategies for Semantic Governance and Intent Reconciliation.md`
- `protocol/src/lib/protocol/docs/HyDE Strategies for Explicit Intent Matching and Retrieval.md`
- `protocol/src/lib/protocol/docs/Latent Opportunity Lifecycle.md`
- `protocol/src/lib/protocol/docs/Linguistic Architectures for Multi-Agent Opportunity Detection.md`
- `protocol/src/lib/protocol/docs/Semantic Governance Database Schemas for Active Intent Architecture.md`
- `protocol/src/lib/protocol/docs/The Semantic Intersection of Profile, Intent and Opportunity.md`

## Scope
Write a protocol deep-dive document (`docs/protocol-deep-dive.md`) explaining how the AI/agent system works:

1. **Overview** — what the protocol layer is and where it sits in the architecture
2. **LangGraph fundamentals** — graphs, nodes, edges, conditional routing, state annotations, factory pattern
3. **Graph catalog** — each of the 11 graphs: purpose, nodes, state shape, conditional edges, when invoked
4. **Agent catalog** — each agent: role, input/output schema, model config, which graph uses it
5. **Chat tool system** — how tools bridge the chat agent to subgraphs, tool-to-graph mapping
6. **HyDE system** — strategies (mirror, reciprocal), generation, embedding, caching
7. **Opportunity pipeline** — discovery flow: HyDE → vector search → evaluation → ranking → persistence
8. **Intent lifecycle** — inference → verification → reconciliation → execution
9. **Profile pipeline** — scraping → generation → embedding → HyDE generation
10. **Trace event system** — how graph_start/end and agent_start/end events stream to the UI
11. **Model configuration** — model.config.ts, per-agent model/temperature/token settings

Reference existing protocol README and design papers but write a standalone, implementation-focused guide.
