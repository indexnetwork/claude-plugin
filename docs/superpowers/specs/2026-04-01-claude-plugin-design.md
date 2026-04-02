# Index Network Claude Plugin — Design Spec

## Motivation

Make Index Network usable without a web app by providing a Claude Code plugin (and Claude Desktop MCP server) as the primary local interface. This also removes server-side LLM costs for users who bring their own Claude — the server-side ChatAgent stays for the web UI and `index conversation`, but this plugin is the recommended experience for Claude Code/Desktop users.

## Scope & Assumptions

This spec covers **the plugin layer only** (MCP server + skills). It assumes:

1. **ChatAgent tools are exposed via a unified HTTP API** at `POST /api/tools/:toolName`. A `ToolController` dispatches to the same tool handlers ChatAgent uses, preserving all domain logic server-side. See `docs/superpowers/plans/2026-04-01-tool-http-api.md` for the implementation plan.
2. **The CLI has a `callTool(name, query)` method** in `ApiClient` that calls this endpoint. CLI commands are thin wrappers: parse args → `callTool(toolName, query)` → format output (or `JSON.stringify` with `--json`).
3. **The plugin wraps CLI commands** (`--json` flag) and exposes them as MCP tools with structured JSON I/O.

### Architecture Stack

```
Claude Code / Claude Desktop
  → Plugin (MCP tools + skills)
    → CLI commands (--json flag)
      → ApiClient.callTool(name, query) → POST /api/tools/:toolName
        → ToolController → ToolRegistry → Tool handlers (domain logic, graphs)
```

## CLI-to-Plugin Tool Mapping

Each ChatAgent tool has a CLI command. The plugin wraps each CLI command as an MCP tool. Plugin tool names match ChatAgent tool names exactly — this ensures consistent semantics and makes skill authoring straightforward.

All CLI commands support `--json` for machine-readable output. Without the flag, they produce human-readable terminal text.

### Profile Tools

| ChatAgent Tool | CLI Command | Plugin Tool |
|---|---|---|
| `read_user_profiles` | `index profile [show <id>] [--query <q>] [--index <id>] --json` | `read_user_profiles` |
| `create_user_profile` | `index profile create [--linkedin <url>] [--github <url>] --json` | `create_user_profile` |
| `update_user_profile` | `index profile update <field> <value> --json` | `update_user_profile` |
| `complete_onboarding` | `index onboarding complete --json` | `complete_onboarding` |

### Intent Tools

| ChatAgent Tool | CLI Command | Plugin Tool |
|---|---|---|
| `read_intents` | `index intent list [--index <id>] [--archived] --json` | `read_intents` |
| `create_intent` | `index intent create <description> --json` | `create_intent` |
| `update_intent` | `index intent update <id> <content> --json` | `update_intent` |
| `delete_intent` | `index intent archive <id> --json` | `delete_intent` |
| `create_intent_index` | `index intent link <intentId> <networkId> --json` | `create_intent_index` |
| `read_intent_indexes` | `index intent links <intentId> --json` | `read_intent_indexes` |
| `delete_intent_index` | `index intent unlink <intentId> <networkId> --json` | `delete_intent_index` |

### Opportunity Tools

| ChatAgent Tool | CLI Command | Plugin Tool |
|---|---|---|
| `create_opportunities` | `index opportunity discover <query> [--target <userId>] [--introduce <id1> <id2>] --json` | `create_opportunities` |
| `list_opportunities` | `index opportunity list [--status <s>] --json` | `list_opportunities` |

Note: `show`, `accept`, `reject` are existing CLI commands (`index opportunity show/accept/reject <id>`) that call existing endpoints — not tool API. The plugin exposes them as convenience tools:

| CLI Command | Plugin Tool | Implementation |
|---|---|---|
| `index opportunity show <id> --json` | `show_opportunity` | Existing CLI, not via callTool |
| `index opportunity accept <id> --json` | `accept_opportunity` | Existing CLI, not via callTool |
| `index opportunity reject <id> --json` | `reject_opportunity` | Existing CLI, not via callTool |

### Index (Network) Tools

| ChatAgent Tool | CLI Command | Plugin Tool |
|---|---|---|
| `read_indexes` | `index network list --json` | `read_indexes` |
| `create_index` | `index network create <name> [--prompt <p>] --json` | `create_index` |
| `update_index` | `index network update <id> [--title <t>] [--prompt <p>] --json` | `update_index` |
| `delete_index` | `index network delete <id> --json` | `delete_index` |
| `read_index_memberships` | `index network show <id> --json` | `read_index_memberships` |
| `create_index_membership` | `index network invite <id> <email> --json` | `create_index_membership` |
| `delete_index_membership` | `index network leave <id> --json` | `delete_index_membership` |

