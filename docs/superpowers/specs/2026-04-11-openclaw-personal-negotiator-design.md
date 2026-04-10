# OpenClaw Personal Negotiator — Design

**Date:** 2026-04-11
**Status:** Draft — awaiting review
**Owner:** Yankı Ekin Yüksel

## Context

Index Network runs bilateral AI negotiations over every proposed opportunity: two `Index Negotiator` agents, one representing each user, debate whether the match genuinely serves both parties. Today both sides are handled by the **system** `Index Negotiator` unless a user has registered a **personal agent** with `manage:negotiations` scope — in which case `AgentDispatcher` routes that user's turn to their personal agent via webhook and suspends the graph until the agent replies via the `respond_to_negotiation` MCP tool.

The protocol side of this is built and wired:

- `AgentDispatcher.dispatch()` resolves personal agents first, falls back to system agents.
- Long-timeout (> 60 s) turns enqueue a `negotiation.turn_received` webhook delivery to every eligible transport and suspend the negotiation graph.
- `NegotiationEvents.onStarted / onTurnReceived / onCompleted` fan out to `AgentDeliveryService.enqueueDeliveries`, which fans out to agent-registry webhook transports.
- HMAC-signed delivery via the shared `deliver_webhook` job.
- MCP tools `get_negotiation`, `list_negotiations`, `respond_to_negotiation` exist on the Index Network MCP server.

**What's missing is the other end of the wire.** A user installs `@indexnetwork/openclaw-plugin`, registers as a personal agent with a webhook URL, and… nothing catches the webhook. The plugin today is a bootstrap-only skill with no HTTP surface, so personal-agent negotiation for OpenClaw users silently times out and falls back to the system agent on every turn.

This design closes that gap. It turns `@indexnetwork/openclaw-plugin` into an end-to-end personal negotiator: the plugin exposes HTTP routes on the OpenClaw gateway, verifies HMAC-signed webhook deliveries from Index Network, and launches **silent background subagent runs** via OpenClaw's `api.runtime.subagent.run` primitive. The subagent inherits the parent OpenClaw instance's MCP connection (including the Index Network `x-api-key` configured during bootstrap), calls `get_negotiation` to fetch context, and calls `respond_to_negotiation` to submit a turn. The user never sees a turn; they only see the final **connected with X** message when a negotiation ends in `hasOpportunity: true`.

## Research findings that shape the design

Context7 + local source exploration established these load-bearing facts about the current system:

1. **OpenClaw's plugin SDK has first-class background subagents.** `api.runtime.subagent.run({ sessionKey, message, deliver, provider?, model? })` launches an isolated LLM run. `deliver` defaults to `false`, meaning silent-by-default matches exactly what we want for automated negotiation turns.
2. **Plugin-managed HTTP routes give raw header access.** `api.registerHttpRoute({ path, auth: "plugin", handler })` hands the plugin raw `req`/`res`, which lets us verify `x-index-signature` HMACs ourselves. Previously removed `api.registerHttpHandler` is not an alternative path.
3. **NAT is solved at the gateway tunnel layer.** Users configure `tunnel: { provider: "ngrok" }` on their OpenClaw gateway (or self-host with a reverse proxy), and every plugin HTTP route is automatically reachable at `<gateway-public-url>/<plugin-path>`.
4. **MCP connections are inherited across subagent runs.** The Index Network MCP client the bootstrap skill registered during install is already in the parent instance's MCP pool, so any subagent run inside that instance gets the same tools with the same `x-api-key`.
5. **Subagent model overrides are operator-gated.** `plugins.entries.<id>.subagent.allowModelOverride` + `allowedModels` let operators pin which models the plugin may request. If we want a specific negotiation model, we document it — we don't hard-code.
6. **NegotiationEvents are already fanned out to agent transports.** `backend/src/main.ts:123-192` wires `onStarted`, `onTurnReceived`, and `onCompleted` through `agentDeliveryService.enqueueDeliveries`. No protocol-side event wiring is needed.

## Goals

