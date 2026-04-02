# MCP Server & Plugin Skill Rewrite — Design Spec

**Date:** 2026-04-02
**Status:** Approved

## Goal

Expose the protocol's 27 chat agent tools as an MCP server at `protocol.index.network/mcp`, then rewrite the Claude plugin skills to use MCP tools instead of CLI commands. This outsources the reasoning LLM to the user's own Claude instance while keeping the protocol's tool infrastructure unchanged.

## Architecture

### Approach

Integrated MCP endpoint on the existing protocol server (port 3001). The `/mcp` route is mounted in `main.ts` as a dedicated route block (same pattern as Better Auth), not through the decorator-based controller system. The MCP SDK's `WebStandardStreamableHTTPServerTransport` owns the request/response cycle.

### Transport

**Streamable HTTP** (stateless mode). Each request is independent — no session tracking (`sessionIdGenerator: undefined`). The client's LLM maintains conversational context, not the MCP server. Stateful sessions can be added later without breaking existing clients.

### Protocol Layer: MCP Server Factory

**Location:** `protocol/src/lib/protocol/mcp/mcp.server.ts`

The MCP server factory lives in `lib/protocol/` so that when the protocol becomes an NPM package, consumers can expose their own MCP server. It receives dependencies via constructor injection:

- `ToolDeps` (existing) — for building the tool registry
- `McpAuthResolver` (new interface) — for extracting userId from requests

**New interface:** `protocol/src/lib/protocol/interfaces/auth.interface.ts`

```ts
export interface McpAuthResolver {
  resolveUserId(request: Request): Promise<string>;
}
```

The factory:
1. Creates an `McpServer` from `@modelcontextprotocol/server`
2. Iterates over `createToolRegistry()` to register all 27 chat tools as MCP tools
3. Each MCP tool handler calls `McpAuthResolver.resolveUserId()` → `resolveChatContext()` → raw tool handler → returns MCP `content` blocks
4. Tool registry and compiled graphs are created once and shared across requests

No new interfaces needed beyond `McpAuthResolver`. The rest (`ToolDeps`, `CompiledGraphs`, database interfaces) already exists.

### Controller Layer: MCP Handler

**Location:** `protocol/src/controllers/mcp.handler.ts`

A standalone handler function (not a `@Controller`) — same pattern as `auth.handler(req)`. Wires:
- Auth extraction (JWT Bearer, OAuth token, or API key)
- `McpAuthResolver` adapter wrapping auth resolution
- `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/hono`
- CORS headers

**Routes in `main.ts`:**
```
if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp')) {
  return mcpHandler(req, corsHeaders);
}
```

Mounted before the controller loop, after Better Auth routes.

### Tools Exposed

All 27 tools from `createToolRegistry()`:

**Profile (4):** `read_user_profiles`, `create_user_profile`, `update_user_profile`, `complete_onboarding`

**Intent (7):** `read_intents`, `create_intent`, `update_intent`, `delete_intent`, `create_intent_index`, `read_intent_indexes`, `delete_intent_index`

**Index (7):** `read_indexes`, `create_index`, `update_index`, `delete_index`, `read_index_memberships`, `create_index_membership`, `delete_index_membership`

**Opportunity (2):** `create_opportunities`, `update_opportunity` (send draft, accept, reject)

**Utility (2):** `scrape_url`, `read_docs`

**Integration (1):** `import_gmail_contacts`

**Contact (4):** `import_contacts`, `list_contacts`, `add_contact`, `remove_contact`

Note: `create_intent_index` and related tools are available but rarely needed directly — intent creation triggers automatic index assignment via the background queue. These are power-user tools for manual override.

## Authentication

Dual auth: OAuth 2.1 for interactive use, API keys for automated/headless use.

### OAuth Provider (`@better-auth/oauth-provider`)

Better Auth first-party plugin that turns the server into an OAuth 2.1 authorization server.

**Configuration:**
```ts
oauthProvider({
  allowDynamicClientRegistration: true,
  allowUnauthenticatedClientRegistration: true,
})
```

**Endpoints added:**
- `GET /.well-known/oauth-authorization-server` — metadata discovery (MCP clients use this)
- `POST /oauth2/register` — dynamic client registration (MCP clients self-register)
- `GET /oauth2/authorize` — authorization page (user approves in browser)
- `POST /oauth2/token` — token exchange
- `GET /oauth2/jwks` — token verification

Supports PKCE (required by MCP spec for public clients like Claude Code).

**New DB tables:** `oauth_client`, `oauth_access_token`, `oauth_refresh_token`, `oauth_authorization_code`

### API Keys (`@better-auth/api-key`)

Better Auth first-party plugin for user-managed API keys.

**Configuration:**
```ts
apiKey({ enableSessionForAPIKeys: true })
```

`enableSessionForAPIKeys: true` means requests with `x-api-key` header are transparently resolved to sessions, so existing auth patterns work without modification.

**Endpoints added:**
- `POST /api/auth/api-key/create` — create key (returns plaintext once, stores hash)
- `GET /api/auth/api-key/list` — list user's keys
- `DELETE /api/auth/api-key/delete` — revoke key

**New DB table:** `api_key` (id, name, key hash, prefix, userId, permissions, metadata, expiresAt, timestamps)

