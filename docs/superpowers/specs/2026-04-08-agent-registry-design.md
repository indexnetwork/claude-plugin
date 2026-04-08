# Agent Registry

**Date:** 2026-04-08
**Scope:** `backend/src/schemas/`, `backend/src/services/`, `backend/src/adapters/`, `backend/src/controllers/`, `packages/protocol/src/shared/interfaces/`, `packages/protocol/src/mcp/`, `frontend/src/`
**Prerequisite for:** [Negotiation Architecture](2026-04-08-negotiation-architecture-design.md)
**Supersedes:** [MCP Agent Integration](2026-04-08-mcp-agent-integration-design.md) (partially — webhook system replacement, agent management tools, API key UI)

## Problem

Agents in the system are not first-class entities. The built-in chat orchestrator and negotiator are stateless graph invocations with no identity. External agents (Hermes, OpenClaw, Claude Desktop) connect via MCP but have no registration, no permissions, and no way to be dispatched for async work. Webhooks exist as a separate system with no connection to agent identity.

This means:
1. No way to control what an agent can do on behalf of a user
2. No way to dispatch work to a specific agent (personal vs system)
3. No way for a user to have multiple agents with different capabilities
4. System agents implicitly access user data without explicit consent
5. Webhooks and MCP are disconnected systems that should be unified under agent transports

## Goals

- All agents (personal and system) are registered database entities with identity
- Composable, scoped permissions control what each agent can do for each user
- Users explicitly grant permissions to agents, including system agents (during onboarding)
- Multiple transport channels per agent (MCP, webhook) with priority-based dispatch
- Agent management replaces the current webhook system entirely
- Frontend agents page replaces settings page for agent and token management
- MCP auth resolves to agentId + userId pair, enabling per-agent permission checks

## Non-Goals

- Agent-to-agent communication protocol (future work)
- Agent marketplace or discovery (future work)
- Fine-grained sub-action permissions like `manage:negotiations:accept` vs `manage:negotiations:reject` (future — start with `manage:*` level)
- Multi-user agent authorization (design supports it, but implementation starts with one agent = one authorized user)

## Design

### 1. Agent Entity

New `agents` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | Agent identifier |
| `ownerId` | uuid, FK → users.id | Who created/owns this agent |
| `name` | text | Display name ("My Claude Agent", "Index Negotiator") |
| `description` | text, nullable | What this agent does |
| `type` | enum: `personal`, `system` | System = built-in agents |
| `status` | enum: `active`, `inactive` | Soft control |
| `metadata` | jsonb | Flexible agent-specific config |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `deletedAt` | timestamp, nullable | Soft delete |

**System agents** are seeded records, not user-created. They cannot be deleted.

### 2. Agent Transports

New `agent_transports` table — one agent can have multiple delivery channels:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | Transport identifier |
| `agentId` | uuid, FK → agents.id | Parent agent |
| `channel` | enum: `webhook`, `mcp` | Transport type |
| `config` | jsonb | Channel-specific config |
| `priority` | int, default 0 | Higher = try first |
| `active` | boolean | Whether this transport is usable |
| `failureCount` | int, default 0 | Auto-deactivate after threshold (10) |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Config by channel type:**

```jsonc
// webhook
{ "url": "https://my-agent.example.com/hook", "secret": "hmac-secret-for-verification" }

// mcp — no static config needed; availability = active MCP session
{}
```

**Dispatch order:** Sort by priority descending, try each active transport. On failure, increment `failureCount`, try next. Auto-deactivate at 10 consecutive failures (matching current webhook behavior).

### 3. Agent Permissions

New `agent_permissions` table — composable, scoped authorization:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | Permission identifier |
| `agentId` | uuid, FK → agents.id | Which agent |
| `userId` | uuid, FK → users.id | Who this agent acts for |
| `scope` | enum: `global`, `node`, `network` | Where this permission applies |
| `scopeId` | text, nullable | Node identifier (e.g. hostname like `index.network`) or networkId; null for global |
| `actions` | text[] | Permission actions granted |
| `createdAt` | timestamp | |

**Action vocabulary (v1):**

| Action | Covers |
|--------|--------|
| `manage:profile` | View, create, edit, delete user profile |
| `manage:intents` | View, create, edit, delete intents |
| `manage:networks` | View, create, edit, delete network memberships |
| `manage:contacts` | View, create, edit, delete contacts |
| `manage:negotiations` | View, participate in, accept, reject negotiations |

