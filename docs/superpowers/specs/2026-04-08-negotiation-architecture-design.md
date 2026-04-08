# Negotiation Architecture: Personal vs Built-in Agents

**Date:** 2026-04-08
**Scope:** `packages/protocol/src/negotiation/`, `packages/protocol/src/opportunity/`, `backend/src/services/`, `backend/src/schemas/`
**Depends on:** [Agent Registry](2026-04-08-agent-registry-design.md)
**Supersedes:** [MCP Agent Integration](2026-04-08-mcp-agent-integration-design.md) (partially — negotiation participation, webhook yield path)

## Problem

The negotiation system has a single agent pair (proposer/responder) that both use gemini-2.5-flash. Users cannot participate in negotiations through their own agents. The webhook yield path added in `feat/mcp-agent-integration` is a partial solution but lacks:

1. **Agent differentiation** — no concept of personal vs system agents in negotiation
2. **Asymmetric capabilities** — personal agents should have richer actions and no turn cap
3. **Availability detection** — the current yield path waits 24h for a response instead of checking if an agent is online
4. **Opportunity lifecycle integration** — negotiations create opportunities on completion rather than resolving pre-existing ones
5. **Score removal** — `fitScore` in turns and `finalScore` in outcomes serve no programmatic purpose

## Goals

- Each negotiation side is independently dispatched: personal agent if available, system agent as fallback
- Personal agents have richer negotiation vocabulary (`question` action, `message` field) and no turn cap
- System agents are fast, cheap (gemini-2.5-flash), capped at 3 turns
- Availability is checked proactively (30s timeout) rather than waiting 24h
- Opportunity status lifecycle integrates negotiation as a first-class step
- `fitScore` and `finalScore` are removed from the protocol

## Non-Goals

- Multi-party negotiations (always bilateral)
- Personal agent personality customization (agents decide their own behavior)
- Network-specific negotiation strategies (network prompt is context, not personality)
- Parallel/simultaneous proposals from both sides (sequential: proposer first)

## Design

### 1. Turn Schema Changes

**`NegotiationTurnSchema`** (in `packages/protocol/src/negotiation/negotiation.state.ts`):

**Before:**
```typescript
{
  action: 'propose' | 'accept' | 'reject' | 'counter',
  assessment: {
    fitScore: number,        // 0-100
    reasoning: string,
    suggestedRoles: { ownUser: Role, otherUser: Role },
  },
}
```

**After:**
```typescript
{
  action: 'propose' | 'accept' | 'reject' | 'counter' | 'question',
  assessment: {
    reasoning: string,
    suggestedRoles: { ownUser: Role, otherUser: Role },
  },
  message?: string,   // free-form text for the other agent (questions, conditions, context)
}
```

**Changes:**
- **Added** `question` action — routes same as `counter` (next turn), enables personal agents to ask clarifying questions
- **Added** optional `message` field — free-form text that accompanies any action, visible to the other agent in history
- **Removed** `fitScore` from assessment — was never used programmatically (routing uses `action` only)

### 2. Outcome Schema Changes

**`NegotiationOutcomeSchema`**:

**Before:**
```typescript
{
  hasOpportunity: boolean,
  finalScore: number,        // average of fitScores
  agreedRoles: [{ userId, role }],
  reasoning: string,
  turnCount: number,
  reason?: string,
}
```

**After:**
```typescript
{
  hasOpportunity: boolean,
  agreedRoles: [{ userId, role }],
  reasoning: string,
  turnCount: number,
  reason?: string,           // 'turn_cap', 'timeout'
}
```

**Removed** `finalScore` — was computed as average of `fitScore` values, never used for decisions.

### 3. Agent Dispatch in Turn Node

The turn node currently contains inline webhook/yield logic. This is replaced by the `AgentDispatcher` from the Agent Registry spec.

**Per-turn flow:**

```
1. Determine active speaker's userId
2. AgentDispatcher.dispatch(userId, 'manage:negotiations', networkScope, turnPayload)
3. Dispatcher resolves:
   a. Find authorized agents (personal first, system fallback)
   b. For personal agent: try transports in priority order, 30s timeout each
      - MCP: check active session → send notification → wait response
      - Webhook: POST trigger → wait response
   c. If personal agent responds → return NegotiationTurn
   d. If all transports fail/timeout → system agent handles turn synchronously
4. Turn node persists message, updates state, routes to next turn or finalize
```

**Key principle:** The turn node calls `dispatch()` and gets back a `NegotiationTurn`. It does not know or care whether a personal or system agent produced it.

**Notification payload** (sent to personal agent): Lightweight trigger with negotiation ID. The personal agent uses existing MCP tools (`get_negotiation`, `read_user_profiles`, `read_intents`) to pull context, then calls `respond_to_negotiation`.

### 4. Turn Caps & Termination

**System agent (Index Negotiator):**
- Hard cap: 3 turns per side
- On final turn: must emit `accept` or `reject` (no `counter`, no `question`)
- Uses gemini-2.5-flash — fast, cheap, basic assessment

**Personal agents:**
- No turn cap
- Full action vocabulary: `propose`, `accept`, `reject`, `counter`, `question`
- Can use `message` field for rich communication
- 24h inactivity timeout — if a personal agent has an outstanding turn and doesn't respond within 24h, the negotiation expires

**State machine routing (`evaluateNode`):**

| Condition | Route |
|-----------|-------|
| `action === 'accept'` | → finalize |
| `action === 'reject'` | → finalize |
| `action === 'question'` | → next turn |
| `action === 'counter'` | → next turn |
| System agent on final allowed turn | → force `accept` or `reject` |
| 24h since last activity (background worker) | → finalize with `reason: 'timeout'` |

