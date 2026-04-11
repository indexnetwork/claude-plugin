# Personal Negotiator Webhook Flow — Design

## Problem

Users who register a personal agent via the frontend and paste its API key into OpenClaw cannot attach a webhook transport through the MCP bootstrap flow, so negotiations silently fall back to the in-process system `Index Negotiator` on both sides. Observed in production: a user's negotiation panel showed "Index Negotiator <> Index Negotiator" even though the user had a personal agent registered.

The failure is a chain:

1. `register_agent` rejects callers that already carry an `agentId` (MCP auth path binds API keys to agents). There is no MCP tool to **attach a webhook transport to an existing agent** — so a user who pre-created their agent via `/agents` has no MCP path to add a transport at all.
2. The negotiation dispatcher filters authorized agents by `type === 'personal'` alone. It does not check whether the agent has an active webhook transport subscribed to the target event. If a personal agent exists but has no matching transport, the dispatcher either (a) enqueues a no-op delivery and suspends the graph for the full `timeoutMs`, or (b) for short timeouts, returns `timeout` and falls back immediately — neither reflects the real state.
3. The OpenClaw bootstrap skill asks the user in natural language for their gateway public URL. Users skip the step or fumble it, and no webhook transport ever gets created. The OpenClaw plugin SDK does not expose a gateway URL field (`plugin-api.ts` confirmed: only `pluginConfig`, `logger`, `runtime.subagent`, `registerHttpRoute`).

## Goals

- Users with a pre-existing frontend-created agent can attach a webhook transport via MCP.
- The bootstrap skill never asks the user for a gateway URL in natural language. It either reads it from `openclaw config` or aborts with an exact command to run.
- Negotiations dispatch to the personal agent only when a matching active webhook transport exists; otherwise the graph falls back to the system agent immediately, cleanly, without waiting `timeoutMs` or silently no-opping.
- The `/agents` page gains a "Test webhook" button next to Delete that fires a synthetic `negotiation.turn_received` delivery to all active webhook transports on the agent, so users can verify their setup end-to-end.

## Non-goals

- Fixing the OpenClaw gateway-restart issue. User can't pull logs right now; deprioritized.
- Redesigning `register_agent` or agent permissions.
- Migrating existing legacy `webhooks` rows into `agent_transports`.
- Touching the frontend agents detail page. The new button lives on the list page only.

## Design

### 1. New MCP tool: `add_webhook_transport`

Lives in `packages/protocol/src/agent/agent.tools.ts` alongside the existing agent tools.

**Shape:**
```ts
{
  name: 'add_webhook_transport',
  description: 'Attach or replace the webhook transport on the calling agent. Requires an authenticated agent identity.',
  querySchema: {
    url: string,            // required
    secret: string,         // required
    events: string[],       // required, non-empty
  },
}
```