- Deliver personal-agent negotiation for OpenClaw users end-to-end: webhook arrives → subagent runs → `respond_to_negotiation` called, with no human involvement unless a negotiation reaches `accepted`.
- Keep the silent-by-default contract: turn-received events produce **zero** user-facing output. Only `negotiation.completed` events where `outcome.hasOpportunity === true` surface as a chat message.
- Reuse the existing webhook delivery pipeline and MCP tools — zero protocol-side changes.
- Ship HMAC verification as plugin-managed auth (the webhook transport's shared secret is also the plugin's stored `webhookSecret`).
- Provide a single canonical location for the turn-handling prompt (shared between the two HTTP routes) and keep it trivially editable as the subagent's behavior is tuned.

## Non-goals

- **Short-timeout / chat-scope dispatch.** `AgentDispatcher.dispatch()` for `timeoutMs <= 60_000` currently falls back to the system agent because personal-agent transports are async-only. That stays. This design only covers the long-timeout path that negotiations use.
- **Non-negotiation webhook events.** This design does not route `intent.*`, `opportunity.*`, `index.*`, or any other events. The same pattern extends trivially to them, but each category gets its own scoped decision about whether silent automation is appropriate. Out of scope here.
- **Protocol-hosted "BYO-prompt" personal agents.** We are not adding a mode where the protocol runs a personal negotiation turn on the user's behalf. Personal agents run inside the user's runtime, by definition.
- **A standalone webhook receiver package** (the `bunx @indexnetwork/openclaw-plugin serve` fallback). OpenClaw's SDK is sufficient; the fallback is not needed.
- **OpenClaw gateway public-URL auto-discovery.** If `api.config` exposes the tunnel URL at runtime, we use it; otherwise the bootstrap skill prompts the user. Auto-discovery polish is deferred.
- **Bidirectional chat during a negotiation.** Subagents may not ask the user for clarification mid-turn. If the turn is ambiguous, they fall back to the most conservative action permitted by the user's profile and let the system continue.

## Architecture

```
Index Network Protocol                              User's OpenClaw instance
──────────────────────                              ────────────────────────
                                                                                   
NegotiationGraph                                    OpenClaw Gateway
  └── AgentDispatcher.dispatch(longTimeout)           (tunnel: ngrok)
        └── AgentDeliveryService                          ↓ public URL
              └── deliver_webhook job ────HMAC───▶  /index-network/turn
                                                      │   registerHttpRoute
                                                      │   auth: "plugin"
                                                      │   (verifyAndParse HMAC)
                                                      ▼
                                                   api.runtime.subagent.run({
                                                     sessionKey: "index:negotiation:<id>",
                                                     message: turnPrompt(payload),
                                                     deliver: false,
                                                   })
                                                      │
                                                      ▼
                                                   Background subagent
                                                   (inherits MCP + x-api-key)
                                                      │
                                                      ├── get_negotiation(negotiationId)
                                                      ├── read_user_profiles()      (optional)
                                                      ├── read_intents()            (optional)
                                                      └── respond_to_negotiation({
                                                            negotiationId,
                                                            action,
                                                            reasoning,
                                                            suggestedRoles,
                                                            message?,
                                                          })
                                                                        ↓ MCP
NegotiationGraph resumed ◀────────────────────────────────────────── Protocol

Later, when the negotiation completes:
                                                                                   
NegotiationEvents.onCompleted ───webhook──▶  /index-network/event
                                                      │   (HMAC verify)
                                                      │   if outcome.hasOpportunity:
                                                      ▼
                                                   api.runtime.subagent.run({
                                                     sessionKey: "index:event:<id>",
                                                     message: acceptedPrompt(payload),
                                                     deliver: true,
                                                     channel: "last",
                                                   })
                                                      ▼
                                                   User sees ONE message:
                                                   "You're now connected with <name> — <why>"
```

The asymmetry is intentional: every turn webhook runs a subagent silently; only the `negotiation.completed` webhook with a positive outcome runs a subagent that speaks. Everything else — rejections, turn-cap failures, timeouts, non-accepted completions — is absorbed without user interruption.

## Components

