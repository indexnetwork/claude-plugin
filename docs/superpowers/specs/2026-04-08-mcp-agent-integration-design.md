# MCP Agent Integration

**Date:** 2026-04-08
**Scope:** `packages/protocol/src/mcp/`, `backend/src/`, `frontend/src/`

## Problem

The existing MCP server at `protocol.index.network/mcp` exposes 28 tools but external agents (Hermes, OpenClaw) cannot use them reliably. Three root causes:

1. **Tool descriptions are terse.** They lack the domain context that the chat agent's system prompt provides. External agents don't understand what intents, indexes, or opportunities are, or how to orchestrate multi-tool workflows.
2. **Negotiations are closed.** The negotiation graph runs entirely server-side with two AI agents. Users' external agents cannot participate in negotiations on their behalf.
3. **No push notifications.** There is no way to notify an external agent when something happens asynchronously (opportunity discovered, negotiation turn received). Agents must poll.

Additionally, there is no way for users to create API keys from the frontend, which is the simplest auth method for configuring external agents.

## Goals

- External agents can bootstrap themselves by reading domain documentation via MCP
- All 28+ tools have rich descriptions sufficient for autonomous agent use
- Either or both parties in a negotiation can be external agents
- Async events are pushed to external agents via webhooks
- Users can create and manage API keys from the web UI
- Internal business rules (scoring, access control, turn limits) are enforced regardless of caller

## Non-Goals

- CLI commands or human-facing REPL (out of scope)
- A2A protocol support (premature -- no adoption in target agents)
- Real-time WebSocket/SSE push to agents (webhooks are sufficient for v1)
- Changes to the chat agent's behavior or system prompt

## Design

### 1. Rich Tool Descriptions

**What changes:** Every tool registered on the MCP server gets an expanded description. The descriptions are defined alongside the tool definitions in `packages/protocol/src/*/` and used by both the MCP server and the chat agent's tool bindings.

**Description format for each tool:**
- What the tool does in domain terms (not just technical operation)
- When to use it (workflow context)
- Parameter guidance (expected values, common patterns, which are optional)
- What the return value contains and how to use it next

**Example -- `create_intent`:**

```
Create a new intent (signal of interest or need) for the authenticated user.

An intent describes something the user is looking for, offering, or interested
in -- e.g. "Looking for a React developer in Berlin" or "Offering consulting
on ML pipelines". The system uses the description for semantic matching against
other users' intents across shared indexes.

Parameters:
- description (required): Natural language description of what the user
  wants or offers. Be specific -- this drives semantic matching quality.
- sourceType (optional): Origin of this intent. One of: file, integration,
  link, discovery_form, enrichment. Defaults to 'enrichment'.

After creation, the system automatically:
1. Indexes the intent against the user's indexes (scoring relevancy 0-1)
2. Discovers potential opportunities (matches with other users' intents)
3. If matches are found, initiates negotiations

Returns: The created intent with id, description, status, confidence score,
and inferenceType.
```

**Implementation:** Each tool's `description` field in its `.tools.ts` file is updated. No new files needed. The MCP server's `createMcpServer()` already reads these descriptions from the tool registry.

### 2. Enhanced `read_docs` Tool

**What changes:** The existing `read_docs` tool (in `packages/protocol/src/shared/agent/utility.tools.ts`) is enhanced to return a comprehensive domain guide structured for agent consumption.

**Content returned:**

