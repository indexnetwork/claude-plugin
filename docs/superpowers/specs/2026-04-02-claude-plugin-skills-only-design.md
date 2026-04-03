# Claude Plugin — Skills-Only Redesign

**Supersedes**: `2026-04-01-claude-plugin-design.md`

## Motivation

The original plugin design wrapped CLI commands in an MCP server. This created a brittle dependency chain: Claude Code had to build TypeScript, install npm dependencies, and launch a Node.js process — all before a single tool call. When the plugin cache lacked `dist/`, the entire plugin broke silently.

The MCP layer adds no value. Claude Code already has Bash access. Skills can instruct Claude to run `index` CLI commands directly. The plugin becomes pure content — markdown files that guide Claude's behavior.

## Architecture

```
Claude Code
  → Skills (markdown, guide behavior)
    → Bash (run CLI commands)
      → index CLI (--json flag)
        → POST /api/... (protocol backend)
```

No MCP server. No build step. No npm dependencies. No `dist/`.

## Plugin Structure

```
indexnetwork-claude-plugin/
├── .claude-plugin/
│   ├── plugin.json            # Plugin metadata
│   └── marketplace.json       # Marketplace listing
├── skills/
│   ├── index-network/SKILL.md
│   ├── index-network-onboard/SKILL.md
│   ├── index-network-discover/SKILL.md
│   ├── index-network-signal/SKILL.md
│   └── index-network-connect/SKILL.md
├── .gitignore
└── README.md
```

**Removed**: `src/`, `dist/`, `node_modules/`, `package.json`, `tsconfig.json`, `.mcp.json`, `package-lock.json`

The plugin cache copy is identical to the source — nothing to build, nothing to break.

## Prerequisites

- `@indexnetwork/cli` installed globally (`npm install -g @indexnetwork/cli`)
- Authenticated via `index login`

## Skill Architecture

### Core Skill: `index-network`

Always active when the plugin is loaded. Responsibilities:

1. **CLI gate** — On activation, silently runs `which index`. If missing, guides user to install with `!npm install -g @indexnetwork/cli` (or `!bun install -g @indexnetwork/cli`), then `!index login`.
2. **Auth gate** — Silently runs `index profile --json`. If auth fails, guides user to `!index login`.
3. **Silent context gathering** — Runs these commands silently (no output to user) to build internal context:
   - `index profile --json`
   - `index intent list --json`
   - `index network list --json`
   - `index contact list --json`
4. **Sub-skill dispatch** — Routes to appropriate sub-skill based on conversation context.
5. **Post-mutation refresh** — After any create/update/delete, re-runs the relevant list command silently to keep context current.

Voice: Calm, direct, warm. Approachable for non-technical users. Never assumes terminal fluency. Never uses "search" — says "looking up", "find", or "discover".

### Sub-Skills

| Skill | Trigger | Responsibility |
|---|---|---|
| `index-network:onboard` | Profile incomplete, no intents, or first conversation | Guide setup: profile creation, first intent, network suggestion |
| `index-network:discover` | User wants to find people, explore opportunities, get introductions | Query formulation, discovery execution, result presentation |
| `index-network:signal` | User wants to express what they're looking for or offering | Intent lifecycle: create, update, archive, link to networks |
| `index-network:connect` | User wants to manage networks, contacts, memberships | Network and contact CRUD, invitations |

## CLI Command Reference

All commands use `--json` flag for structured output. Claude runs these via Bash silently unless the output is conversationally relevant.

### Profile

| Action | Command |
|---|---|
| View profile | `index profile --json` |
| View another user | `index profile show <user-id> --json` |
| Create from social URLs | `index profile create --linkedin <url> --github <url> --json` |
| Update field | `index profile update <field> --details <text> --json` |
| Search profiles | `index profile search <query> --json` |
| Complete onboarding | `index onboarding complete --json` |

### Intents (Signals)