### 1. `packages/openclaw-plugin/src/index.ts` — upgrade from stub to full registration

The current entry point is a no-op. It becomes:

```ts
import type { OpenClawPluginApi } from '@openclaw/plugin-sdk'; // exact import TBD during implementation

import { verifyAndParse } from './webhook/verify.js';
import { turnPrompt } from './prompts/turn.prompt.js';
import { acceptedPrompt } from './prompts/accepted.prompt.js';

export default function register(api: OpenClawPluginApi): void {
  const secret = String(api.pluginConfig.webhookSecret ?? '');
  if (!secret) {
    api.logger.warn('No webhookSecret configured — Index Network webhook routes will reject all requests');
  }

  api.registerHttpRoute({
    path: '/index-network/turn',
    auth: 'plugin',
    match: 'exact',
    handler: async (req, res) => {
      const payload = await verifyAndParse(req, secret, 'negotiation.turn_received');
      if (!payload) {
        res.statusCode = 401;
        res.end('invalid signature');
        return true;
      }

      await api.runtime.subagent.run({
        sessionKey: `index:negotiation:${payload.negotiationId}`,
        message: turnPrompt(payload),
        deliver: false,
      });

      res.statusCode = 202;
      res.end('accepted');
      return true;
    },
  });

  api.registerHttpRoute({
    path: '/index-network/event',
    auth: 'plugin',
    match: 'exact',
    handler: async (req, res) => {
      const payload = await verifyAndParse(req, secret, 'negotiation.completed');
      if (!payload) {
        res.statusCode = 401;
        res.end('invalid signature');
        return true;
      }

      if (payload.outcome?.hasOpportunity === true) {
        await api.runtime.subagent.run({
          sessionKey: `index:event:${payload.negotiationId}`,
          message: acceptedPrompt(payload),
          deliver: true,
        });
      }

      res.statusCode = 202;
      res.end('accepted');
      return true;
    },
  });
}
```

Notes on the shape:

- Both routes are idempotent — Index Network may retry on non-2xx. A repeated delivery for the same `negotiationId + turnNumber` reuses the same `sessionKey`, so OpenClaw's session store deduplicates naturally.
- Rejection semantics on bad HMAC are **401**, not **403** — Index Network's delivery worker retries on 5xx but not 4xx, so a bad-signature response kills retries immediately (intentional: repeated retries on a bad signature would just keep bouncing).
- The handler returns `202 accepted` as soon as the subagent run is *enqueued*, not when it completes. Index Network's webhook delivery worker expects a fast ACK; the actual turn response lands asynchronously via the MCP tool.
- `api.logger.warn` on missing secret is intentional: we don't hard-fail plugin load, we just log and reject all inbound traffic. This lets users install the plugin before completing bootstrap without breaking OpenClaw startup.

### 2. `packages/openclaw-plugin/src/webhook/verify.ts` — HMAC verifier

```ts
import crypto from 'node:crypto';

export async function verifyAndParse<T = unknown>(
  req: { headers: Record<string, string | string[] | undefined>; on: (event: string, cb: (chunk: Buffer) => void) => void },
  secret: string,
  expectedEvent: string,
): Promise<T | null> {
  if (!secret) return null;

  const rawBody = await readRawBody(req);
  const signature = headerOf(req, 'x-index-signature');
  const event = headerOf(req, 'x-index-event');

  if (!signature || !event) return null;
  if (event !== expectedEvent) return null;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    return JSON.parse(rawBody.toString('utf8')) as T;
  } catch {
    return null;
  }
}
```

Helpers (`readRawBody`, `headerOf`, `timingSafeEqual`) live in the same file. The exact header names (`x-index-signature`, `x-index-event`) must match whatever the existing `deliver_webhook` job produces — confirmed during implementation by reading the worker source. If the current worker uses different names, the verifier conforms to reality; we do not change the protocol side.

### 3. `packages/openclaw-plugin/src/prompts/turn.prompt.ts` — canonical turn-handling prompt

Produces the string passed to `api.runtime.subagent.run({ message })`. Structure:

