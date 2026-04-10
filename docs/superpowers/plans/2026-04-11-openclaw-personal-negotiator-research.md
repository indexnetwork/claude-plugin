# OpenClaw Personal Negotiator — SDK Discovery Research Note

**Date:** 2026-04-11
**Branch:** feat/openclaw-personal-negotiator
**Purpose:** Resolve the load-bearing open questions from the design spec before any code is written.

---

## Step 1: OpenClaw Plugin SDK Package Name and Exported Types

**Question:** What is the exact package name for the OpenClaw plugin SDK, what types does it export (`OpenClawPluginApi`, `PluginRuntime`, etc.), and is `register(api)` a default or named export?

**Answer:**

The SDK package is **`openclaw`** — a monolithic package that exposes the plugin surface via subpath imports. There is no separate `@openclaw/plugin-sdk` package.

Correct import paths (subpath-based, monolithic root import is deprecated and will be removed):

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
```

Other documented subpaths include:
- `openclaw/plugin-sdk/core` — `defineChannelPluginEntry`, `createChatChannelPlugin`, `defineSetupPluginEntry`, `buildChannelConfigSchema`
- `openclaw/plugin-sdk/channel-setup` — `createOptionalChannelSetupSurface`
- `openclaw/plugin-sdk/provider-auth` — `createProviderApiKeyAuthMethod`, `ensureApiKeyFromOptionEnvOrPrompt`, `upsertAuthProfile`
- `openclaw/plugin-sdk/runtime-store` — `createPluginRuntimeStore`
- Domain-specific helpers: `openclaw/plugin-sdk/channel-config-helpers`, `openclaw/plugin-sdk/allow-from`, `openclaw/plugin-sdk/infra-runtime`, `openclaw/plugin-sdk/agent-runtime`, `openclaw/plugin-sdk/lazy-runtime`, `openclaw/plugin-sdk/routing`, etc.

The **entry point pattern** is `definePluginEntry({ id, name, description, register(api) {} })` exported as the default export, NOT a bare `export default function register(api)`. The `register(api)` callback is called internally by the host and receives an `OpenClawPluginApi` object.

Key `OpenClawPluginApi` fields (from the Registration API docs):

| Field | Type | Description |
|---|---|---|
| `api.id` | `string` | Plugin id |
| `api.name` | `string` | Display name |
| `api.version` | `string?` | Plugin version (optional) |
| `api.config` | `OpenClawConfig` | Full config snapshot |
| `api.pluginConfig` | `Record<string, unknown>` | Plugin-specific config from `plugins.entries.<id>.config` |
| `api.runtime` | `PluginRuntime` | Runtime helpers |
| `api.logger` | `PluginLogger` | Scoped logger (`debug`, `info`, `warn`, `error`) |
| `api.registrationMode` | `PluginRegistrationMode` | `"full"`, `"setup-only"`, or `"setup-runtime"` |
| `api.resolvePath(input)` | `(string) => string` | Resolve path relative to plugin root |

`PluginRuntime` namespaces: `api.runtime.agent`, `api.runtime.subagent`, `api.runtime.tts`, `api.runtime.config`, `api.runtime.events`, `api.runtime.logging`, and others.

**Source:** https://github.com/openclaw/openclaw/blob/main/docs/plugins/sdk-overview.md, https://github.com/openclaw/openclaw/blob/main/docs/plugins/building-plugins.md, https://docs.openclaw.ai/llms-full.txt (Registration API section)

**Implication for this plan:**

The current `packages/openclaw-plugin/src/index.ts` uses `export default function register(): void { }` — a bare function export that does not match the documented `definePluginEntry` wrapper. Task 1 must either:

1. Adopt `definePluginEntry` with the correct import path, or
2. Keep the bare function (the `openclaw.plugin.json` and existing plugin shape may already work with a bare default export — the `register(api)` callback docs say the host invokes it, and the existing stub uses the same pattern).

The design spec's code snippet in Component 1 uses `export default function register(api: OpenClawPluginApi): void` — a bare default export — not `definePluginEntry`. Given that the existing stub also uses a bare default export and the plugin is installed and working as a skills plugin today, the bare export appears to be the correct (or at least acceptable) shape for this plugin. **Use the bare `export default function register(api)` pattern as the spec shows** — do NOT switch to `definePluginEntry` unless the openclaw plugin loader rejects the bare export form. The type for `api` should be imported as needed from the subpath or defined inline in `plugin-api.ts` (which the plan already calls for).

The exact import path for the `OpenClawPluginApi` type, if needed, would be `openclaw/plugin-sdk/plugin-entry` (the `definePluginEntry` subpath), but since the plan already calls for a local `plugin-api.ts` with a minimal type shape, no SDK import is strictly needed for type safety at build time.

---

## Step 2: Subagent MCP Tool Inheritance (LOAD-BEARING)

**Question:** When `api.runtime.subagent.run({ sessionKey, message })` is invoked from a plugin, does the resulting subagent have access to MCP tools registered on the parent OpenClaw instance?

**Verdict: CONFIRMED (with a caveat on tool policy filtering)**

**Evidence:**

1. `sessions_spawn` docs (https://docs.openclaw.ai/tools/subagents): "The sub-agent inherits caller settings unless overridden."
2. `sessions_spawn` session-tool docs (https://docs.openclaw.ai/concepts/session-tool): "Sub-agents inherit a restricted tool set."
3. `tools.subagents.tools.allow` / `.deny` configuration controls which tools subagents can use (https://docs.openclaw.ai/llms-full.txt, tools.subagents Defaults). The existence of explicit allow/deny filtering implies tools ARE available by default and are filtered from the parent pool.
4. The subagent spawn docs describe sub-agents as "isolated delegated sessions" that "inherit configuration from the caller" — configuration includes the MCP pool that the parent instance has.

**Caveats:**

- Tool availability is subject to `tools.subagents.tools.allow` / `.deny` policy. If an operator explicitly denies MCP-based tools, the subagent cannot call them. The default policy does not deny MCP tools, so out-of-the-box the subagent will have access to all the parent's MCP tools including Index Network tools.
- The docs do not show a case where subagents receive a *separate* MCP configuration — they inherit the parent's. There is no mechanism in `api.runtime.subagent.run` to pass additional MCP servers.
- There is **no explicit statement** in the docs of the form "MCP server connections are inherited by subagents." The inference is strong (inheritance of "caller settings" + tool policy filtering) but is not verbatim. If this inference turns out to be wrong in practice, the fallback is to pass the Index Network API key through the subagent prompt text or environment, but this design assumes inheritance is functional.

**Source:** https://docs.openclaw.ai/tools/subagents, https://docs.openclaw.ai/concepts/session-tool, https://docs.openclaw.ai/llms-full.txt (tools.subagents Defaults section)

**Implication for this plan:**

Design holds. Proceed to implementation. Document the bootstrap skill's troubleshooting section with: "If the subagent cannot call `get_negotiation`, verify that `tools.subagents.tools.deny` does not block the Index Network MCP tools."

---

## Step 3: `api.runtime.subagent.run` Signature

**Question:** Confirm the actual type signature — `deliver: boolean`? `channel` parameter? Return value? Error handling?

**Answer:**

```typescript
const { runId } = await api.runtime.subagent.run({
  sessionKey: string,    // required — session key for the subagent
  message:    string,    // required — message to send to the subagent
  provider?:  string,    // optional override — requires operator opt-in
  model?:     string,    // optional override — requires operator opt-in
  deliver?:   boolean,   // optional — defaults to false
});
```

**`deliver: boolean`** — yes, confirmed. Defaults to `false` (silent).

**`channel` parameter** — **NOT present** in `api.runtime.subagent.run`. There is no `channel` field on this method. The webhook delivery docs (https://docs.openclaw.ai/automation/webhook) show `channel`, `to`, and `deliver` on the `/hooks/agent` HTTP endpoint, but these are not exposed in the SDK method. When `deliver: true`, routing goes to the session's default channel (i.e., the user's last active messaging channel). The design's spec note about `channel: "last"` is documented in the webhook endpoint, not in the SDK method — it describes the default behavior, not an explicit parameter.

**Return value** — returns a promise that resolves to `{ runId: string }`. This resolves when the subagent is **spawned**, not when it finishes. The spawn is non-blocking. To wait for completion: `await api.runtime.subagent.waitForRun({ runId, timeoutMs })`. For our use case (fire-and-forget for the turn route), we do not need to wait — spawning is sufficient before returning 202.

**Error handling** — not explicitly documented in the SDK docs. The spawn docs say the endpoint is "non-blocking and returns a receipt immediately." Based on the pattern, exceptions (e.g., spawn limit exceeded, agent not found, invalid sessionKey) would throw from the awaited promise. Catch in the handler and return 5xx to trigger webhook retry.

**Source:** https://github.com/openclaw/openclaw/blob/main/docs/plugins/sdk-runtime.md, https://github.com/openclaw/openclaw/blob/main/docs/plugins/architecture.md (Subagent Runtime Helper)

**Implication for this plan:**

1. **No `channel` parameter.** Remove `channel: "last"` from the design spec's `api.runtime.subagent.run` call in Component 1 (the `/index-network/event` route). The `deliver: true` will naturally route to the last active channel. The spec's architecture diagram mentions `channel: "last"` — this is the default behavior, not a parameter.
2. **Return value is `{ runId }`** not void. Update the plan's type shape in `plugin-api.ts` accordingly.
3. **`waitForRun` exists** if we ever need it (e.g., for testing or confirming completion). Not needed for the turn route.

---

## Step 4: `api.registerHttpRoute` Semantics

**Question:** Exact `RouteOptions` type, what does the handler receive, must it return `true`, what does `auth: "plugin"` give us?

**Answer:**

```typescript
api.registerHttpRoute({
  path:            string,         // required — route path under gateway HTTP server
  auth:            "gateway" | "plugin",  // required — auth mode
  match?:          "exact" | "prefix",    // optional — defaults to "exact"
  replaceExisting?: boolean,        // optional — allows replacing own route
  handler:         (req, res) => Promise<true | void>,  // required
});
```

**Handler signature:** The handler receives `(req, res)` — confirmed as Node.js `IncomingMessage`-compatible / `ServerResponse`-compatible objects (not Web Fetch `Request`/`Response`). The architecture docs and the existing plugin snippet both use `res.statusCode = 200; res.end("ok")` which is the Node `ServerResponse` API. The `_req`/`res` naming in the docs is just convention.

**Return value:** The handler must `return true` to signal that the request was handled. The docs explicitly state "Ensure the handler returns `true` when the route handled the request." A missing or falsy return value is presumably treated as unhandled (falls through or causes a 404).

**`auth: "plugin"`** — gives the plugin raw request access, meaning the body stream is NOT pre-parsed. The plugin receives raw `IncomingMessage` and must read the body itself. This is exactly what we need for HMAC verification (`readRawBody` helper). `auth: "gateway"` would apply normal gateway auth middleware first.

**Removed API:** `api.registerHttpHandler(...)` has been removed and causes a plugin-load error. Always use `api.registerHttpRoute(...)`.

**Other notes:**
- `exact + match` conflicts are rejected unless `replaceExisting: true`; one plugin cannot replace another plugin's route.
- Overlapping routes with different `auth` levels are rejected — keep a consistent auth level across prefix/exact chains.

**Source:** https://github.com/openclaw/openclaw/blob/main/docs/plugins/architecture.md (Gateway HTTP Routes), https://docs.openclaw.ai/llms-full.txt (POST /api/registerHttpRoute)

**Implication for this plan:**

Design is correct as written. The `verifyAndParse` helper that reads the raw body via `req.on('data', ...)` will work as expected. The handler returning `true` is already in the spec's Component 1 code snippets.

---

## Step 5: Tunnel / Gateway Public URL Exposure

**Question:** Is there a field on `api.config` or `api.runtime` exposing the current public URL of the OpenClaw gateway?

**Answer:**

`api.config` is the full `OpenClawConfig` snapshot. There is no documented `api.runtime.publicUrl` or `api.runtime.gateway` helper. The gateway configuration supports tunnel providers (`tunnel: { provider: "ngrok" }`) and `publicUrl` as a plugin-level config option (observed in the voice-call plugin config: `// publicUrl: "https://example.ngrok.app/voice/webhook"`), but this is a **plugin-level config value the user sets**, not something auto-exposed by the runtime.

