---
title: "Negotiation"
type: domain
tags: [negotiation, bilateral, agents, opportunity, a2a, roles]
created: 2026-03-26
updated: 2026-04-11
---

# Negotiation

Negotiation is a bilateral agent-to-agent protocol that acts as a quality gate over proposed matches. Two AI agents -- one representing each user -- debate whether a connection genuinely serves both parties. An opportunity is created before negotiation begins (with `negotiating` status) so users have real-time visibility; the negotiation then gates whether it transitions to `accepted` or is rejected.

This mechanism prevents the system from surfacing low-quality connections that passed the initial scoring threshold but would not withstand scrutiny from an advocate for each side.

---

## Why Negotiation Exists

The opportunity evaluator assigns scores based on profile and intent analysis, but it operates from a neutral third-party perspective. It cannot fully represent either user's interests. Negotiation adds an adversarial quality check: each agent critically evaluates whether the proposed match serves their user, advocating for that user's specific goals and constraints.

This catches failure modes that single-pass evaluation misses:
- Superficial keyword overlap without genuine alignment
- Vague matches that sound good but lack concrete mutual benefit
- Matches where one side benefits much more than the other

---

## Roles

### Index Negotiator

A single **Index Negotiator** agent represents each user in the negotiation. The same agent type is used for both participants — it adapts its stance based on the user context and the turn sequence, not a fixed personality.

On the first turn, the initiating side presents the match case. On subsequent turns, the agent evaluates arguments from the other side, advocates for its user's specific interests, and decides whether to accept, reject, counter, or (for personal agents) ask a clarifying question. The agent is instructed to be honest: it should not accept matches that do not genuinely serve its user, and it should not reject out of stubbornness when objections have been adequately addressed.

---

## Turn-Based Protocol

Negotiation proceeds in alternating turns.

### Actions

Each turn produces one of five actions:

| Action | When used |
|---|---|
| **propose** | First turn only. The initiating agent presents the match case. |
| **counter** | The agent partially agrees but has specific objections. States what is missing or weak. |
| **accept** | The agent is convinced the match genuinely benefits their user. |
| **reject** | The agent concludes the match does not serve their user's needs. |
| **question** | Personal agents only. A clarifying question for the other party. Routes the same as counter (non-terminal, awaits response). |

Every turn may also include an optional **message** field: free-form text accompanying the action (e.g. a note to the other user, context for a question, or elaboration beyond the structured reasoning).

### Turn structure

Each turn produces a structured assessment:

- **action**: The action taken this turn (`propose`, `counter`, `accept`, `reject`, or `question`)
- **assessment.reasoning**: Why the agent took this action
- **assessment.suggestedRoles**: What roles each user should play
  - `ownUser`: agent, patient, or peer
  - `otherUser`: agent, patient, or peer
- **message** *(optional)*: Free-form text accompanying the action

### Flow

1. **Init**: An opportunity is created with `negotiating` status. A conversation and task are created in the A2A system to track the negotiation.
2. **Initiating agent's turn**: The agent presents the case (action: propose)
3. **Responding agent's turn**: The agent evaluates and responds (accept, reject, counter, or question)
4. **Alternation**: If the responding agent countered or asked a question, the other agent responds; turns alternate until resolution
5. **Finalize**: When a terminal action occurs or the turn cap is reached, the outcome is computed and the opportunity status is updated accordingly

### Turn cap

Negotiations have a maximum turn limit that depends on the participant types:

| Scenario | Turn cap |
|---|---|
| System agent vs System agent | 6 turns |
| Mixed (system + personal agent) | 8 turns |
| Personal agent vs Personal agent | Unlimited (24-hour timeout safety valve) |

If the cap is reached without accept or reject, the negotiation ends with no opportunity. The outcome records `reason: "turn_cap"` to distinguish this from explicit rejection. Likewise, if 24 hours elapse in a personal-vs-personal negotiation without resolution, the outcome records `reason: "timeout"`.

---

## Outcome Determination

The finalization logic examines the negotiation history to determine the outcome:

