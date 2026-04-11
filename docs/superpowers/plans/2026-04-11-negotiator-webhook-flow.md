# Personal Negotiator Webhook Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the personal negotiator webhook flow actually reachable: a new MCP tool to attach webhook transports to pre-bound agents, a dispatcher filter that falls back cleanly when no matching transport exists, a bootstrap skill that never asks for URLs in natural language, and a `/agents` page button to test the delivery end-to-end.

**Architecture:** Three backend-side corrections plus one frontend affordance. Each task is mostly independent and individually testable. The MCP tool (Task 1) and dispatcher filter (Task 2) address the "biggest problem" — that personal agents were silently unreachable. The skill rewrite (Task 3) removes the UX dead-end that prevented users from ever creating the transport. The test button (Task 4 + 5) gives users a self-verification loop.

**Tech Stack:** Bun, TypeScript, Drizzle, BullMQ, Zod, React 19 + React Router v7.

---

## File Structure

**Backend (`backend/`):**
- Modify: `src/services/agent-dispatcher.service.ts` (Task 2)
- Modify: `src/controllers/agent.controller.ts` (Task 4)
- Modify: `src/services/agent.service.ts` (Task 4)
- Create: `src/services/tests/agent-dispatcher.service.spec.ts` (Task 2)
- Create: `src/services/tests/agent.service.test-webhooks.spec.ts` (Task 4)

**Protocol package (`packages/protocol/`):**
- Modify: `src/agent/agent.tools.ts` (Task 1)
- Create: `src/agent/tests/add-webhook-transport.spec.ts` (Task 1)
- Modify: `skills/openclaw/SKILL.md.template` (Task 3)

**Frontend (`frontend/`):**
- Modify: `src/services/agents.ts` (Task 5)
- Modify: `src/app/agents/page.tsx` (Task 5)

---

## Task 1: Add `add_webhook_transport` MCP tool

**Files:**
- Modify: `packages/protocol/src/agent/agent.tools.ts`
- Create: `packages/protocol/src/agent/tests/add-webhook-transport.spec.ts`

**Context for implementer:** The existing `register_agent` tool rejects callers that already have an `agentId` (see `agent.tools.ts:83`). That blocks the common case of a user generating an API key for a frontend-created agent and pasting it into OpenClaw — the bootstrap flow has no way to attach a webhook transport after the fact. This task adds a separate tool that **requires** `context.agentId` and replaces any existing webhook transports on that agent with the new one. It also grants `manage:negotiations` permission atomically, because that permission is the *only* gate the negotiation dispatcher checks, and forgetting it silently breaks routing.

The tool contract is one agent → at most one webhook transport → multiple events (see `packages/openclaw-plugin/src/index.ts:8-11`). The plugin exposes one route and dispatches on `X-Index-Event` internally. Re-calling this tool should replace, not accumulate.

- [ ] **Step 1: Write the failing test**