```
You are handling a live bilateral negotiation turn on behalf of your user on the Index Network.

A negotiation turn has landed. Before deciding, gather full context:

1. Call `get_negotiation` with negotiationId="<id>" to read the seed assessment, counterparty, history, and your user's context.
2. Call `read_user_profiles` and `read_intents` to ground yourself in what your user is actively looking for.
3. Consider whether the proposed match genuinely advances your user's active intents and fits their stated profile. Be honest — it is better to decline a weak match than to accept out of politeness.

Then call `respond_to_negotiation` with the decision. Valid actions:
  propose | counter | accept | reject | question

Action guidance:
- propose: first turn only, when you are the initiating side.
- accept: you are convinced this match benefits your user; the case has been made and objections answered.
- counter: you partially agree but have specific objections. State what is missing or weak.
- reject: the match does not serve your user's needs after consideration.
- question: ask the other side a concrete clarifying question.

You are operating silently on your user's behalf. Do not produce any user-facing output. Do not ask the user for clarification. If the turn is ambiguous, pick the most conservative action compatible with your user's profile — usually `counter` with specific objections, or `reject` with clear reasoning.

Turn payload:
  negotiationId: <id>
  turnNumber: <n>
  counterpartyAction: <action>
  counterpartyMessage: <message|null>
  deadline: <iso>
```

The `<...>` placeholders are interpolated from the webhook payload before invoking the subagent. The prompt is pure data — editing it does not require an OpenClaw restart.

### 4. `packages/openclaw-plugin/src/prompts/accepted.prompt.ts` — accepted-notification prompt

Structure:

```
A negotiation on the Index Network has ended with an accepted opportunity. Your job is to tell the user in one short, natural message.

Before writing:
1. Call `get_negotiation` to read the outcome's reasoning and the agreed roles.
2. Call `read_user_profiles` on the counterparty to get their name and a one-line context.

Then write one message to the user. Format:
  "You're now connected with <first name> — <one-line why>. <one-line counterparty context>."

Keep it under 30 words. No lists. No emojis. Do not expose negotiationId, UUIDs, role names, or internal vocabulary. Do not offer next steps unless the user's profile implies they want them.

Event payload:
  negotiationId: <id>
  outcome.hasOpportunity: true
  outcome.reasoning: <summary>
  outcome.agreedRoles: <roles>
  turnCount: <n>
```

### 5. Bootstrap skill updates — `packages/protocol/skills/openclaw/SKILL.md.template`

Changes to the existing skill template:

1. **After agent key generation** (current final step), add a new block that configures the plugin's webhook transports:
   - Resolve the gateway public URL. Read from `api.config` if possible (TBD during implementation — may require a small `api.runtime.*` helper check). If unavailable, prompt the user for their OpenClaw gateway public URL.
   - Generate a high-entropy shared secret (`crypto.randomBytes(32).toString('hex')`) — this becomes both the agent transport's HMAC secret and the plugin's `webhookSecret` config value.
   - Write the secret into OpenClaw config at `plugins.entries.indexnetwork-openclaw-plugin.config.webhookSecret`.
   - Call `register_agent` via MCP to add two webhook transports:
     - `url: <public>/index-network/turn`, `events: ["negotiation.turn_received"]`, `secret: <shared>`
     - `url: <public>/index-network/event`, `events: ["negotiation.completed"]`, `secret: <shared>`
   - Grant `manage:negotiations` scope.

2. **New troubleshooting block** at the end:
   - Negotiations never fire → check tunnel is up, check agent transports in `/agents` UI, check gateway logs for 401s on `/index-network/turn`.
   - Subagent runs but `respond_to_negotiation` fails → MCP auth drift; re-run bootstrap to refresh the key.
   - Turn response arrives past deadline → user's gateway or ngrok is slow; recommend upgrading tunnel.

### 6. MCP instructions update — `packages/protocol/src/mcp/mcp.server.ts`

Add a new section to `MCP_INSTRUCTIONS` (between `# Personal-index scoping` and `# Output rules`):