Note: Some network commands (`list`, `create`, `show`, `join`, `leave`, `invite`) already exist in the CLI using direct API calls. These may need to be migrated to `callTool()` or kept as-is with `--json` support added. The plugin wraps whatever the CLI exposes.

### Contact Tools

| ChatAgent Tool | CLI Command | Plugin Tool |
|---|---|---|
| `list_contacts` | `index contact list --json` | `list_contacts` |
| `add_contact` | `index contact add <email> --json` | `add_contact` |
| `remove_contact` | `index contact remove <email> --json` | `remove_contact` |
| `import_contacts` | `index contact import --json` | `import_contacts` |
| `import_gmail_contacts` | `index contact import --gmail --json` | `import_gmail_contacts` |

### Utility Tools

| ChatAgent Tool | CLI Command | Plugin Tool |
|---|---|---|
| `scrape_url` | `index scrape <url> [--objective <text>] --json` | `scrape_url` |

### Conversation (H2H) — Already Exists in CLI

| CLI Command | Plugin Tool |
|---|---|
| `index conversation list --json` | `list_conversations` |
| `index conversation send <id> <msg> --json` | `send_message` |

### Additional Plugin-Only Tools

| CLI Command | Plugin Tool | Purpose |
|---|---|---|
| `index sync --json` | `sync_context` | Re-sync all cached MCP resources |

### Not Mapped

| ChatAgent Tool | Reason |
|---|---|
| `read_docs` | Returns protocol business logic docs. Not needed — skill content serves this purpose. |

## CLI Commands Still Needed

The tool HTTP API plan (`2026-04-01-tool-http-api.md`) covers most new commands. The following are **not yet covered** by that plan and need to be added to the CLI:

- `index sync` — Fetch profile, networks, intents, contacts into `~/.index/context.json`
- `index onboarding complete` — Mark onboarding done (via `callTool('complete_onboarding', {})`)
- `index profile create` — Trigger profile generation (via `callTool('create_user_profile', { ...urls })`)
- `index profile update` — Update profile fields (via `callTool('update_user_profile', { ...fields })`)
- `index network update` — Update network title/prompt (via `callTool('update_index', { ...fields })`)
- `index network delete` — Delete network (via `callTool('delete_index', { indexId })`)
- `--json` flag on all existing commands (the plan adds it globally, but existing commands like `network list`, `opportunity show`, `profile` need `--json` output paths)

## MCP Resources (Context Cache)

On plugin startup, `index sync --json` populates `~/.index/context.json`. The plugin exposes this as read-only MCP resources:

| Resource URI | Contents | Populated by |
|---|---|---|
| `index://profile` | User's name, email, bio, skills, socials | `index profile --json` |
| `index://networks` | Networks with roles and prompts | `index network list --json` |
| `index://intents` | Active intents with confidence, inference type, linked networks | `index intent list --json` |
| `index://contacts` | User's contact list | `index contact list --json` |

Claude reads these at conversation start for immediate context. After mutations, the plugin re-syncs the affected resource.

## Skill Architecture

### Core Skill: `index-network`

Always active when the plugin is loaded.

- **Mission**: "You help the right people find the user and help the user find them"
- **Voice**: Calm, direct, warm. Approachable for non-technical users. Aware it's running locally but never assumes terminal fluency.
- **Entity model**: User, Profile, Intent, Opportunity, Network, Contact — definitions and relationships
- **Resource awareness**: Reads `index://profile`, `index://networks`, `index://intents`, `index://contacts` at conversation start
- **Auth handling**: If plugin can't authenticate, instructs user to set `INDEX_API_TOKEN` or run `index login`
- **Sync policy**: After any mutation, re-read the affected resource to keep context current

### Sub-Skills

| Skill | Trigger | Responsibility |
|---|---|---|
| `index-network:onboard` | Profile incomplete, no intents, or first conversation | Check existing state, fill gaps, confirm what exists |
| `index-network:discover` | User asks to find people, explore opportunities, get introductions | Guide query formulation, run discovery, present results |
| `index-network:signal` | User wants to express what they're looking for or offering | Intent lifecycle — create, update, archive, link to networks |
| `index-network:connect` | User wants to manage networks, contacts, memberships | Network/contact CRUD, invitations |

Sub-skills are invoked by the core skill based on conversation context — users never reference them directly.

## Conversation Flow

### Comparison with ChatAgent