### Auth Resolution in MCP Handler

The `McpAuthResolver` implementation tries in order:
1. `Authorization: Bearer <jwt>` — existing JWT path (from OAuth token or direct JWT)
2. `x-api-key: <key>` — API key path (Better Auth resolves to user)
3. Otherwise → 401

### Route Changes in `main.ts`

Add to `betterAuthPaths`:
- `/api/auth/api-key/*`
- `/oauth2/register`, `/oauth2/authorize`, `/oauth2/token`, `/oauth2/jwks`
- `/.well-known/oauth-authorization-server`

## Plugin Skill Rewrite

### Principle

The skills are a faithful adaptation of `chat.prompt.ts` + `chat.prompt.modules.ts`, not independently authored guidance. The parent skill carries the core prompt content; sub-skills carry the dynamic module content.

### MCP Server Configuration

Users configure in Claude Code settings:
```json
{
  "mcpServers": {
    "index-network": {
      "type": "streamable-http",
      "url": "https://protocol.index.network/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

### Skill Structure

**Parent skill (`index-network/SKILL.md`)** adapts from `buildCoreHead()` + `buildCoreBody()` + `buildCoreTail()`:
- Voice and constraints (calm, direct, analytical, banned vocabulary)
- Entity model
- Architecture philosophy ("you are the smart orchestrator, tools are dumb primitives")
- Tool reference table (all 27 tools)
- Output format rules (no raw JSON, synthesize don't inventory, etc.)
- General rules
- Setup: verify MCP tools are available, gather context via `read_user_profiles`, `read_intents`, `read_indexes`, `list_contacts`
- Sub-skill dispatch logic

**Sub-skills** map to dynamic prompt modules:

| Sub-skill | Source Modules | Primary Tools |
|---|---|---|
| `index-network-onboard` | `buildOnboarding()` | `read_user_profiles`, `create_user_profile`, `complete_onboarding`, `import_gmail_contacts`, `create_intent`, `create_opportunities` |
| `index-network-discover` | `discoveryModule`, `introductionModule`, `personLookupModule` | `create_opportunities`, `update_opportunity`, `read_user_profiles`, `read_index_memberships`, `read_intents` |
| `index-network-signal` | `intentCreationModule`, `intentManagementModule`, `urlScrapingModule` | `read_intents`, `create_intent`, `update_intent`, `delete_intent`, `scrape_url` |
| `index-network-connect` | `communityModule`, `contactsModule`, `sharedContextModule` | `read_indexes`, `create_index`, `read_index_memberships`, `create_index_membership`, `list_contacts`, `add_contact`, `import_contacts` |

### Adaptations from Chat Prompt

| Chat Agent | Plugin Skill |
|---|---|
| Preloaded context (injected JSON) | Gathered via tool calls at setup |
| `intent_proposal` / `opportunity` code blocks (UI widgets) | Text-based presentation and confirmation |
| Index-scoped chat | Always unscoped (general chat mode) |
| Streaming narration with blockquotes | Adapted for Claude Code output |
| Dynamic module injection based on tool usage | Sub-skills loaded on demand by Claude Code |
| `@[Name](userId)` mentions | Not applicable |

## New Files

| File | Purpose |
|---|---|
| `protocol/src/lib/protocol/interfaces/auth.interface.ts` | `McpAuthResolver` interface |
| `protocol/src/lib/protocol/mcp/mcp.server.ts` | MCP server factory |
| `protocol/src/controllers/mcp.handler.ts` | HTTP handler for `/mcp` route |
| `plugin/skills/index-network/SKILL.md` | Rewritten parent skill |
| `plugin/skills/index-network-onboard/SKILL.md` | Rewritten onboard sub-skill |
| `plugin/skills/index-network-discover/SKILL.md` | Rewritten discover sub-skill |
| `plugin/skills/index-network-signal/SKILL.md` | Rewritten signal sub-skill |
| `plugin/skills/index-network-connect/SKILL.md` | Rewritten connect sub-skill |

## Modified Files

| File | Change |
|---|---|
| `protocol/src/lib/betterauth/betterauth.ts` | Add `apiKey` and `oauthProvider` plugins |
| `protocol/src/main.ts` | Add MCP route block, extend `betterAuthPaths` |
| `protocol/package.json` | Add `@modelcontextprotocol/server`, `@modelcontextprotocol/hono`, `@better-auth/api-key`, `@better-auth/oauth-provider` |
| `plugin/.claude-plugin/plugin.json` | Version bump, add MCP server reference |

## Not Changed

- **Tool registry, tool helpers, tool implementations** — consumed as-is by the MCP server
- **AuthGuard** — `enableSessionForAPIKeys` handles API key auth transparently
- **ToolService** — MCP server builds its own tool deps following the same pattern
- **chat.prompt.ts / chat.prompt.modules.ts** — skills are adapted from them, not modifying them

## Dependencies

```
bun add @modelcontextprotocol/server @modelcontextprotocol/hono
bun add @better-auth/api-key @better-auth/oauth-provider
```

## Database Migration

Better Auth plugins auto-generate schema via `bun run db:generate`. Migration naming: `{NNNN}_add_api_key_and_oauth_tables.sql`. Update `_journal.json` tag to match.