**Behavior:**
- Requires `context.agentId` to be set. If not, error: `This tool can only be called by an authenticated agent.`
- Validates `url` parses as a URL, enforces HTTPS in production.
- Validates `events` are all in the `WEBHOOK_EVENTS` registry.
- Deletes all existing webhook transports on the agent (idempotent replacement — we're single-transport by contract).
- Creates one new webhook transport with `{ url, events, secret }` in config.
- Also grants `manage:negotiations` permission at `scope: 'global'` if not already present. This is the permission the dispatcher checks; without it, the agent is invisible to negotiation dispatch even with a transport.
- Returns `{ message, transport: { id, channel, events } }` with the secret masked.

**Why idempotent replacement:** the contract established in the OpenClaw plugin (`packages/openclaw-plugin/src/index.ts:8-11`) is **one agent → one webhook transport → multiple events**. Re-calling the tool should replace, not accumulate.

### 2. Dispatcher transport filter

`backend/src/services/agent-dispatcher.service.ts`: after the `type === 'personal'` filter, apply a second filter that keeps only agents with at least one webhook transport where `active === true` and `config.events` includes the target event name (`'negotiation.turn_received'`).

**Return paths:**
- Filter empty → `{ handled: false, reason: 'no_agent' }` (fast fallback)
- Short timeout (`≤60_000ms`) → still `{ reason: 'timeout' }` as before (unchanged — chat path is documented as not-yet-implemented)
- Long timeout with matching transports → enqueue deliveries, return `waiting` (unchanged)

Add a single warn log when a user has personal agents but none have a matching transport — that's the signal a user's bootstrap silently failed.

### 3. OpenClaw plugin: read gateway URL from `pluginConfig`

No plugin code change. The plugin already accepts arbitrary `pluginConfig` and uses `webhookSecret` from it. The skill (see step 4) will write `gatewayUrl` into the same config namespace.

### 4. Bootstrap skill rewrite

`packages/protocol/skills/openclaw/SKILL.md.template`:

**Auth-mode decision (before webhook setup):**
- Detect whether the MCP is already registered with an `x-api-key` header. If yes → the agent is pre-bound, skip `register_agent`.
- If no key → call `register_agent` in the single-shot form (with webhook fields).

**Webhook setup (unconditional after auth, replaces the "Do you want…" question):**
1. Shell out: `openclaw config get plugins.entries.indexnetwork-openclaw-plugin.config.gatewayUrl`
2. If empty, emit one message to the user with the exact `openclaw config set` command and stop. Do not ask again. Do not ask for the URL in prose.
3. If set, shell out similarly for `webhookSecret`. If empty, generate 32 random hex bytes and `openclaw config set` it.
4. Build full URL: `<gatewayUrl>/index-network/webhook`
5. Call `add_webhook_transport` (new) if an agent is already bound, or `register_agent` with webhook fields if not.
6. Confirm to user: `Automatic negotiations are on. I'll run silently and only interrupt you when a match is accepted.`

The skill file itself stays OpenClaw-specific per the existing split (MCP_INSTRUCTIONS is runtime-agnostic).

### 5. Frontend "Test webhook" button

**Backend endpoint:** `POST /api/agents/:id/test-webhooks` in `backend/src/controllers/agent.controller.ts`. Calls a new `agentService.testWebhooks(agentId, userId)` that:
- Loads the agent with relations, verifies ownership.
- For each active webhook transport, enqueues a `deliver_webhook` job with:
  - `event: 'negotiation.turn_received'`
  - `payload: { type: 'test', message: 'Test delivery from Index Network', timestamp: <now> }`
- Returns `{ delivered: number }`.

**Frontend:**
- `frontend/src/services/agents.ts`: add `testWebhooks(agentId): Promise<{ delivered: number }>`
- `frontend/src/app/agents/page.tsx`: render a `Test webhook` button to the LEFT of Delete on each personal-agent card. Disabled if the agent has no active webhook transport. Loading state during the POST. Toast on success (`Test delivery queued to N transport(s)`) or error.

## Out-of-scope ripples to watch

- The dispatcher's `hasPersonalAgent()` (used by the graph init node to pick `maxTurns`) is **not** updated to the transport-aware filter. That's intentional — a user who has a personal agent but no transport should still get longer turn budgets, since the plan is that their agent *will* be reachable once bootstrap completes. The dispatch-time filter is what matters for actual routing.
- Legacy `POST /webhooks/:id/test` stays untouched. It operates on a different table.

## Testing

- Unit: `add_webhook_transport` — happy path, missing agentId error, invalid events error, idempotent replacement.
- Unit: dispatcher transport filter — personal agent with matching transport → delivered; without → `no_agent`; with inactive transport → `no_agent`.
- Unit: `agentService.testWebhooks` — enqueues one job per active webhook transport; skips inactive; errors on unowned agent.
- Integration: `POST /api/agents/:id/test-webhooks` — 200 happy path, 403 on wrong owner, 404 on missing agent.
- Frontend: no test harness change beyond the existing agents page tests (if any); component renders the button conditionally.

## Open questions resolved

- **Why single `add_webhook_transport` tool and not generic `create_transport`/`delete_transport` pair?** One route, one secret, multiple events is the established plugin contract. A per-transport CRUD surface is premature.
- **Why grant `manage:negotiations` automatically in `add_webhook_transport`?** Because that's the *only* permission the negotiation dispatcher looks up, and the whole point of attaching a negotiation webhook is to be dispatchable. If a user adds the transport but forgets the permission, the agent is invisible to negotiation routing — same silent failure we're trying to eliminate. Making the tool grant it atomically removes the footgun.