The pattern across existing plugins (voice-call) is:
1. User sets `plugins.entries.<id>.config.publicUrl` (or `tunnel: { provider: "ngrok" }`) in their config.
2. The plugin reads `api.pluginConfig.publicUrl` (or derives it from the ngrok integration).

There is no runtime API that auto-exposes the resolved public URL (e.g., ngrok's dynamic hostname) to plugins at runtime — at least none documented.

**Source:** https://github.com/openclaw/openclaw/blob/main/docs/plugins/voice-call.md, https://github.com/openclaw/openclaw/blob/main/extensions/voice-call/README.md, https://github.com/openclaw/openclaw/blob/main/docs/install/fly.md (webhook tunneling configs)

**Implication for this plan:**

The bootstrap skill must prompt the user for their gateway public URL. The value should be read from `api.pluginConfig.gatewayUrl` (a config key we define in `openclaw.plugin.json`'s `configSchema`). The bootstrap skill sets this in the config at `plugins.entries.indexnetwork-openclaw-plugin.config.gatewayUrl`. Update `openclaw.plugin.json` to add `gatewayUrl` and `webhookSecret` to the `configSchema.properties`.

The spec's "Open questions" item 2 is now resolved: prompt the user, do not rely on `api.config` auto-discovery.

---

## Step 6: Index Network `register_agent` Transport Shape

**Question:** Can one `register_agent` call register multiple transports? What are the exact field names for webhook transport? How is `manage:negotiations` permission granted?

**Answer (from local source: `packages/protocol/src/agent/agent.tools.ts`):**

### Field names for webhook transport (in `register_agent`)

```
webhook_url:     string   // optional — the webhook URL
webhook_secret:  string   // optional — stored in transport config
webhook_events:  string[] // optional — array of subscribed event names
```

These map to the internal transport config:
```typescript
{
  url: string,
  events: string[],
  secret?: string,   // only stored if webhook_secret is provided
}
```

### Can one call register multiple transports?

**No.** A single `register_agent` call creates **one agent** with **at most one webhook transport**. The schema has singular `webhook_url`/`webhook_events` fields — not an array of transports.

However, `webhook_events` is an **array of strings**, so one transport can subscribe to **multiple event types**. One call with `webhook_events: ["negotiation.turn_received", "negotiation.completed"]` creates a single agent with a single transport URL that receives both event types.

There is no `add_transport` MCP tool to add a second URL to an existing agent after registration.

### Can `register_agent` be called incrementally (second call = second transport on same agent)?

**No.** Each `register_agent` call creates a new agent entity. There is no "add transport to existing agent" tool. Calling `register_agent` a second time creates a second, separate agent.

### How is `manage:negotiations` permission granted?

Two paths:

1. **At registration time**: `register_agent` accepts a `permissions: string[]` field. `permissions: ["manage:negotiations"]` grants the permission immediately as part of the registration call.
2. **Post-registration**: `grant_agent_permission` tool can be called separately with `agent_id`, `actions: ["manage:negotiations"]`, and optional `scope`.

The bootstrap skill should use path 1 (inline at registration) to minimize the number of MCP tool calls.

**Source:** `packages/protocol/src/agent/agent.tools.ts` (lines 69-168, `register_agent` handler), lines 279-328 (`grant_agent_permission` handler)

### Agent delivery routing

From `backend/src/services/agent-delivery.service.ts`: `enqueueDeliveries` iterates `authorizedAgents.flatMap(agent => agent.transports)` and filters each transport by `transport.config.events.includes(event)`. This means:

- One agent can have **multiple transports** in the DB (`agent_transports` table), each with different URL and events.
- But there is no MCP tool to add a second transport to an existing agent post-creation.
- The delivery service routes to each eligible transport independently.

**Implication for this plan:**

The design spec describes two separate webhook transports (one for `/turn`, one for `/event`). Given the constraint above, the **simplest bootstrap skill flow** is:

**Option A (recommended):** Register ONE agent with `webhook_events: ["negotiation.turn_received", "negotiation.completed"]` pointing to a single webhook URL (e.g., `<gateway>/index-network/webhook`). The plugin registers a single route that handles both event types by dispatching on the `X-Index-Event` header. The design's two-route split (`/turn` and `/event`) becomes two handler branches inside one route, or two routes that share a common incoming URL via a catch-all.

**Option B:** Register agent twice (two agents) to get two distinct transport URLs. This creates two separate agents in the user's account — messy.

**Option C:** Register agent once with events for turn, then call `grant_agent_permission` as a second step for negotiations scope, then manually add the second transport via a direct API call (not via MCP tools). This is not viable from the bootstrap skill.

**Recommendation: Use Option A.** This changes the plugin architecture slightly — one plugin route (or two routes that both check both event types) — but simplifies bootstrap and matches what the delivery service supports. The spec should be updated to reflect this.

---

## Step 7: Summary of Findings and Design Corrections

### Verdict Summary

| Step | Finding | Design Impact |
|---|---|---|
| 1 | SDK package is `openclaw`, subpath `openclaw/plugin-sdk/plugin-entry`; no `@openclaw/plugin-sdk` | Low — `plugin-api.ts` local type approach already decouples this; bare `register()` export OK |
| 2 | MCP tool inheritance CONFIRMED (subagents inherit parent caller settings including tools) | None — design holds |
| 3 | No `channel` parameter on `api.runtime.subagent.run`; returns `{ runId }` on spawn, not on finish | Minor — remove `channel: "last"` from spec's code snippets; update type in `plugin-api.ts` |
| 4 | Handler receives Node `IncomingMessage`/`ServerResponse`; must return `true`; `auth: "plugin"` = raw body | None — design is correct |
| 5 | No runtime gateway URL auto-discovery; user must configure `plugins.entries.<id>.config.gatewayUrl` | Medium — `openclaw.plugin.json` configSchema must add `gatewayUrl` and `webhookSecret` properties |
| 6 | `register_agent` creates one agent with at most one transport; `webhook_events` is an array; permissions inline at registration | Medium — bootstrap skill must use ONE `register_agent` call with both event types on one URL; update spec |

### Corrections to Later Tasks

**Task 1 (index.ts rewrite):**
- Remove `channel: "last"` from the `api.runtime.subagent.run` call in the `/index-network/event` handler. No `channel` parameter exists.
- Return type of `api.runtime.subagent.run` is `Promise<{ runId: string }>`. Update `plugin-api.ts` accordingly.

**Task 2 (webhook/verify.ts):**
- Header names confirmed: `X-Index-Signature` (with format `sha256=<hex>`) and `X-Index-Event`. Source: `backend/src/queues/webhook.queue.ts` lines 151-153.
- Body is `JSON.stringify({ event, payload, timestamp })` — the HMAC covers this wrapper object, not just the payload. The verifier must parse the outer wrapper and extract `payload` after verifying the signature.
- No correction needed to the verifier itself, but the return type of `verifyAndParse` should be the parsed **outer wrapper** `{ event: string, payload: unknown, timestamp: string }`, with the caller extracting `.payload` after verification.

**Task 4 (bootstrap skill / SKILL.md.template):**
- Register ONE agent with both event types on one URL (e.g., `<gatewayUrl>/index-network/webhook`) using `webhook_events: ["negotiation.turn_received", "negotiation.completed"]`. Include `permissions: ["manage:negotiations"]` inline.
- Add `gatewayUrl` and `webhookSecret` to `openclaw.plugin.json` `configSchema.properties`.
- Prompt the user for their gateway public URL (no auto-discovery from `api.config`).
- The bootstrap prompt should write `gatewayUrl` to `plugins.entries.indexnetwork-openclaw-plugin.config.gatewayUrl`.

**Task 5 (openclaw.plugin.json update — not in original plan, should be added):**
- Add `configSchema.properties.gatewayUrl` (string) and `configSchema.properties.webhookSecret` (string) so OpenClaw validates and exposes them through `api.pluginConfig`.

### Confirmed facts (no changes needed)
- Webhook body is `JSON.stringify({ event, payload, timestamp })` — HMAC covers the full wrapper.
- Headers are `X-Index-Signature: sha256=<hex>` and `X-Index-Event: <event-name>`.
- Webhook request timeout is 5 seconds — plugin handler must ACK before spawning subagent, not after.
- `deliver: false` is the correct default for silent turn handling.
- `deliver: true` routes to the user's last active channel for accepted-notification messages.
- `manage:negotiations` is a valid permission action string (from `AGENT_ACTIONS` in `agent.tools.ts` line 12).