```markdown
# Negotiation turn mode
When invoked with a task prompt that describes a live negotiation turn (session key prefixed `index:negotiation:`), you are running as a silent background subagent representing your user in a bilateral negotiation. Fetch the full negotiation via `get_negotiation`, ground yourself in the user's profile and intents, and submit a response via `respond_to_negotiation`. Do not produce user-facing output; do not ask clarifying questions. If the decision is ambiguous, pick the most conservative action.
```

The prompt inside the plugin is the primary source of turn-handling behavior; this block exists so *any* MCP-connected agent (not just OpenClaw) that encounters an `index:negotiation:*` session key handles it consistently.

### 7. Plugin README updates — `packages/openclaw-plugin/README.md`

New section: **"Negotiation subagent"** documenting:
- What the plugin does automatically after bootstrap.
- How to pin a specific model: `plugins.entries.indexnetwork-openclaw-plugin.subagent.allowModelOverride: true` + `allowedModels: ["<model>"]`, with a recommended default.
- How to disable automatic negotiation handling if the user wants to review every turn manually: `plugins.entries.indexnetwork-openclaw-plugin.config.negotiationMode: "disabled"` — the plugin checks this flag before invoking `subagent.run` and returns 202 without doing anything when disabled. Falls back to the system `Index Negotiator` at Index Network's side.
- Privacy note: subagent runs are logged by OpenClaw's standard subagent logging. Users who want their runs redacted can configure OpenClaw's log scrubbing.

## Data flow walkthrough — one end-to-end negotiation

1. User A and User B are both Index Network users. User A has installed `@indexnetwork/openclaw-plugin` and completed bootstrap. User B has not — they use the default system agent.
2. A scoring pass surfaces a candidate match between them. An opportunity row is created with `status: negotiating`.
3. The negotiation graph starts. `dispatcher.hasPersonalAgent(userA, ...)` → true, `hasPersonalAgent(userB, ...)` → false. `maxTurns` is chosen as 8 (mixed scenario).
4. **Turn 1**: source is User A. `dispatcher.dispatch(userA, ..., { timeoutMs: 24*60*60*1000 })` fires. Long timeout path: `agentDeliveryService.enqueueDeliveries` pushes a `deliver_webhook` job with event `negotiation.turn_received` and payload `{ negotiationId, turnNumber: 1, counterpartyAction: "propose", ... }`. Graph suspends, timeout queue holds the resume token.
5. The `deliver_webhook` worker POSTs to `https://<userA-gateway>/index-network/turn` with HMAC signature.
6. OpenClaw gateway routes to the plugin's HTTP handler. `verifyAndParse` passes. The handler calls `api.runtime.subagent.run({ sessionKey: "index:negotiation:<id>", message: turnPrompt(payload), deliver: false })` and returns 202.
7. OpenClaw spawns a background subagent. The subagent inherits the parent instance's MCP client, sees Index Network tools, calls `get_negotiation(<id>)`. Gets back seed assessment, negotiation state, user contexts.
8. Subagent calls `read_intents()` (scoped to User A) to ground its judgment. Decides: `propose` is the initiating action, so this is a proposal turn. Decides action based on User A's stated intents.
9. Subagent calls `respond_to_negotiation({ negotiationId, action: "propose", reasoning, suggestedRoles })`. MCP handler resolves the turn and resumes the negotiation graph via the resume token.
10. Graph advances to Turn 2: responding side is User B → system agent handles it inline (short path through `IndexNegotiator` in `negotiation.graph.ts`). No webhook.
11. If User B's system agent counters, graph flips back to User A → another turn webhook → another subagent run in the plugin → another MCP response. Repeats until terminal action or turn cap.
12. When the negotiation ends, `NegotiationEvents.onCompleted` fires. `agentDeliveryService.enqueueDeliveries` pushes a `negotiation.completed` delivery. This fires both to User A's `/index-network/event` route (personal agent) and to any other subscribed transports.
13. User A's plugin receives the event. Verifies HMAC. Checks `payload.outcome.hasOpportunity`:
    - **If true (accepted)**: runs the accepted-prompt subagent with `deliver: true`. Subagent calls `get_negotiation` + `read_user_profiles` on the counterparty, writes one short message. OpenClaw delivers it to User A's `last` channel (Telegram / CLI / wherever).
    - **If false (reject, turn_cap, timeout)**: returns 202, does nothing.