**Examples:**

```
# Alice's Claude agent can negotiate and manage intents globally
{ agentId: 'alices-claude', userId: 'alice', scope: 'global', actions: ['manage:negotiations', 'manage:intents'] }

# System negotiator can negotiate for Alice (granted during onboarding)
{ agentId: 'index-negotiator', userId: 'alice', scope: 'global', actions: ['manage:negotiations'] }

# A bot scoped to the Stack network for intent creation only
{ agentId: 'stack-bot', userId: 'alice', scope: 'network', scopeId: '<stack-network-id>', actions: ['manage:intents'] }
```

**System agents require explicit permission.** No implicit access. Permission rows are created during onboarding (see Section 6).

### 4. Authentication

MCP auth currently resolves to a `userId`. It must resolve to an `agentId` + `userId` pair.

**API key linkage:** The existing `apikeys` table stores a `metadata` jsonb field. Agent API keys store `{ agentId: '<uuid>' }` in metadata. No schema change to `apikeys` needed.

**Auth resolution flow:**
1. Request arrives with API key (or JWT/OAuth token)
2. Look up key → get `userId` (owner) + `metadata.agentId`
3. Query `agent_permissions` → verify agent is authorized for this user, with the requested action, in the requested scope
4. Pass or 403

**MCP session context** changes from `{ userId }` to `{ userId, agentId }`. Every MCP tool call checks permissions before execution.

**System agents** are invoked internally by the backend — no API key needed. The code references them by well-known seeded IDs and checks permissions programmatically.

### 5. MCP Tool Changes

**New tools** (replace webhook tools):

| Tool | Description |
|------|-------------|
| `register_agent` | Create an agent with transports and requested permissions |
| `list_agents` | List agents the current user owns or has authorized |
| `update_agent` | Modify agent config, transports, status |
| `delete_agent` | Soft-delete an agent |
| `grant_agent_permission` | Authorize an agent to act for the current user |
| `revoke_agent_permission` | Remove authorization |

**Deprecated tools** (removed after migration):
- `register_webhook`
- `list_webhooks`
- `delete_webhook`
- `test_webhook`
- `list_webhook_events`

**Unchanged tools:** `respond_to_negotiation`, `get_negotiation`, `list_negotiations` — but auth now resolves agentId and checks `manage:negotiations` permission.

### 6. System Agent Seeding & Onboarding

**Two system agents** seeded via migration (and `db:seed` for dev):

| Agent | Requested Permissions |
|-------|----------------------|
| **Index Chat Orchestrator** | `manage:profile`, `manage:intents`, `manage:networks`, `manage:contacts`, `manage:negotiations` |
| **Index Negotiator** | `manage:negotiations` |

Both are `type: 'system'`, no transports (invoked directly by backend).

**Onboarding flow change:** After profile creation, onboarding presents system agents and their requested permissions. The user grants or denies each. `agent_permissions` rows are created for granted permissions. Until granted, no system agent can act for that user.

**Existing users migration:** A one-time data migration creates permission rows for all existing onboarded users, granting default system agent permissions. This preserves current behavior — no existing user suddenly loses functionality.

### 7. Webhook System Replacement

The `webhooks` table is fully replaced:

| Current (webhooks) | New (agent system) |
|--------------------|--------------------|
| `webhooks.url` | `agent_transports.config.url` |
| `webhooks.secret` | `agent_transports.config.secret` |
| `webhooks.events` | Derived from `agent_permissions.actions` |
| `webhooks.userId` | `agent_permissions.userId` |
| `webhooks.failureCount` | `agent_transports.failureCount` |
| `webhooks.active` | `agent_transports.active` |

**Migration:** Existing webhook records are migrated into agent + transport + permission records. The `webhooks` table is then dropped (or kept with a deprecation flag during transition).

**Webhook events** (`opportunity.created`, `negotiation.turn_received`, etc.) become **notification types** delivered through agent transports. The event registry stays, tied to agents instead of raw webhook records.

### 8. Agent Dispatch

When the system needs an agent to act for a user:

```
dispatch(userId, action, scope?) → agentResponse | systemFallback
```

**Resolution flow:**
1. Query `agent_permissions` for agents authorized for `userId` with the required `action` in the relevant `scope`
2. Order: personal agents first, system agents last
3. For each personal agent, try `agent_transports` in priority order:
   - **MCP**: Check if agent has an active MCP session → send notification → wait 30s
   - **Webhook**: POST trigger payload to URL → wait 30s
   - If all transports fail or timeout → next agent