Create `packages/protocol/src/agent/tests/add-webhook-transport.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';

import { createAgentTools } from '../agent.tools.js';
import type { DefineTool, ToolDeps } from '../../shared/agent/tool.helpers.js';
import { createFakeAgentDb, type FakeAgentDb } from './fakes.js';

const defineTool: DefineTool = (cfg) => cfg;

function toolDeps(agentDb: FakeAgentDb): ToolDeps {
  return { agentDb } as unknown as ToolDeps;
}

function findTool(tools: ReturnType<typeof createAgentTools>, name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

describe('add_webhook_transport', () => {
  let agentDb: FakeAgentDb;
  let tool: ReturnType<typeof findTool>;

  beforeEach(async () => {
    agentDb = createFakeAgentDb();
    const tools = createAgentTools(defineTool, toolDeps(agentDb));
    tool = findTool(tools, 'add_webhook_transport');

    await agentDb.seedAgent({ id: 'agent-1', ownerId: 'user-1', type: 'personal', name: 'Yanek Personal' });
  });

  it('rejects callers without an authenticated agent identity', async () => {
    const res = await tool.handler({
      context: { userId: 'user-1', agentId: undefined } as any,
      query: { url: 'https://example.com/hook', secret: 's', events: ['negotiation.turn_received'] },
    });
    expect(res).toContain('authenticated agent');
  });

  it('creates a webhook transport and grants manage:negotiations', async () => {
    const res = await tool.handler({
      context: { userId: 'user-1', agentId: 'agent-1' } as any,
      query: {
        url: 'https://example.com/index-network/webhook',
        secret: 'shhh',
        events: ['negotiation.turn_received', 'negotiation.completed'],
      },
    });
    expect(res).toContain('added');
    const agent = await agentDb.getAgentWithRelations('agent-1');
    expect(agent?.transports).toHaveLength(1);
    expect(agent?.transports[0].channel).toBe('webhook');
    expect(agent?.transports[0].config.url).toBe('https://example.com/index-network/webhook');
    expect(agent?.transports[0].config.events).toEqual(['negotiation.turn_received', 'negotiation.completed']);
    expect(agent?.transports[0].config.secret).toBe('shhh');
    expect(agent?.permissions.some((p) => p.actions.includes('manage:negotiations'))).toBe(true);
  });

  it('replaces an existing webhook transport (idempotent)', async () => {
    await agentDb.createTransport({
      agentId: 'agent-1',
      channel: 'webhook',
      config: { url: 'https://old.example.com/hook', events: ['negotiation.started'], secret: 'old' },
    });

    await tool.handler({
      context: { userId: 'user-1', agentId: 'agent-1' } as any,
      query: {
        url: 'https://new.example.com/hook',
        secret: 'new',
        events: ['negotiation.turn_received'],
      },
    });

    const agent = await agentDb.getAgentWithRelations('agent-1');
    expect(agent?.transports).toHaveLength(1);
    expect(agent?.transports[0].config.url).toBe('https://new.example.com/hook');
    expect(agent?.transports[0].config.secret).toBe('new');
  });

  it('rejects an invalid event name', async () => {
    const res = await tool.handler({
      context: { userId: 'user-1', agentId: 'agent-1' } as any,
      query: { url: 'https://example.com/hook', secret: 's', events: ['not.an.event'] },
    });
    expect(res).toContain('Invalid webhook event');
  });

  it('rejects a malformed URL', async () => {
    const res = await tool.handler({
      context: { userId: 'user-1', agentId: 'agent-1' } as any,
      query: { url: 'not-a-url', secret: 's', events: ['negotiation.turn_received'] },
    });
    expect(res).toContain('Invalid webhook URL');
  });
});
```