14. User A sees, at most, one message per successful negotiation: `"You're now connected with <name> — ..."`. Everything else was handled in the background.

## Auth and security

- **Webhook HMAC**: shared secret set by the bootstrap skill, stored in OpenClaw's config at `plugins.entries.indexnetwork-openclaw-plugin.config.webhookSecret` and mirrored to Index Network as the agent transport's secret. Both sides use HMAC-SHA256 with timing-safe comparison.
- **Header names**: `x-index-signature` and `x-index-event`. The verifier enforces the event header matches what the route expects, so a turn-received delivery cannot trigger the accepted-notification path and vice versa.
- **Idempotency**: Index Network's delivery worker sets `jobId: webhook-neg-turn-<agentId>-<negotiationId>-<turnNumber>`. BullMQ dedupes by `jobId`, so duplicate deliveries for the same turn are already suppressed at the source. Even so, both routes are designed to be idempotent: the same `sessionKey` reuses the same subagent session, and `respond_to_negotiation` is idempotent per `(negotiationId, turnNumber)` on the protocol side.
- **No outbound secrets in prompts**: the turn prompt contains payload fields but not the shared secret, not the user's API key, not any HMAC material.
- **MCP tool access is inherited, not duplicated**: the plugin does not hold its own copy of the Index Network API key. The subagent inherits whatever MCP connections the user configured during bootstrap. Rotating the API key at the MCP layer also rotates the subagent's access — no secondary cleanup.
- **Plugin-scoped subagent model overrides**: gated by OpenClaw's `plugins.entries.<id>.subagent.allowModelOverride` — off by default. We document how to enable it; we never enable it ourselves.

## Error handling and edge cases