- **Has opportunity**: The last action was "accept". The opportunity transitions to `accepted`.
- **Rejected**: The last action was "reject". The opportunity is discarded.
- **Turn cap**: The maximum turns were exhausted. The opportunity is discarded; `reason: "turn_cap"`.
- **Timeout**: 24 hours elapsed without resolution (personal-vs-personal only). The opportunity is discarded; `reason: "timeout"`.

### Outcome fields

| Field | Description |
|---|---|
| `hasOpportunity` | Whether a real opportunity was produced |
| `agreedRoles` | Roles for each user (derived from the last two turns' `suggestedRoles`) |
| `reasoning` | Summary of why the negotiation concluded this way |
| `turnCount` | Number of turns taken |
| `reason` *(optional)* | `"turn_cap"` or `"timeout"` when the negotiation ended without a terminal action |

### Agreed roles

When an opportunity is produced, the final roles are derived from the last two turns (the accept turn and the preceding turn). Each side's `suggestedRoles.ownUser` from their respective last turns becomes the agreed role for that user.

---

## Seed Assessment

Each negotiation begins with a seed assessment from the opportunity evaluator:

- **score**: The evaluator's initial score (0-100)
- **reasoning**: Why the evaluator thinks this is a match
- **valencyRole**: The evaluator's initial role suggestion

Both agents receive this seed assessment as context. They are instructed to use it as a starting point but form their own independent judgment.

---

## Agent Dispatch (AgentDispatcher)

The negotiation graph dispatches each turn to the appropriate agent via a unified **AgentDispatcher** abstraction. This replaces any direct webhook invocation with a registry-driven dispatch that handles both system and personal agents uniformly.

### Dispatch resolution

For each participant, the dispatcher resolves the agent to invoke:

1. **Personal agent first**: If the user has a personal agent registered with an active transport, the dispatcher targets it.
2. **System agent fallback**: If no personal agent is found (or it is unavailable), the dispatcher falls back to the system Index Negotiator.

Agent resolution uses the agent registry — not hardcoded webhook URLs.

### Two-phase dispatch

The dispatcher distinguishes two timeout tiers:

| Tier | Timeout | Behavior |
|---|---|---|
| **Short** (chat context) | ≤ 60 seconds | Blocks synchronously; response is awaited inline |
| **Long** (background context) | > 60 seconds | Sends a notification to the agent, then suspends the graph; graph resumes when the agent responds via MCP tool |

This means personal agents in a background negotiation cause the graph to suspend and wait for an out-of-band response, while system agents and fast personal agents complete synchronously within the turn.

---

## Personal Agent Turn Handling

A personal agent with a webhook transport receives negotiation events at an HTTPS endpoint it owns. The canonical reference implementation is the [`indexnetwork-openclaw-plugin`](../../packages/openclaw-plugin/README.md), which runs inside an OpenClaw workspace and turns webhook deliveries into silent subagent runs.

### Delivery path

1. The `AgentDispatcher` selects the personal agent for a turn and hands off to `AgentDeliveryService`, which filters the agent's transports by (a) the `manage:negotiations` permission and (b) the event subscription in `config.events` — the "dual gate". An eligible webhook transport is picked by priority.
2. The backend signs the payload with HMAC-SHA256 using the transport secret (`X-Index-Signature` header) and issues `POST {config.url}` with a 5-second delivery timeout.
3. The openclaw-plugin verifies the HMAC signature on `POST /index-network/webhook` and rejects mismatches with `401`.
4. On `negotiation.turn_received`, the plugin launches a silent subagent via `api.runtime.subagent.run` with `deliver: false` and a **session key prefixed `index:negotiation:`**. The task prompt tells the subagent to read the full negotiation, ground itself in the user's profile and intents, and respond.
5. The plugin acknowledges the webhook with `202 accepted` within the 5-second window. The subagent runs asynchronously.
6. The subagent connects to the Index Network MCP server using the personal agent's API key, detects the `index:negotiation:` session prefix, and follows the **Negotiation turn mode** instructions baked into `MCP_INSTRUCTIONS` on the MCP server. It calls `get_negotiation`, `read_user_profiles`, `read_intents`, and then submits a response via `respond_to_negotiation`.
7. The response posts back through MCP, which resumes the suspended negotiation graph server-side with the new turn.
8. On `negotiation.completed`, the plugin fires an **accepted-notification** subagent instead — a delivered subagent that surfaces a single short line to the user telling them who they're connected with and why.

### Why subagents

Running the turn as a silent subagent (rather than inline in the webhook handler) lets the personal agent use its full LLM loop and tool stack to deliberate — fetching negotiation history, reading profile and intent context, and applying the user's voice — without tying up the HTTP request. The 202-accept-now / respond-later shape matches the long-timeout tier of the two-phase dispatcher.

### Turn mode behavioral contract

When a subagent sees a session key prefixed `index:negotiation:`, the MCP server's instructions direct it to:

- Not produce user-facing output (it is running in the background).
- Not ask clarifying questions (there is no user in the loop).
- If the decision is ambiguous, pick the most conservative action — usually `counter` with specific objections, or `reject` with clear reasoning.

Because this behavioral contract lives in `MCP_INSTRUCTIONS` on the protocol's MCP server, every MCP-connected runtime (OpenClaw, Claude Code, Codex, …) picks it up automatically and behaves consistently. Plugin skill files do not need to repeat it.

### Configuration knobs

The openclaw-plugin exposes two optional config keys under `plugins.entries.indexnetwork-openclaw-plugin.config`:

- `webhookSecret` — shared HMAC secret. Set by the bootstrap skill via `add_webhook_transport` when the user enables automatic negotiations.
- `negotiationMode` — `"enabled"` (default) or `"disabled"`. When disabled, the plugin still returns `202` on turn webhooks but does not dispatch a subagent, and Index Network's server falls back to the system `Index Negotiator` after the short-tier timeout. Accepted-notification messages still fire.

---

## A2A Conversation Integration

Negotiations are tracked as A2A (Agent-to-Agent) conversations:

- A **conversation** is created with two agent participants (`agent:{userId}`)
- A **task** is created within the conversation with type "negotiation"
- Each turn is persisted as a **message** with the turn data in a DataPart (`kind: "data"`)
- When finalized, an **artifact** is created on the task containing the negotiation outcome

This integration means negotiation history is stored in the same conversation/message infrastructure used by the rest of the system, enabling future features like letting users review the reasoning that led to their opportunities.

---

## Relationship to Opportunity Persistence

Negotiation gates whether a proposed match becomes a visible opportunity:

1. The opportunity evaluator identifies candidates with scores above threshold
2. Each qualifying candidate is persisted immediately as an opportunity with `negotiating` status (for real-time visibility)
3. Bilateral negotiation runs over the candidate
4. If negotiation produces an outcome with `hasOpportunity: true`, the opportunity transitions to `accepted` with the agreed roles
5. If negotiation rejects or times out, the opportunity is discarded

Negotiation does not re-score the opportunity. The evaluator's score remains as the opportunity's initial score; negotiation only determines accept/reject and the agreed roles.

If negotiation is skipped or not available for a particular discovery path, the evaluator's assessment is used directly.

---

## MCP Tools

Personal agents interact with the negotiation protocol via MCP tools:

### `respond_to_negotiation`

Called by a personal agent to submit a turn response.

**Input fields:**
- `negotiationId`: The negotiation to respond to
- `action`: One of `propose`, `counter`, `accept`, `reject`, `question`
- `reasoning`: Why the agent took this action
- `suggestedRoles`: Role suggestions for own user and other user
- `message` *(optional)*: Free-form text accompanying the action

### `list_negotiations`

Lists negotiations awaiting a response from the agent's user.

**Status filters:**
- `waiting_for_agent`: Negotiations where it is this agent's turn to respond

### `get_negotiation`

Returns the full negotiation state including all turns.

**Turn fields returned:**
- `action`
- `assessment.reasoning`
- `assessment.suggestedRoles`
- `message` *(optional)*

---

## Trace Instrumentation

Each negotiation turn is instrumented for the TRACE panel. The trace summary for a turn is the action name (e.g. `accept`, `counter`, `reject`). No score is included in the summary.

---

## Negotiation Insights

The weekly digest and opportunity analysis surfaces patterns across negotiations:

- Which match types most frequently reach accept vs. reject
- Common objection themes raised by agents
- Turn count distributions across negotiation scenarios

Digest analysis does not reference scores produced during negotiation — it focuses on the qualitative reasoning and action patterns.
