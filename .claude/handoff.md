---
trigger: "Write architecture overview documentation — layering, agent system, and data flow for external readers"
type: docs
branch: docs/architecture-overview
created: 2026-03-26
version-bump: none
---

## Related Files
- `protocol/src/main.ts`
- `protocol/src/lib/router/router.decorators.ts`
- `protocol/src/controllers/controller.template.md`
- `protocol/src/services/service.template.md`
- `protocol/src/queues/queue.template.md`
- `protocol/src/lib/protocol/agents/agent.template.md`
- `protocol/src/lib/protocol/interfaces/database.interface.ts`
- `protocol/src/lib/protocol/interfaces/embedder.interface.ts`
- `protocol/src/lib/protocol/interfaces/cache.interface.ts`
- `protocol/src/lib/protocol/interfaces/queue.interface.ts`
- `protocol/src/lib/protocol/interfaces/scraper.interface.ts`
- `protocol/src/lib/protocol/interfaces/storage.interface.ts`
- `protocol/src/adapters/database.adapter.ts`
- `protocol/src/adapters/embedder.adapter.ts`
- `protocol/src/adapters/cache.adapter.ts`
- `protocol/src/adapters/storage.adapter.ts`
- `protocol/src/events/intent.event.ts`
- `protocol/src/events/index_membership.event.ts`
- `protocol/src/lib/protocol/README.md`
- `protocol/ARCHITECTURE.md`
- `protocol/src/lib/protocol/docs/` (6 design papers)

## Relevant Docs
- `protocol/ARCHITECTURE.md` — existing architecture doc (check if current/complete)
- `protocol/src/lib/protocol/README.md` — protocol layer overview
- `CLAUDE.md` — comprehensive project reference with architecture rules

## Scope
Write an architecture overview document (`docs/architecture-overview.md`) for external readers (new contributors, stakeholders):

1. **Monorepo structure** — protocol (backend) + frontend workspaces
2. **Protocol layering** — Controllers → Services → Adapters → Infrastructure, with protocol layer receiving deps via injection
3. **Dependency rules** — what each layer can/cannot import, interface narrowing with Pick<>
4. **Agent system** — LangGraph graphs, agents, tools, state machines; how they compose
5. **Data flow** — how a user request flows through the system (HTTP → controller → service → graph → agent → DB)
6. **Event system** — IntentEvents, IndexMembershipEvents for async decoupling
7. **Queue system** — BullMQ for async processing, job patterns
8. **Database layer** — Drizzle ORM, pgvector, schema patterns
9. **Key diagrams** — layering diagram, request flow, agent loop

Reference existing docs (ARCHITECTURE.md, protocol README, CLAUDE.md) but write a standalone, reader-friendly overview. Check existing ARCHITECTURE.md for accuracy and incorporate what's still current.