| Scenario | Behavior |
|---|---|
| Missing `webhookSecret` at plugin load | Plugin logs warning, still registers routes, all requests return 401. User sees the warning in logs and knows to complete bootstrap. |
| HMAC verify fails | 401 + short body, no retry. |
| Event header mismatches route expectation (e.g. someone POSTs `negotiation.completed` to `/turn`) | 401 (treated identically to bad HMAC — don't leak why). |
| Payload JSON parse fails after HMAC passes | 401. Signature verified but body is malformed — either corruption or sender bug. |
| Subagent run enqueue fails | 5xx to the webhook worker → worker retries with exponential backoff. Eventually the negotiation timeout queue fires and the graph falls back to the system agent for that turn. |
| Subagent runs but never calls `respond_to_negotiation` | Protocol's negotiation timeout queue fires after `timeoutMs`. Graph treats that turn as a timeout and falls back. No plugin-side recovery needed. |
| `outcome.hasOpportunity === false` | Event handler returns 202, no user-facing output. |
| Accepted-notification subagent errors while composing message | OpenClaw's subagent runner surfaces the error in its standard log. The user does not get a degraded fallback message — better silent failure than a corrupted "we connected you with…" line. Monitor via logs. |
| User disables automatic negotiation via config flag | Plugin checks `config.negotiationMode === "disabled"` before invoking `subagent.run`, returns 202 silently. Protocol-side falls back to system agent after timeout. |
| Subagent model override not allowed by operator | `subagent.run` rejects with an error. Plugin catches, logs, returns 5xx so the webhook retries. User should fix their config. |
| Short-timeout dispatch (chat-scope negotiation) | Unchanged — `AgentDispatcher.dispatch` short-timeout path already falls back to system agent; this design does not address it. |

## Testing strategy

- **Unit tests** (`packages/openclaw-plugin/src/webhook/tests/verify.spec.ts`): HMAC verification edge cases — valid signature, bad signature, missing headers, malformed body, event mismatch, missing secret.
- **Unit tests** for prompt builders: snapshot-style tests that pin the exact prompt string produced for a fixed payload, so unintended prompt drift is caught in review.
- **Integration test** (`backend/tests/personal-negotiator.integration.test.ts`): spin up the negotiation graph with a mock `AgentDispatcher` that routes to an in-process HTTP receiver implementing the same HMAC verify + subagent contract; assert that a full turn cycle completes and `respond_to_negotiation` is called with valid data. This does not require an actual OpenClaw instance.
- **Manual smoke test checklist** added to the plugin README: (a) bootstrap, (b) trigger a negotiation via the Index Network UI, (c) observe gateway logs for 202 on `/index-network/turn`, (d) observe a response recorded in the negotiation thread, (e) verify no chat message was posted until the accepted event fires.

Out of scope for this design: an end-to-end test that actually runs an OpenClaw instance + plugin against a live Index Network staging environment. That belongs in release QA.

## Open questions to resolve during implementation

1. **Exact header names** produced by the existing `deliver_webhook` job. Confirm by reading the worker source before writing the verifier. If they differ from `x-index-signature` / `x-index-event`, the verifier conforms — do not rename on the protocol side.
2. **`api.config` tunnel URL exposure**. Determine whether `api.config.plugins.entries.indexnetwork-openclaw-plugin.config` contains the public tunnel URL directly, whether `api.runtime` has a helper, or whether we need to prompt the user. Check the OpenClaw plugin SDK during bootstrap-skill work.
3. **`@openclaw/plugin-sdk` import path**. The SDK package name is a placeholder in this spec. Resolve during implementation — check the published plugin SDK or the type surface exposed by existing plugins like `voice-call`.
4. **Second webhook transport vs shared URL**. Index Network's agent-registry `transports` model — can one transport subscribe to multiple events and fan out by URL path, or do we genuinely need two transports? If one transport with multiple events works, the two HTTP routes just live in the same plugin handling two event types off one URL. Implementation choice, not architectural.
5. **Whether `register_agent` supports adding transports incrementally** or whether the agent must be registered with all transports in one call. Affects bootstrap skill flow but not the design.
6. **Subagent MCP tool inheritance** — *load-bearing*. This design assumes that a subagent launched via `api.runtime.subagent.run` inside an OpenClaw instance with a registered Index Network MCP server automatically has access to the Index Network MCP tools (`get_negotiation`, `read_user_profiles`, `respond_to_negotiation`, …) with the same `x-api-key` the bootstrap skill configured. Context7 docs describe the subagent runtime helper but do not explicitly state tool-inheritance semantics. **This must be verified before implementation begins.** If subagents do not inherit MCP tools, the fallback is for the plugin to pass a short-lived bearer/API key through the subagent's environment or via a plugin-scoped MCP client; if even that is not possible, the whole design collapses and we revisit the standalone-receiver path.
7. **`channel` parameter for `api.runtime.subagent.run`**. Context7's documented signature lists `sessionKey, message, provider, model, deliver` — no `channel`. The `/hooks/agent` HTTP endpoint accepts `channel: "last"` but the SDK method may not. If `deliver: true` without a channel override silently routes to the session's default channel, that is fine for our use case (the session will usually be the user's last interactive one). If `deliver: true` requires an explicit channel for the accepted-notification route, we either pass one through the plugin handler or derive it from `api.config`.

## Out of scope / future work

- Extending the same webhook→subagent pattern to `intent.*`, `opportunity.*`, `index.*` events. Each event type gets its own scoped design decision about whether silent automation is appropriate.
- Chat-scope (short-timeout) negotiation via personal agents. Today `AgentDispatcher` falls back to the system agent for `timeoutMs <= 60_000`. If we want personal agents to handle chat-scope turns, that requires synchronous webhook delivery or a different transport (likely WebSocket).
- Per-network or per-counterparty subagent preferences (e.g. "always accept intros from people in my Alumni network"). The subagent currently infers stance from profile + intents; a structured preferences field is a follow-up.
- A dashboard showing the subagent's decision history so users can audit what their personal agent has been accepting / rejecting on their behalf. Uses existing negotiation history under the hood.
- Telemetry on subagent decision quality (accept→connect rate vs reject→appealed rate) to tune the turn prompt over time.