**Mixed scenarios (one personal, one system):**
- System agent hits cap → makes final `accept`/`reject` → negotiation resolves
- If system accepted and personal agent has outstanding turn → 24h to respond, then expires
- If system rejected → negotiation closes immediately

### 5. Opportunity Lifecycle Integration

**Current:** Negotiation creates an opportunity record only on `accept`. No record for rejected negotiations.

**New:** Opportunity is created **before** negotiation begins, and negotiation updates its status.

**New status enum:**
```
['latent', 'draft', 'negotiating', 'pending', 'accepted', 'rejected', 'expired']
```

**Added:** `negotiating` — agents are actively evaluating this opportunity.

**Lifecycle flows:**

| Path | Flow |
|------|------|
| **Discovery + negotiation** | `latent` → `negotiating` → `accepted` / `rejected` / `expired` |
| **Manual/curator** | `latent` → `pending` → `accepted` / `rejected` / `expired` |
| **Chat draft** | `draft` → `negotiating` → `accepted` / `rejected` / `expired` |

**What changes in the opportunity graph:**

1. **Persist node** creates the opportunity as `latent` (or `draft` in chat context) **before** negotiation
2. **Negotiate node** receives the `opportunityId`, transitions status to `negotiating`
3. **On negotiation completion:**
   - Accept → status transitions to `accepted` (agent acts on behalf of user)
   - Reject → `rejected`
   - Timeout → `expired` with `reason: 'timeout'`
4. **Negotiation task** in conversation schema is linked to the opportunity via `opportunityId`

**Visibility:**
- `negotiating` opportunities are visible to the user who initiated discovery (chat: inline, home: "agents are evaluating")
- `accepted` opportunities are visible to both parties

### 6. Network Context

The built-in negotiator receives the network prompt as **context** — "this opportunity surfaced in the AI/ML network" — not as a personality override.

- System agent system prompt references the network context to understand the domain
- Personal agents can retrieve network context via `get_negotiation` MCP tool
- If an opportunity spans multiple networks, the negotiation receives the primary network (strongest match)

### 7. Removing the Webhook Yield Path

The current `yieldForExternal` flag and webhook-specific logic in the turn node (added in `feat/mcp-agent-integration`) is replaced by the `AgentDispatcher`. Specifically:

**Removed:**
- `yieldForExternal` field from `NegotiationGraphState`
- `webhookLookup` dependency from `NegotiationGraphFactory`
- `NegotiationEventEmitter` interface (replaced by agent dispatch notifications)
- Inline webhook check in `turnNode`

**Kept:**
- `NegotiationTimeoutQueue` — still needed for 24h inactivity timeout on personal agents
- `status: 'waiting_for_external'` → renamed to `status: 'waiting_for_agent'` (the graph pauses when a personal agent accepted the turn via transport but hasn't responded yet)

**Replaced by:**
- `AgentDispatcher` injected into `NegotiationGraphFactory`
- Per-turn dispatch logic (Section 3)

### 8. Agent Strategy Pattern

The `NegotiationAgentLike` interface used by the graph factory evolves:

**Current:** Two separate constructor params (`proposer`, `responder`) both of type `NegotiationAgentLike`.

**New:** A single `AgentDispatcher` replaces both. The turn node determines which user speaks and dispatches accordingly. The dispatcher resolves the right agent (personal or system) per-turn.

The system agent (Index Negotiator) implements the existing `NegotiationAgentLike` interface internally — it's just the fallback strategy inside the dispatcher.

```
NegotiationGraphFactory(
  database: NegotiationDatabase,
  dispatcher: AgentDispatcher,       // replaces proposer + responder
  timeoutQueue?: NegotiationTimeoutQueue,
)
```

### 9. Built-in Negotiator Agent Changes

The current `NegotiationProposer` and `NegotiationResponder` are merged into a single **Index Negotiator** agent:

- Single agent that adapts based on turn position (first turn = propose, subsequent = respond)
- Structured output: `NegotiationTurnSchema` (updated, without `fitScore`)
- Model: gemini-2.5-flash
- System prompt receives: own user context, other user context, network context (as domain background), turn history
- Turn cap enforced by the dispatcher: on the 3rd turn, system prompt instructs the agent to make a final `accept`/`reject` decision

## File Changes Summary

| Area | Files | Change |
|------|-------|--------|
| Turn schema | `packages/protocol/src/negotiation/negotiation.state.ts` | Add `question` action, add `message` field, remove `fitScore`, remove `finalScore`, rename `waiting_for_external` → `waiting_for_agent` |
| Graph factory | `packages/protocol/src/negotiation/negotiation.graph.ts` | Replace proposer/responder with dispatcher, remove webhook logic, update finalize for new outcome schema |
| Agents | `packages/protocol/src/negotiation/negotiation.proposer.ts`, `negotiation.responder.ts` | Merge into single `negotiation.agent.ts` (Index Negotiator) |
| Opportunity graph | `packages/protocol/src/opportunity/opportunity.graph.ts` | Create opportunity before negotiation, update status on completion |
| Opportunity status | `backend/src/schemas/database.schema.ts` | Add `negotiating` to status enum |
| Negotiate node | `packages/protocol/src/opportunity/opportunity.graph.ts` | Pass opportunityId, use dispatcher |
| Protocol interfaces | `packages/protocol/src/shared/interfaces/negotiation-events.interface.ts` | Remove `WebhookLookup`, `NegotiationEventEmitter`; keep `NegotiationTimeoutQueue` |
| Composition root | `backend/src/protocol-init.ts` | Wire `AgentDispatcher` instead of webhookLookup + eventEmitter |
| Timeout worker | `backend/src/queues/` | Update to finalize with `reason: 'timeout'`, set opportunity status to `expired` |