```markdown
# Index Network -- Domain Guide for Agents

## Core Concepts

### Intents
Signals of interest or need. A user creates intents to describe what they're
looking for or offering. Intents are semantically matched against other users'
intents to discover opportunities.

### Indexes
Shared contexts (communities, topics, organizations) that users join. Intents
are scored for relevancy against each index the user belongs to. Indexes have
optional prompts that guide what kinds of intents belong.

### Opportunities
Matches between two users' intents within shared indexes. When the system
finds a potential match, it initiates a negotiation between the parties.
Opportunities have a relevancy score (0-1) and status (pending/accepted/rejected).

### Negotiations
Bilateral conversations between two parties (or their agents) to evaluate
whether an opportunity is worth pursuing. Turn-based, max 6 turns. Each turn
the active party can: accept, reject, or counter with a message.

### Contacts
Users in a user's personal index with 'contact' permission. Contacts are
discoverable for opportunity matching.

### Profiles
User identity with name, bio, social links, and embedding. Used by the
system for semantic matching and by other users to evaluate opportunities.

## Typical Workflows

### Discovery Flow
1. Create intents describing what you want/offer
2. System auto-indexes intents against your indexes
3. System discovers matches with other users
4. Negotiations run (AI or your agent)
5. Accepted opportunities become connections

### Negotiation Flow
1. Register a webhook for 'negotiation.turn_received'
2. When notified, call get_negotiation to see the proposal
3. Call respond_to_negotiation with accept/reject/counter
4. If no webhook or no response within timeout, AI agent handles your turn

## Authentication
API key via 'Authorization: Bearer <key>' or 'x-api-key: <key>' header.
Generate keys in the Index Network web app under Settings > API Keys.
```

### 3. Negotiation via MCP

**New tools** added to `packages/protocol/src/negotiation/negotiation.tools.ts`:

| Tool | Schema | Description |
|---|---|---|
| `list_negotiations` | `{ status?: 'active' \| 'pending' \| 'completed' \| 'all' }` | List negotiations where the authenticated user is a party. Returns negotiation id, counterparty name, turn count, status, whose turn it is, latest message preview, and deadline. |
| `get_negotiation` | `{ negotiationId: string }` | Get full negotiation details -- all turns with messages and actions, counterparty profile summary, shared indexes, intent context, current state, and whether it's the user's turn. |
| `respond_to_negotiation` | `{ negotiationId: string, action: 'accept' \| 'reject' \| 'counter', message?: string }` | Submit a response on the user's turn. `counter` requires a message. Server validates: negotiation is active, it's the user's turn, max turns not exceeded. Returns updated negotiation state. |

**Negotiation graph changes** (`packages/protocol/src/negotiation/negotiation.graph.ts`):

The `turn` node becomes a conditional yield point:

```
For the active party on this turn:
  1. Check if user has an active webhook for 'negotiation.turn_received'
  2. If YES:
     - Persist current negotiation state to database
     - Fire 'negotiation.turn_received' webhook event
     - Set a timeout job (BullMQ delayed job, default 24h)
     - Graph yields (returns without continuing to next turn)
  3. If NO:
     - Run AI agent (proposer or responder) as today
     - Continue to evaluate node
```

When `respond_to_negotiation` is called:
1. Load persisted negotiation state
2. Validate the response (turn order, active status, action validity)
3. Append the response as a turn
4. Cancel the timeout job
5. Resume the negotiation graph from the evaluate node
6. If it's now the counterparty's turn, repeat the yield-or-AI check for them

**Timeout handling:**
- A BullMQ delayed job fires after the configured timeout (default 24h)
- The job runs the AI agent for that turn as fallback
- Resumes the negotiation graph normally

**Symmetric design:** Both proposer and responder can independently be AI or external agent. The decision is made fresh each turn based on webhook presence. Mixed mode (one AI, one external) works naturally.

**New negotiation statuses:** The negotiation state gains a `waiting_for_external` status alongside existing `active`, `completed`. This status indicates the graph has yielded and is waiting for an external response or timeout.

### 4. Webhooks (IND-223)

Implements the existing spec at `docs/specs/webhooks.md` with the following extensions:

**Extended event registry:**

