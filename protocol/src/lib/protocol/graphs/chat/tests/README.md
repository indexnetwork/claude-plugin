# Chat Graph Tests

## Run

From `protocol/`:

```bash
bun test src/lib/protocol/graphs/chat/tests/
```

Loads `.env.test`. LLM-based tests use 60–180s timeouts; run with `--timeout 200000` if needed. Redis is required for process startup (BullMQ); tests use mocks for DB.

## Files

| File | Purpose |
|------|--------|
| **chat.graph.mocks.ts** | Shared: configurable mock DB and fixture builders. Import `createChatGraphMockDb`, `mockProfile`, `mockActiveIntent`, `mockIndexedIntent`, `mockOpportunity`. |
| **chat.graph.invoke.spec.ts** | Core invoke + Smartest LLM verification: greeting, no JSON leak, error path, confirmation, profile/intent/opportunity tools, edge cases. |
| **chat.graph.scope.spec.ts** | Scope × intents × role: user-scoped (no/has intents), index-scoped member (no/has intents), index-scoped owner (all intents), not a member. Uses mocks; schema-only verification. |
| **chat.graph.profile.spec.ts** | Profile state × action: no profile (read, update), has profile (read, create-already-have). Uses mocks; schema-only. |
| **chat.graph.opportunities.spec.ts** | Opportunities: list (empty, latent, pending), find (no intents vs in index), send intro. Uses mocks; schema-only. |
| **chat.discover.spec.ts** | Discovery E2E: “find me a mentor”, “who needs a React developer”, list opportunities, formatting (no raw JSON). |
| **chat.graph.streaming.spec.ts** | Streaming: `streamChatEvents`, `streamChatEventsWithContext`, event shape, session context. |
| **chat.graph.factory.spec.ts** | Factory/session context loading. |

## Using the mocks

1. **Configurable DB:** `createChatGraphMockDb(config)` returns a `ChatGraphCompositeDatabase`. Only set the keys you need in `ChatGraphMockConfig` (e.g. `profile`, `activeIntents`, `intentsInIndexForMember`, `isIndexMember`, `isIndexOwner`, `opportunitiesForUser`, `getUser`, `getIndex`). Unset keys use noop/defaults.

2. **Fixtures:** Use `mockProfile({ userId, name })`, `mockActiveIntent({ id, payload })`, `mockIndexedIntent({ id, payload, userId, userName })`, `mockOpportunity({ id, status, indexId, currentUserId, otherPartyUserIds })`. For list_my_opportunities to show names, set `getUser` in config so party `identityId`s resolve to `{ id, name, email }`.

3. **Scenarios:** Workflow specs call `runScenario(defineScenario({ name, description, fixtures, sut, verification }))` from `../../../../smartest`. Use `schema` + `llmVerify: false` for fast, deterministic checks; set `llmVerify: true` only when you need semantic criteria.

## Checklist

See `protocol/plans/chat-graph-testing-plan.md` for the full manual/Smartest checklist and workflow matrix.