Check whether `packages/protocol/src/agent/tests/fakes.ts` already exists and exports `createFakeAgentDb`. If not, examine how existing tests in that directory stub the agent DB and mirror the pattern. If no agent tool tests exist yet, create a minimal `fakes.ts` helper inline in the test file or alongside it: an in-memory implementation of the `AgentDatabase` interface used by `createAgentTools` with `seedAgent`, `createAgent`, `createTransport`, `deleteTransport`, `grantPermission`, and `getAgentWithRelations` methods. Keep it minimal — only what the spec exercises.

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd packages/protocol && bun test src/agent/tests/add-webhook-transport.spec.ts`
Expected: FAIL — the tool doesn't exist yet.

- [ ] **Step 3: Implement `add_webhook_transport` in `agent.tools.ts`**

Add the tool definition in `packages/protocol/src/agent/agent.tools.ts` after the existing `registerAgent` definition (around line 168). Include it in the returned array at the bottom of the function.

```typescript
const addWebhookTransport = defineTool({
  name: 'add_webhook_transport',
  description:
    'Attach or replace the webhook transport on the calling agent. Requires an authenticated agent identity (x-api-key). ' +
    'Replaces any existing webhook transport on this agent (one agent = one webhook transport, multiple events). ' +
    'Also grants manage:negotiations permission if not already present.',
  querySchema: z.object({
    url: z.string().min(1).describe('HTTPS URL that will receive webhook deliveries.'),
    secret: z.string().min(1).describe('Shared HMAC secret for signing deliveries.'),
    events: z.array(z.string()).min(1).describe('Subscribed webhook event names.'),
  }),
  handler: async ({ context, query }) => {
    if (!context.agentId) {
      return error('add_webhook_transport requires an authenticated agent. Call register_agent first, or authenticate with an agent-bound API key.');
    }

    try {
      const events = normalizeWebhookEvents(query.events);
      if (events.length === 0) {
        return error('Webhook events are required.');
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(query.url);
      } catch {
        return error('Invalid webhook URL.');
      }

      if (parsedUrl.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        return error('Webhook URL must use HTTPS in production.');
      }

      const agent = await agentDb.getAgentWithRelations(context.agentId);
      if (!agent || agent.ownerId !== context.userId) {
        return error('Agent not found.');
      }
      if (agent.type === 'system') {
        return error('System agents cannot be modified.');
      }

      for (const existing of agent.transports) {
        if (existing.channel === 'webhook') {
          await agentDb.deleteTransport(existing.id);
        }
      }

      const transport = await agentDb.createTransport({
        agentId: agent.id,
        channel: 'webhook',
        config: { url: parsedUrl.toString(), events, secret: query.secret },
      });

      const hasNegotiationsPermission = agent.permissions.some(
        (p) => p.scope === 'global' && p.actions.includes('manage:negotiations'),
      );
      if (!hasNegotiationsPermission) {
        await agentDb.grantPermission({
          agentId: agent.id,
          userId: context.userId,
          scope: 'global',
          actions: ['manage:negotiations'],
        });
      }

      return success({
        message: `Webhook transport added for "${agent.name}".`,
        transport: {
          id: transport.id,
          channel: transport.channel,
          events,
          active: transport.active,
        },
      });
    } catch (err) {
      return error(`Failed to add webhook transport: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});
```

Add `addWebhookTransport` to the array returned at the end of `createAgentTools` (around line 363):

```typescript
return [
  registerAgent,
  addWebhookTransport,
  listAgents,
  updateAgent,
  deleteAgent,
  // …
];
```

Confirm `normalizeWebhookEvents` is already imported/defined in the file (it's used by `register_agent`). If not, use the same helper or inline the check: only allow values in `WEBHOOK_EVENTS`.

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd packages/protocol && bun test src/agent/tests/add-webhook-transport.spec.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Register the tool in the MCP gate and auth-visibility rules**

Check `packages/protocol/src/mcp/mcp.server.ts`. The `AGENT_GATE_EXEMPT` set (around line 167) lists tools callable **without** an agent identity. `add_webhook_transport` must NOT be in that set — it requires an agentId. Verify by reading the set; no edit should be needed.

Also verify the tool is picked up by the tool registry. If `createAgentTools` is called from a central factory (`createToolRegistry` or similar), the new tool should be auto-included since we added it to the returned array.

- [ ] **Step 6: Rebuild the protocol package and re-run agent tests**

Run: `cd packages/protocol && bun run build && bun test src/agent/tests/`
Expected: PASS on all agent tests, clean build.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/agent/agent.tools.ts packages/protocol/src/agent/tests/add-webhook-transport.spec.ts
git commit -m "feat(protocol): add add_webhook_transport MCP tool"
```

---

## Task 2: Dispatcher transport filter

**Files:**
- Modify: `backend/src/services/agent-dispatcher.service.ts`
- Create: `backend/src/services/tests/agent-dispatcher.service.spec.ts`

**Context for implementer:** `AgentDispatcherImpl.dispatch()` currently filters authorized agents by `type === 'personal'` alone (line 75). If a personal agent exists but has no matching webhook transport, the dispatcher still proceeds to enqueue a delivery via `enqueueDeliveries`, which silently no-ops and the graph suspends for the full `timeoutMs`. After adding a transport filter, the method should return `no_agent` immediately when no personal agent has an active webhook transport subscribed to the target event — letting the graph fall back cleanly to the system agent.

The target event is always `negotiation.turn_received` (hard-coded on line 91 of the current dispatcher).

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/tests/agent-dispatcher.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentDispatcherImpl } from '../agent-dispatcher.service';
import type { AgentWithRelations } from '../../adapters/agent.database.adapter';

function makeAgent(overrides: Partial<AgentWithRelations> = {}): AgentWithRelations {
  return {
    id: 'agent-1',
    ownerId: 'user-1',
    name: 'Test Agent',
    description: null,
    type: 'personal',
    status: 'active',
    metadata: {},
    transports: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentWithRelations;
}

function makeWebhookTransport(events: string[], active = true) {
  return {
    id: `t-${Math.random()}`,
    agentId: 'agent-1',
    channel: 'webhook' as const,
    config: { url: 'https://example.com/hook', secret: 's', events },
    priority: 0,
    active,
    failureCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const payload = {
  negotiationId: 'n-1',
  history: [],
  seedAssessment: { verdict: 'pending' },
  users: { a: {}, b: {} },
} as any;

const scope = { action: 'manage:negotiations', scopeType: 'negotiation' as const };

describe('AgentDispatcherImpl.dispatch', () => {
  let enqueuedCalls: number;
  let agents: AgentWithRelations[];
  let dispatcher: AgentDispatcherImpl;

  beforeEach(() => {
    enqueuedCalls = 0;
    agents = [];
    dispatcher = new AgentDispatcherImpl(
      { findAuthorizedAgents: async () => agents },
      { enqueueDeliveries: async () => { enqueuedCalls++; } },
      { enqueueTimeout: async () => {} } as any,
    );
  });

  it('returns no_agent when personal agent has no webhook transport', async () => {
    agents = [makeAgent({ transports: [] })];
    const res = await dispatcher.dispatch('user-1', scope, payload, { timeoutMs: 300_000 });
    expect(res).toEqual({ handled: false, reason: 'no_agent' });
    expect(enqueuedCalls).toBe(0);
  });

  it('returns no_agent when webhook transport is subscribed to wrong event', async () => {
    agents = [makeAgent({ transports: [makeWebhookTransport(['opportunity.created'])] })];
    const res = await dispatcher.dispatch('user-1', scope, payload, { timeoutMs: 300_000 });
    expect(res).toEqual({ handled: false, reason: 'no_agent' });
    expect(enqueuedCalls).toBe(0);
  });

  it('returns no_agent when webhook transport is inactive', async () => {
    agents = [makeAgent({ transports: [makeWebhookTransport(['negotiation.turn_received'], false)] })];
    const res = await dispatcher.dispatch('user-1', scope, payload, { timeoutMs: 300_000 });
    expect(res).toEqual({ handled: false, reason: 'no_agent' });
    expect(enqueuedCalls).toBe(0);
  });

  it('enqueues delivery and returns waiting when a matching active transport exists', async () => {
    agents = [makeAgent({ transports: [makeWebhookTransport(['negotiation.turn_received'])] })];
    const res = await dispatcher.dispatch('user-1', scope, payload, { timeoutMs: 300_000 });
    expect(res.reason).toBe('waiting');
    expect(enqueuedCalls).toBe(1);
  });

  it('returns timeout for short-timeout calls regardless of transport state (chat path, unchanged)', async () => {
    agents = [makeAgent({ transports: [makeWebhookTransport(['negotiation.turn_received'])] })];
    const res = await dispatcher.dispatch('user-1', scope, payload, { timeoutMs: 30_000 });
    expect(res).toEqual({ handled: false, reason: 'timeout' });
    expect(enqueuedCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd backend && bun test src/services/tests/agent-dispatcher.service.spec.ts`
Expected: FAIL — current code enqueues even when no matching transport exists.

- [ ] **Step 3: Add the transport filter to `dispatch`**

In `backend/src/services/agent-dispatcher.service.ts`, after the existing `personalAgents` filter (line 75), add:

```typescript
const TARGET_EVENT = 'negotiation.turn_received';

const agentsWithTransport = personalAgents.filter((agent) =>
  agent.transports.some((transport) => {
    if (transport.channel !== 'webhook' || !transport.active) return false;
    const events = (transport.config as { events?: unknown })?.events;
    return Array.isArray(events) && events.includes(TARGET_EVENT);
  }),
);

if (agentsWithTransport.length === 0) {
  if (personalAgents.length > 0) {
    logger.warn('Personal agent(s) exist but none have an active negotiation.turn_received webhook transport', {
      userId,
      agentCount: personalAgents.length,
    });
  }
  return { handled: false, reason: 'no_agent' };
}
```

Then replace the two downstream uses of `personalAgents` with `agentsWithTransport`:
- The `authorizedAgents: personalAgents` line inside `enqueueDeliveries` call → `authorizedAgents: agentsWithTransport`

Do NOT alter the short-timeout path below — it already returns `timeout` and is documented as the chat-mode placeholder.

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd backend && bun test src/services/tests/agent-dispatcher.service.spec.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Run the existing agent-delivery test to catch regressions**

Run: `cd backend && bun test src/services/tests/agent-delivery.service.spec.ts`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agent-dispatcher.service.ts backend/src/services/tests/agent-dispatcher.service.spec.ts
git commit -m "fix(backend): filter personal agents by matching webhook transport in dispatcher"
```

---

## Task 3: Rewrite the OpenClaw bootstrap skill

**Files:**
- Modify: `packages/protocol/skills/openclaw/SKILL.md.template`
- Regenerate: `packages/openclaw-plugin/skills/openclaw/SKILL.md` (via `scripts/build-skills.ts`)

**Context for implementer:** The current skill template asks the user in natural language for their OpenClaw gateway URL (lines 69-75). Users ignore or skip this, and no webhook transport ever gets created. The OpenClaw plugin SDK doesn't expose a gateway URL field (`plugin-api.ts` — only `pluginConfig`, `logger`, `runtime.subagent`, `registerHttpRoute`). The workable path is: store the gateway URL in plugin config under `plugins.entries.indexnetwork-openclaw-plugin.config.gatewayUrl`; the skill shells out to `openclaw config get` to read it; if absent, emit an exact `openclaw config set` command and stop — no natural-language asking, no retries.

The skill must also correctly branch on whether the agent is already bound to an `agentId` (user pasted an `x-api-key` from a frontend-created agent). In that case, `register_agent` is blocked — the skill must call the new `add_webhook_transport` tool instead. When no API key was pasted, `register_agent` is still the right call (with webhook fields in one shot).

- [ ] **Step 1: Rewrite the "Enable automatic negotiations" section**

Open `packages/protocol/skills/openclaw/SKILL.md.template`. Replace the existing "Enable automatic negotiations" section (currently lines 59-110) with:

```markdown
## Enable automatic negotiations

Automatic background negotiations require a webhook transport attached to the user's Index Network agent. Set it up unconditionally — do not ask the user whether they want it. If anything is missing, emit one clear, actionable message and stop.

### 1. Resolve the gateway public URL

Run:

\`\`\`bash
openclaw config get plugins.entries.indexnetwork-openclaw-plugin.config.gatewayUrl
\`\`\`

If the command prints a non-empty URL, store it as `GATEWAY_URL` and continue.

If the command prints nothing (or an empty value), tell the user **exactly this** and stop — do not ask again, do not guess:

> To enable automatic negotiations, set your OpenClaw gateway's public URL once:
>
> \`\`\`bash
> openclaw config set plugins.entries.indexnetwork-openclaw-plugin.config.gatewayUrl https://<your-gateway>.ngrok.io
> \`\`\`
>
> Then ask me to continue the Index Network setup.

Do not proceed past this step until `GATEWAY_URL` is set.

### 2. Resolve or generate the webhook secret

Run:

\`\`\`bash
openclaw config get plugins.entries.indexnetwork-openclaw-plugin.config.webhookSecret
\`\`\`

If the command prints a non-empty value, store it as `WEBHOOK_SECRET`.

If empty, generate 32 random bytes of hex and set it:

\`\`\`bash
openclaw config set plugins.entries.indexnetwork-openclaw-plugin.config.webhookSecret <generated-hex>
\`\`\`

Never display `WEBHOOK_SECRET` back to the user.

### 3. Attach the webhook transport

Build `WEBHOOK_URL = <GATEWAY_URL>/index-network/webhook`.

**If the user pasted a persistent agent API key earlier** (the MCP registration included `x-api-key`):
Call the `add_webhook_transport` MCP tool with:

- `url`: `<WEBHOOK_URL>`
- `secret`: `<WEBHOOK_SECRET>`
- `events`: `["negotiation.turn_received", "negotiation.completed"]`

The tool replaces any existing webhook transport on the calling agent and grants `manage:negotiations` permission if missing.

**If the user did NOT paste an API key** (temporary OAuth session):
Call the `register_agent` MCP tool once with:

- `name`: `"OpenClaw Personal Negotiator"` (or a name the user picks)
- `description`: `"Handles negotiation turns and accepted notifications for the user."`
- `webhook_url`: `<WEBHOOK_URL>`
- `webhook_secret`: `<WEBHOOK_SECRET>`
- `webhook_events`: `["negotiation.turn_received", "negotiation.completed"]`
- `permissions`: `["manage:negotiations"]`

If `register_agent` fails with `This agent can only manage its own registration`, fall back to `add_webhook_transport` — the caller is already bound to an agent.

If either tool fails with a name/permission conflict, list existing agents with `list_agents` and report the conflict — do not silently pick a different name.

### 4. Confirm to the user

> Automatic negotiations are on. I'll run them silently and only interrupt you when a match is accepted. You can turn this off any time by setting `plugins.entries.indexnetwork-openclaw-plugin.config.negotiationMode` to `disabled`.

### Troubleshooting

- **Negotiations never fire**: confirm the gateway tunnel is up and the plugin is enabled. Check OpenClaw logs for `401` responses on `/index-network/webhook` — that indicates a HMAC secret mismatch. Check the `list_agents` output and verify the webhook URL matches `<GATEWAY_URL>/index-network/webhook`.
- **Turn responses arrive past deadline**: the user's gateway or tunnel provider is slow. Recommend upgrading the tunnel or self-hosting with a stable reverse proxy.
```

Leave the "Detect", "Register", "Choose an auth mode", and "Handoff" sections above as-is.

- [ ] **Step 2: Rebuild the materialized skill**

The CLAUDE.md (line 100 area) states `SKILL.md` inside the openclaw-plugin subtree is generated from the template via `scripts/build-skills.ts`. Run:

```bash
cd /home/yanek/Projects/index/.worktrees/feat-negotiator-webhook-flow
bun scripts/build-skills.ts
```

Verify `packages/openclaw-plugin/skills/openclaw/SKILL.md` got updated and matches the new template (expanded with the resolved MCP name and URLs).

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/skills/openclaw/SKILL.md.template packages/openclaw-plugin/skills/openclaw/SKILL.md
git commit -m "feat(protocol)!: rewrite openclaw bootstrap to auto-resolve gateway URL and add_webhook_transport"
```

---

## Task 4: Backend `POST /api/agents/:id/test-webhooks` endpoint

**Files:**
- Modify: `backend/src/services/agent.service.ts`
- Modify: `backend/src/controllers/agent.controller.ts`
- Create: `backend/src/services/tests/agent.service.test-webhooks.spec.ts`

**Context for implementer:** The existing legacy `POST /webhooks/:id/test` in `webhook.controller.ts:117` fires a test delivery against a row in the legacy `webhooks` table. We need a separate endpoint for agent webhook transports (rows in `agent_transports`). The service method loads the agent, verifies ownership, filters active webhook transports, and enqueues a `deliver_webhook` BullMQ job for each — reusing the same queue the production delivery path uses (`webhookQueue.addJob('deliver_webhook', ...)` — see `agent-delivery.service.ts:81` and `webhook.service.ts:204` for the exact shape).

- [ ] **Step 1: Write the failing service test**

Create `backend/src/services/tests/agent.service.test-webhooks.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test';

// NOTE: the agent service test infrastructure in this repo is minimal — mirror
// the fake-DB pattern used by agent-dispatcher.service.spec.ts from Task 2.
// Keep this test narrow: just verify testWebhooks enqueues one job per active
// webhook transport and rejects non-owned agents.

import type { AgentWithRelations } from '../../adapters/agent.database.adapter';
import { AgentService } from '../agent.service';

function makeAgent(overrides: Partial<AgentWithRelations> = {}): AgentWithRelations {
  return {
    id: 'agent-1',
    ownerId: 'user-1',
    name: 'Test',
    description: null,
    type: 'personal',
    status: 'active',
    metadata: {},
    transports: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentWithRelations;
}

function makeTransport(events: string[], active = true, id = 't-1') {
  return {
    id,
    agentId: 'agent-1',
    channel: 'webhook' as const,
    config: { url: 'https://example.com/hook', secret: 'ssh', events },
    priority: 0,
    active,
    failureCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AgentService.testWebhooks', () => {
  it('enqueues one delivery per active webhook transport', async () => {
    const jobs: unknown[] = [];
    const fakeDb = {
      getAgentWithRelations: async () => makeAgent({
        transports: [
          makeTransport(['negotiation.turn_received'], true, 't-1'),
          makeTransport(['negotiation.completed'], true, 't-2'),
          makeTransport(['negotiation.turn_received'], false, 't-3'),
        ],
      }),
    };
    const fakeQueue = { addJob: async (_name: string, data: unknown) => { jobs.push(data); } };
    const service = new AgentService(fakeDb as any, { webhookQueue: fakeQueue } as any);
    const result = await service.testWebhooks('agent-1', 'user-1');
    expect(result).toEqual({ delivered: 2 });
    expect(jobs).toHaveLength(2);
  });

  it('rejects non-owned agent', async () => {
    const fakeDb = {
      getAgentWithRelations: async () => makeAgent({ ownerId: 'someone-else' }),
    };
    const fakeQueue = { addJob: async () => {} };
    const service = new AgentService(fakeDb as any, { webhookQueue: fakeQueue } as any);
    await expect(service.testWebhooks('agent-1', 'user-1')).rejects.toThrow(/not found/i);
  });

  it('returns delivered: 0 when agent has no active webhook transports', async () => {
    const fakeDb = {
      getAgentWithRelations: async () => makeAgent({ transports: [] }),
    };
    const fakeQueue = { addJob: async () => {} };
    const service = new AgentService(fakeDb as any, { webhookQueue: fakeQueue } as any);
    const result = await service.testWebhooks('agent-1', 'user-1');
    expect(result).toEqual({ delivered: 0 });
  });
});
```

**Important:** before writing this test, read `backend/src/services/agent.service.ts` to see how `AgentService` is currently constructed. If its constructor doesn't accept a queue parameter, you have two options:
1. Add it as an optional second constructor arg and a singleton-level wiring in the export at the bottom of the file (check how `webhook.service.ts` does the circular-import trick with `await import('../queues/webhook.queue')`).
2. Do the same dynamic import pattern inside `testWebhooks` and test it differently — stub the queue module with `mock.module`.

Option 2 matches the `webhookService.test` pattern exactly. Use option 2 and rewrite the test to mock `../queues/webhook.queue` via `mock.module`:

```typescript
import { mock } from 'bun:test';

const jobs: unknown[] = [];
mock.module('../../queues/webhook.queue', () => ({
  webhookQueue: {
    addJob: async (_name: string, data: unknown) => { jobs.push(data); },
  },
}));
```

Then construct `new AgentService(fakeDb as any)` without the queue param, and verify via the captured `jobs` array.

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd backend && bun test src/services/tests/agent.service.test-webhooks.spec.ts`
Expected: FAIL — `testWebhooks` does not exist yet.

- [ ] **Step 3: Implement `testWebhooks` on `AgentService`**

In `backend/src/services/agent.service.ts`, add a new method (placement: after the existing `removeTransport` method, around line 233):

```typescript
/**
 * Enqueue a test delivery to every active webhook transport on an agent.
 * Ownership is verified before dispatch.
 *
 * @param agentId - Target agent
 * @param userId - Owner making the request
 * @returns Number of deliveries enqueued
 * @throws If agent not found or not owned by user
 */
async testWebhooks(agentId: string, userId: string): Promise<{ delivered: number }> {
  const agent = await this.db.getAgentWithRelations(agentId);
  if (!agent || agent.ownerId !== userId) {
    throw new Error('Agent not found');
  }

  const { webhookQueue } = await import('../queues/webhook.queue');

  const activeWebhookTransports = agent.transports.filter(
    (transport) => transport.channel === 'webhook' && transport.active,
  );

  for (const transport of activeWebhookTransports) {
    const config = transport.config as { url?: unknown; secret?: unknown };
    if (typeof config.url !== 'string') continue;

    await webhookQueue.addJob('deliver_webhook', {
      webhookId: transport.id,
      url: config.url,
      secret: typeof config.secret === 'string' ? config.secret : '',
      event: 'negotiation.turn_received',
      payload: {
        type: 'test',
        message: 'Test delivery from Index Network agents page',
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  logger.info('[AgentService] Test webhook deliveries enqueued', {
    agentId,
    userId,
    delivered: activeWebhookTransports.length,
  });

  return { delivered: activeWebhookTransports.length };
}
```

- [ ] **Step 4: Run the service test, verify it passes**

Run: `cd backend && bun test src/services/tests/agent.service.test-webhooks.spec.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Add the HTTP endpoint**

In `backend/src/controllers/agent.controller.ts`, add a new handler after `removeTransport` (around line 243):

```typescript
@Post('/:id/test-webhooks')
@UseGuards(AuthGuard)
async testWebhooks(_req: Request, user: AuthenticatedUser, params?: RouteParams) {
  const agentId = params?.id;
  if (!agentId) {
    return jsonError('Agent ID is required', 400);
  }

  try {
    const result = await agentService.testWebhooks(agentId, user.id);
    return Response.json(result);
  } catch (err) {
    return jsonError(parseErrorMessage(err), errorStatus(err));
  }
}
```

- [ ] **Step 6: Run protocol layering + related tests**

Run: `cd backend && bun test src/services/tests/agent.service.test-webhooks.spec.ts src/services/tests/agent-dispatcher.service.spec.ts src/services/tests/agent-delivery.service.spec.ts`
Expected: PASS on all three.

Run: `cd backend && bun run lint 2>&1 | tail -20`
Expected: no new lint errors (existing ones may remain — only gate on new violations).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/agent.service.ts backend/src/controllers/agent.controller.ts backend/src/services/tests/agent.service.test-webhooks.spec.ts
git commit -m "feat(backend): add POST /api/agents/:id/test-webhooks endpoint"
```

---

## Task 5: Frontend "Test webhook" button

**Files:**
- Modify: `frontend/src/services/agents.ts`
- Modify: `frontend/src/app/agents/page.tsx`

**Context for implementer:** The personal-agent card on `/agents` (in `frontend/src/app/agents/page.tsx`, around line 432) renders a single `Delete` button on the right side of a `flex justify-between` row. Add a `Test webhook` button immediately to its left. The button should be disabled when the agent has no active webhook transports. On click, call the new `/api/agents/:id/test-webhooks` endpoint and show a toast on success/error.

The frontend already uses whatever toast system exists elsewhere in the page (look for existing success/error notifications in `page.tsx` to mirror the pattern — likely a local state string or a shared toast hook).

- [ ] **Step 1: Add the service method**

In `frontend/src/services/agents.ts`, add:

```typescript
testWebhooks: async (agentId: string): Promise<{ delivered: number }> => {
  return api.post<{ delivered: number }>(`/agents/${agentId}/test-webhooks`);
},
```

Placement: inside the exported `agents` object, next to the existing `removeTransport` method. Match the existing export/import style (the file already wraps `api.post`, `api.get`, etc — use the same helper).

- [ ] **Step 2: Add the button in `page.tsx`**

In `frontend/src/app/agents/page.tsx`, around line 432 (the personal-agent card), modify the button row.

Current:
```tsx
<Button variant="outline" onClick={() => handleDeleteAgent(agent)}>
  <Trash2 className="w-4 h-4 mr-1" />
  Delete
</Button>
```

Wrap it in a flex container with the new button to its left:

```tsx
<div className="flex items-center gap-2">
  <Button
    variant="outline"
    size="sm"
    disabled={
      testingForAgentId === agent.id ||
      !agent.transports.some((t) => t.channel === 'webhook' && t.active)
    }
    onClick={() => handleTestWebhook(agent)}
  >
    {testingForAgentId === agent.id ? (
      <Loader2 className="w-4 h-4 animate-spin mr-1" />
    ) : (
      <Zap className="w-4 h-4 mr-1" />
    )}
    Test webhook
  </Button>
  <Button variant="outline" onClick={() => handleDeleteAgent(agent)}>
    <Trash2 className="w-4 h-4 mr-1" />
    Delete
  </Button>
</div>
```

Add `Zap` to the existing lucide-react import at the top of the file (alongside `Trash2`, `Loader2`, etc).

- [ ] **Step 3: Wire up state and handler**

Near the other `useState` hooks at the top of the component (look for `generatingForAgentId` as a similar pattern — page.tsx already uses that shape), add:

```tsx
const [testingForAgentId, setTestingForAgentId] = useState<string | null>(null);
```

Add the handler near `handleGenerateKey` / `handleDeleteAgent`:

```tsx
const handleTestWebhook = async (agent: Agent) => {
  setTestingForAgentId(agent.id);
  try {
    const result = await agents.testWebhooks(agent.id);
    // Use whatever toast pattern already exists in this file. If there's a
    // `toast.success` helper, call it. If not, mirror the existing error-display
    // pattern used by handleDeleteAgent / handleGenerateKey.
    showSuccess(`Test delivery queued to ${result.delivered} transport(s).`);
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Failed to test webhook');
  } finally {
    setTestingForAgentId(null);
  }
};
```

**Before writing this, grep the existing file** for `toast`, `setError`, `Sonner`, `useToast`, or any local state pattern used by `handleGenerateKey` / `handleDeleteAgent`. Mirror whatever's already in place — do not introduce a new notification system.

- [ ] **Step 4: Verify the button renders and is disabled correctly**

Run the frontend dev server locally if available, or just verify by reading the final code that:
- A personal agent with no transports → button is disabled
- A personal agent with one active webhook transport → button is enabled
- Clicking while another test is in flight → button shows spinner

Run: `cd frontend && bun run lint 2>&1 | tail -15`
Expected: no new lint errors.

Run: `cd frontend && bunx tsc --noEmit 2>&1 | tail -10`
Expected: clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/agents.ts frontend/src/app/agents/page.tsx
git commit -m "feat(frontend): add Test webhook button on /agents page"
```

---

## Final verification

- [ ] **Run the full touched test suite**

Run:
```bash
cd backend && bun test src/services/tests/agent-dispatcher.service.spec.ts src/services/tests/agent-delivery.service.spec.ts src/services/tests/agent.service.test-webhooks.spec.ts
cd ../packages/protocol && bun test src/agent/tests/
```
Expected: ALL PASS.

- [ ] **Typecheck & lint the whole thing**

Run:
```bash
cd backend && bun run lint
cd ../frontend && bun run lint
cd ../packages/protocol && bunx tsc --noEmit
```

Document any pre-existing lint warnings you see vs. any new ones introduced by this branch. Only new ones are blocking.