| Event | Trigger Point | Payload |
|---|---|---|
| `opportunity.created` | `OpportunityService` emits `'created'` | `{ opportunityId, counterpartyId, counterpartyName, sharedIndexes, relevancyScore, intents }` |
| `opportunity.accepted` | `update_opportunity` tool with action `'send'`/`'accept'` | `{ opportunityId, counterpartyId, counterpartyName, connectionDetails }` |
| `opportunity.rejected` | `update_opportunity` tool with action `'reject'` | `{ opportunityId, counterpartyId, reason? }` |
| `negotiation.started` | Negotiation graph `init` node | `{ negotiationId, counterpartyId, counterpartyName, context, firstTurn }` |
| `negotiation.turn_received` | Negotiation graph `turn` node yield | `{ negotiationId, turnNumber, counterpartyAction, counterpartyMessage, deadline }` |
| `negotiation.completed` | Negotiation graph `finalize` node | `{ negotiationId, outcome, finalScore, agreedRoles?, turnCount }` |

**MCP tools for webhook management:**

| Tool | Schema | Description |
|---|---|---|
| `register_webhook` | `{ url: string, events: string[], description?: string }` | Register a webhook. Returns `{ id, secret }`. Secret shown once. URL must be HTTPS in production. Events validated against registry. |
| `list_webhooks` | `{}` | List user's webhooks with masked secrets. |
| `delete_webhook` | `{ webhookId: string }` | Delete a webhook (owner only). |
| `test_webhook` | `{ webhookId: string }` | Send a test payload to verify connectivity. |
| `list_webhook_events` | `{}` | List all available event names from the registry. |

**Implementation (per existing spec):**

- **Schema:** `webhooks` table in `database.schema.ts` with columns: id, user_id, url, secret, events (text[]), active, description, failure_count, created_at, updated_at
- **Service:** `WebhookService` in `backend/src/services/webhook.service.ts` -- CRUD + delivery orchestration
- **Queue:** `WebhookQueue` in `backend/src/queues/webhook.queue.ts` -- dedicated BullMQ queue for HTTP delivery
- **Controller:** `WebhookController` in `backend/src/controllers/webhook.controller.ts` -- REST API for non-MCP access
- **Signing:** HMAC-SHA256 over raw body, header `X-Index-Signature`
- **Retries:** Exponential backoff via BullMQ job retries
- **Auto-disable:** After 10 consecutive failures, webhook.active set to false
- **Wiring:** Event emission in `main.ts` composition root, subscribing to `OpportunityServiceEvents` and new `NegotiationEvents`

### 5. API Key Management

**Backend** (already exists via Better Auth):

Better Auth's `apiKey` plugin (already configured in `betterauth.ts` with `enableSessionForAPIKeys: true`) provides all needed endpoints out of the box:
- `POST /api/auth/api-key` -- create a new API key (returns the key once)
- `GET /api/auth/api-keys` -- list user's API keys (masked)
- `DELETE /api/auth/api-key/:id` -- revoke an API key
- `POST /api/auth/api-key/verify` -- verify a key (already used by `mcp.handler.ts`)

No new backend code is needed for API key CRUD. The work is frontend-only.

**Frontend** (`frontend/src/app/settings/`):

New "API Keys" section in the Settings page:
- List existing keys (name, created date, last used, masked key)
- "Create API Key" button -- name input, shows the full key once with copy button
- Delete/revoke button per key
- Setup instructions: snippet showing MCP config for Hermes, OpenClaw, Claude Code

## File Changes Summary

### New Files

| File | Purpose |
|---|---|
| `packages/protocol/src/negotiation/negotiation.tools.ts` | Negotiation MCP tools (list, get, respond) |
| `backend/src/services/webhook.service.ts` | Webhook CRUD + delivery |
| `backend/src/queues/webhook.queue.ts` | BullMQ webhook delivery queue |
| `backend/src/controllers/webhook.controller.ts` | Webhook REST API |
| `backend/src/lib/webhook-events.ts` | Event registry constant |
| `backend/src/events/negotiation.event.ts` | Negotiation event emitter |
| `backend/drizzle/NNNN_add_webhooks_table.sql` | Webhooks table migration |
| `frontend/src/app/settings/api-keys.tsx` | API key management UI |
| `frontend/src/services/api-key.service.ts` | Frontend API key client |

### Modified Files