| Action | Command |
|---|---|
| List intents | `index intent list [--archived] [--limit <n>] --json` |
| Show intent | `index intent show <id> --json` |
| Create intent | `index intent create "<description>" --json` |
| Update intent | `index intent update <id> "<content>" --json` |
| Archive intent | `index intent archive <id> --json` |
| Link to network | `index intent link <id> <network-id> --json` |
| Unlink from network | `index intent unlink <id> <network-id> --json` |
| Show linked networks | `index intent links <id> --json` |

### Opportunities

| Action | Command |
|---|---|
| Discover | `index opportunity discover "<query>" --json` |
| List | `index opportunity list [--status <s>] [--limit <n>] --json` |
| Show details | `index opportunity show <id> --json` |
| Accept | `index opportunity accept <id> --json` |
| Reject | `index opportunity reject <id> --json` |

### Networks

| Action | Command |
|---|---|
| List networks | `index network list --json` |
| Create network | `index network create "<name>" [--prompt "<p>"] --json` |
| Show (with members) | `index network show <id> --json` |
| Update | `index network update <id> [--title "<t>"] [--prompt "<p>"] --json` |
| Delete | `index network delete <id> --json` |
| Join public | `index network join <id> --json` |
| Leave | `index network leave <id> --json` |
| Invite by email | `index network invite <id> <email> --json` |

### Contacts

| Action | Command |
|---|---|
| List contacts | `index contact list --json` |
| Add contact | `index contact add <email> --json` |
| Remove contact | `index contact remove <email> --json` |
| Import (default) | `index contact import --json` |
| Import from Gmail | `index contact import --gmail --json` |

### Conversations

| Action | Command |
|---|---|
| List conversations | `index conversation list --json` |
| Send message | `index conversation send <id> "<message>" --json` |

### Utility

| Action | Command |
|---|---|
| Scrape URL | `index scrape "<url>" [--objective "<text>"] --json` |
| Sync context | `index sync --json` |

## Onboarding Flow

When the skill detects a new or incomplete user:

1. CLI and auth gates already passed (handled by core skill).
2. Profile check — `index profile --json` already ran silently. If complete, confirm with user ("I see you're [name], [bio]. Is this right?"). If missing, ask for LinkedIn/GitHub URL, run `index profile create --linkedin <url> --json`.
3. Intent check — `index intent list --json` already ran. If intents exist, summarize and confirm relevance. If none, conversationally ask what they're looking for, run `index intent create "<description>" --json`.
4. Network check — `index network list --json` already ran. If only personal network, suggest exploring or creating one.
5. Completion — When profile + at least one intent exist, run `index onboarding complete --json`.

Principles: Only ask about what's missing. Confirm existing data rather than overwriting. Conversational, not a form.

## What Changed from Original Design

| Aspect | Original (MCP) | New (Skills-only) |
|---|---|---|
| MCP server | TypeScript, build step, npm deps | None |
| Tool execution | MCP tool → cli-runner.ts → CLI | Bash → CLI directly |
| Context gathering | MCP resources from cache file | Silent CLI commands on activation |
| Build step | `npm install && npm run build` | None |
| Plugin cache | Broken (dist/ gitignored) | Identical to source |
| Dependencies | `@modelcontextprotocol/sdk`, `zod` | None |
| Claude Desktop support | MCP server via npx | Not supported (no skills in Desktop) |

## Claude Desktop

This design does not support Claude Desktop — Desktop doesn't have Bash access or skill files. If Desktop support is needed later, a separate MCP server package can be published. That's a different product with different constraints.

## Implementation

1. Remove all code files from the plugin repo (`src/`, `package.json`, `tsconfig.json`, `.mcp.json`, etc.)
2. Rewrite all 5 skill files to reference CLI commands instead of MCP tools
3. Update `.gitignore` (minimal — no build artifacts to ignore)
4. Update `README.md` with new prerequisites and architecture
5. Update `.claude-plugin/marketplace.json` if needed