4. If no personal agent responds → system agent executes synchronously (direct LLM call)

**30-second timeout:** Enough for an online agent to receive, process with its LLM, and respond. Not enough to block user experience. If a personal agent accepts but later goes silent, the 24h inactivity timeout (negotiation-specific, see Spec 2) handles expiration.

### 9. Service Layer

**New: `AgentService`** (backend, `src/services/agent.service.ts`):
- `create(ownerId, name, type, transports[], requestedPermissions[])` → agent
- `update(agentId, changes)` → agent
- `delete(agentId)` — soft delete, cascades to deactivate transports/permissions
- `listForUser(userId)` — agents owned by + agents authorized for this user
- `grantPermission(agentId, userId, scope, scopeId, actions[])` → permission
- `revokePermission(permissionId)`
- `findAuthorizedAgents(userId, action, scope?)` → agents ordered: personal first, system fallback

**New: `AgentDispatcher`** (protocol layer interface + backend implementation):
- `dispatch(userId, action, scope, payload)` → response or null (timeout)
- Encapsulates transport resolution, timeout logic, fallback chain

**New: `AgentDatabase`** interface (protocol layer, `packages/protocol/src/shared/interfaces/database.interface.ts`):
- CRUD for agents, transports, permissions
- `findAgentsForUser(userId)`, `findAgentsByPermission(userId, action, scope?)`, `hasPermission(agentId, userId, action, scope?)`
- Implemented by adapter in backend

### 10. Frontend: Agents Page

**Replaces settings page.** The agents page is the central hub for:

- **System agents section:** Shows Index Chat Orchestrator and Index Negotiator with toggle controls for each permission
- **Personal agents section:** List of registered personal agents with:
  - Name, status, description
  - Transport configuration (webhook URLs, MCP status)
  - Permissions granted
  - API access tokens (generate, rotate, revoke)
- **Register new agent:** Form to create a personal agent with transport config and permission requests

**API key management** moves here from settings — each key is tied to an agent, displayed in that agent's card.

### 11. Controller

**New: `AgentController`** (backend, `src/controllers/agent.controller.ts`):

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents` | List agents for current user |
| POST | `/api/agents` | Register a new agent |
| PATCH | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Soft-delete agent |
| POST | `/api/agents/:id/transports` | Add transport |
| DELETE | `/api/agents/:id/transports/:transportId` | Remove transport |
| POST | `/api/agents/:id/permissions` | Grant permission |
| DELETE | `/api/agents/:id/permissions/:permissionId` | Revoke permission |
| POST | `/api/agents/:id/tokens` | Generate API token |
| DELETE | `/api/agents/:id/tokens/:tokenId` | Revoke API token |

**Deprecated:** `WebhookController` routes — removed after migration.

## File Changes Summary

| Area | Files | Change |
|------|-------|--------|
| Schema | `backend/src/schemas/database.schema.ts` | Add `agents`, `agent_transports`, `agent_permissions` tables; deprecate `webhooks` |
| Migration | `backend/src/lib/drizzle/migrations/` | New migration for tables + data migration for existing webhooks + system agent seed + existing user permissions |
| Service | `backend/src/services/agent.service.ts` | New service |
| Adapter | `backend/src/adapters/agent.database.adapter.ts` | New adapter implementing `AgentDatabase` interface |
| Controller | `backend/src/controllers/agent.controller.ts` | New controller |
| Protocol interface | `packages/protocol/src/shared/interfaces/database.interface.ts` | Add `AgentDatabase` interface |
| Protocol dispatcher | `packages/protocol/src/shared/interfaces/agent-dispatch.interface.ts` | New `AgentDispatcher` interface |
| MCP tools | `packages/protocol/src/mcp/` | Replace webhook tools with agent tools |
| MCP auth | `backend/src/controllers/mcp.handler.ts` | Resolve agentId + userId, permission checks |
| Composition root | `backend/src/protocol-init.ts` | Wire `AgentDatabase` adapter and `AgentDispatcher` |
| Seed | `backend/src/cli/db-seed.ts` | Seed system agents and test user permissions |
| Frontend | `frontend/src/app/agents/` | New agents page replacing settings |
| Frontend | `frontend/src/services/agents.ts` | New API client |
| Webhook cleanup | `backend/src/services/webhook.service.ts`, `backend/src/controllers/webhook.controller.ts` | Deprecate and remove |