| File | Changes |
|---|---|
| `packages/protocol/src/profile/profile.tools.ts` | Rich descriptions for all profile tools |
| `packages/protocol/src/intent/intent.tools.ts` | Rich descriptions for all intent tools |
| `packages/protocol/src/network/network.tools.ts` | Rich descriptions for all network tools |
| `packages/protocol/src/opportunity/opportunity.tools.ts` | Rich descriptions for all opportunity tools |
| `packages/protocol/src/shared/agent/utility.tools.ts` | Enhanced `read_docs` content |
| `packages/protocol/src/contact/contact.tools.ts` | Rich descriptions for contact tools |
| `packages/protocol/src/integration/integration.tools.ts` | Rich descriptions for integration tools |
| `packages/protocol/src/negotiation/negotiation.graph.ts` | Conditional yield for external agents |
| `packages/protocol/src/negotiation/negotiation.state.ts` | `waiting_for_external` status |
| `packages/protocol/src/shared/agent/tool.factory.ts` | Register new negotiation + webhook tools |
| `packages/protocol/src/shared/agent/tool.registry.ts` | Register new tools in registry |
| `packages/protocol/src/mcp/mcp.server.ts` | New tools auto-registered (no changes needed if registry is source of truth) |
| `backend/src/schemas/database.schema.ts` | Webhooks table schema |
| `backend/src/main.ts` | Wire webhook queue worker, negotiation events, webhook event subscriptions |
| `backend/src/protocol-init.ts` | Wire negotiation tools deps if needed |
| `frontend/src/services/auth.service.ts` | Add API key client methods (create, list, delete) calling Better Auth endpoints |
| `frontend/src/app/settings/page.tsx` | Add API Keys section |

## Constraints

- All negotiation business rules (max turns, scoring, access control) enforced server-side regardless of caller
- Webhook URLs must be HTTPS in production
- API keys are scoped to the authenticated user -- no cross-user access
- Adding new webhook event types requires no DB migration -- only registry + emit site + tests
- Tool description changes must not break the chat agent's existing behavior
- Layering rules apply: controllers -> services -> adapters, no cross-service imports

## Acceptance Criteria

### Rich Descriptions
1. All 28+ tool descriptions include domain context, parameter guidance, and return value documentation
2. `read_docs` returns a comprehensive domain guide covering concepts, relationships, workflows, negotiation model, and auth
3. An external agent (Hermes/OpenClaw) can bootstrap itself by calling `read_docs` and then correctly use tools without prior domain knowledge

### Negotiation
4. `list_negotiations` returns the user's negotiations with status, turn info, and counterparty summary
5. `get_negotiation` returns full turn history and current state
6. `respond_to_negotiation` validates turn order and updates negotiation state
7. When a user has an active `negotiation.turn_received` webhook, the graph yields instead of running AI
8. When no webhook or timeout expires, AI agent handles the turn as fallback
9. Both parties can independently be AI or external agent (symmetric design)
10. Mixed mode (one AI, one external) works correctly across all turns

### Webhooks
11. `webhooks` table migration runs cleanly
12. `register_webhook` creates a webhook and returns the HMAC secret once
13. `list_webhooks` returns owned webhooks with masked secrets
14. `delete_webhook` removes only the owner's webhook
15. `test_webhook` sends a test payload and reports success/failure
16. `list_webhook_events` returns the canonical event registry
17. `opportunity.created` fires for subscribed actor users
18. `negotiation.turn_received` fires when graph yields for external agent
19. `negotiation.completed` fires when negotiation finalizes
20. Payloads are HMAC-SHA256 signed with `X-Index-Signature` header
21. Auto-disable after 10 consecutive delivery failures

### API Key Management
22. Users can create API keys from the Settings page
23. Full key is shown once on creation with copy functionality
24. Users can list their keys (masked) and see last-used timestamps
25. Users can revoke/delete keys
26. API keys authenticate MCP requests correctly (already working, verify no regression)

## Tracking

- Webhooks: [IND-223](https://linear.app/indexnetwork/issue/IND-223/event-webhooks-protocol-implementation)