| Aspect | ChatAgent (server) | Plugin + Skills (local) |
|---|---|---|
| Orchestration | LangGraph ReAct loop, 8/12 iteration limits | Claude's native conversation loop, no limits |
| Tool execution | Server-side tool functions called directly | CLI → `POST /api/tools/:toolName` → same tool functions |
| Streaming | SSE from server | Claude's native streaming |
| Hallucination defense | 3-layer detection for fabricated blocks | Not needed — no interactive cards |
| Session persistence | Server DB | Claude's context window |
| User context | Pre-loaded in system prompt | MCP resources from cached sync |
| Suggestions | Generated post-response | Handled naturally by skill guidance |

### What stays the same

- Same mission and entity model
- Same tool semantics and domain logic (same tool handlers execute server-side)
- Same auth and user scoping

## Plugin Architecture

### Package Structure

```
plugin/
├── src/
│   ├── index.ts              # MCP server entry, lifecycle
│   ├── tools/                # Tool definitions (one file per domain)
│   │   ├── profile.tools.ts
│   │   ├── intent.tools.ts
│   │   ├── opportunity.tools.ts
│   │   ├── network.tools.ts
│   │   ├── contact.tools.ts
│   │   └── utility.tools.ts
│   ├── resources/            # MCP resource definitions
│   │   └── context.resources.ts
│   ├── cli.runner.ts         # Execute CLI, parse --json output
│   └── auth.ts               # Token resolution
├── skills/
│   ├── index-network.md
│   ├── index-network-onboard.md
│   ├── index-network-discover.md
│   ├── index-network-signal.md
│   └── index-network-connect.md
├── package.json
└── README.md
```

### CLI Runner (`cli.runner.ts`)

All tools go through a single execution module:

- Spawns `index <command> <args> --json`
- Parses JSON stdout into typed result
- On non-zero exit: parses stderr, returns structured error
- Handles token passthrough (`--token` from env/config if `INDEX_API_TOKEN` is set)
- Handles API URL override (`--api-url` if configured)
- Enforces timeout per command

### Auth Resolution Order

1. `INDEX_API_TOKEN` environment variable
2. `~/.index/credentials.json` (from prior `index login`)
3. Error — skill guides user to authenticate

### Plugin Lifecycle

1. **Startup**: Resolve auth, run `index sync --json`, populate MCP resources
2. **Tool call**: `cli.runner.ts` executes CLI command with `--json`, returns parsed JSON
3. **After mutation**: Re-sync affected MCP resource

## Distribution & Installation

### Claude Code Plugin

Published from Index repo as `index-network@indexnetwork`:

```json
{
  "enabledPlugins": {
    "index-network@indexnetwork": true
  }
}
```

Ships both MCP tools and skills in one package.

### Claude Desktop (Manual MCP)

```json
{
  "mcpServers": {
    "index-network": {
      "command": "npx",
      "args": ["@indexnetwork/claude-plugin"],
      "env": {
        "INDEX_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

For Desktop, skill content is embedded into MCP tool descriptions since Desktop doesn't support standalone skill files. The core personality and workflow guidance lives in the tool descriptions themselves.

### Prerequisites

- `index` CLI installed (`npm i -g @indexnetwork/cli`)
- Authenticated (token in env or `index login` completed)

### First-Run Experience

1. User installs plugin
2. Plugin attempts auth — fails if no token/credentials
3. Core skill guides: "Set `INDEX_API_TOKEN` or run `index login`"
4. On success, `index sync` runs, resources populate
5. `index-network:onboard` kicks in if profile/intents incomplete — checks what exists, fills gaps, confirms existing state

## Implementation Phases

### Phase 1: Remaining CLI Commands

Add commands not covered by the tool HTTP API plan:
- `index sync`
- `index onboarding complete`
- `index profile create`, `index profile update`
- `index network update`, `index network delete`
- `--json` output paths on all existing commands

### Phase 2: Plugin MCP Server

Build the MCP server wrapping CLI commands:
- `cli.runner.ts` — spawn CLI with `--json`, parse output
- `auth.ts` — token resolution (env var → credentials file)
- Tool definitions for all domains
- MCP resource definitions for context cache
- Plugin lifecycle (startup sync, post-mutation sync)

### Phase 3: Skills

Write the skill markdown files:
- Core skill (`index-network.md`) — mission, voice, entity model, resource awareness
- Sub-skills for onboard, discover, signal, connect workflows

### Phase 4: Packaging & Distribution

- Claude Code plugin packaging
- Claude Desktop MCP server configuration
- npm publishing from Index repo
