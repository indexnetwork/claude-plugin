# Index Network Claude Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin (MCP server + skills) that wraps the Index CLI, giving Claude Code/Desktop users the same capabilities as the web-based ChatAgent.

**Architecture:** An MCP server spawns `index <cmd> --json` via a CLI runner, parses JSON output, and returns structured results. MCP resources cache user context on startup. Skills shape Claude's personality and workflows. The plugin ships as an npm package usable as both a Claude Code plugin and a standalone MCP server for Claude Desktop.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server` (MCP SDK), Bun, Zod v4, `child_process.execFile`.

**Depends on:** `docs/superpowers/plans/2026-04-01-tool-http-api.md` (tool HTTP API + CLI commands). This plan does NOT touch any files from that plan.

---

## File Structure

### Plugin Package (`plugin/`)

- **Create:** `plugin/package.json` — Package metadata, dependencies, bin entry
- **Create:** `plugin/tsconfig.json` — TypeScript config
- **Create:** `plugin/src/index.ts` — MCP server entry point, lifecycle
- **Create:** `plugin/src/cli-runner.ts` — Spawn CLI with `--json`, parse output
- **Create:** `plugin/src/auth.ts` — Token resolution (env var → credentials file)
- **Create:** `plugin/src/tools/profile.tools.ts` — Profile tool registrations
- **Create:** `plugin/src/tools/intent.tools.ts` — Intent tool registrations
- **Create:** `plugin/src/tools/opportunity.tools.ts` — Opportunity tool registrations
- **Create:** `plugin/src/tools/network.tools.ts` — Network tool registrations
- **Create:** `plugin/src/tools/contact.tools.ts` — Contact tool registrations
- **Create:** `plugin/src/tools/utility.tools.ts` — Scrape, onboarding, sync tools
- **Create:** `plugin/src/tools/conversation.tools.ts` — H2H conversation tools
- **Create:** `plugin/src/resources/context.resources.ts` — MCP resource definitions
- **Create:** `plugin/skills/index-network.md` — Core skill
- **Create:** `plugin/skills/index-network-onboard.md` — Onboarding sub-skill
- **Create:** `plugin/skills/index-network-discover.md` — Discovery sub-skill
- **Create:** `plugin/skills/index-network-signal.md` — Signal/intent sub-skill
- **Create:** `plugin/skills/index-network-connect.md` — Network/contact sub-skill

### CLI Additions (`cli/src/`)

- **Create:** `cli/src/sync.command.ts` — `index sync` command
- **Create:** `cli/src/onboarding.command.ts` — `index onboarding complete` command
- **Modify:** `cli/src/profile.command.ts` — Add `create`, `update` subcommands + `--json` output
- **Modify:** `cli/src/network.command.ts` — Add `update`, `delete` subcommands + `--json` output
- **Modify:** `cli/src/intent.command.ts` — Add `--json` output to existing subcommands
- **Modify:** `cli/src/opportunity.command.ts` — Add `--json` output to existing subcommands
- **Modify:** `cli/src/conversation.command.ts` — Add `--json` output to `list`
- **Modify:** `cli/src/args.parser.ts` — Add `sync`, `onboarding` commands; `create`, `update`, `delete` subcommands
- **Modify:** `cli/src/main.ts` — Wire new commands

---

### Task 1: CLI `--json` Output on Existing Intent Commands

**Files:**
- Modify: `cli/src/intent.command.ts`

The existing plan adds `--json` for new subcommands (update, link, unlink, links) but existing subcommands (list, show, create, archive) need it too. Add a `json` option and early-return with `JSON.stringify` for each existing case.

- [ ] **Step 1: Add json option to handleIntent signature**

In `cli/src/intent.command.ts`, add `json?: boolean` to the options parameter of `handleIntent`:

```typescript
export async function handleIntent(
  client: ApiClient,
  subcommand: string | undefined,
  options: {
    intentId?: string;
    intentContent?: string;
    archived?: boolean;
    limit?: number;
    json?: boolean;
  },
): Promise<void> {
```

- [ ] **Step 2: Add --json output to `list` subcommand**

At the top of the `"list"` case, after fetching intents, add:

```typescript
case "list": {
  const result = await client.listIntents({
    archived: options.archived,
    limit: options.limit,
  });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  // ... existing formatted output
}
```

- [ ] **Step 3: Add --json output to `show` subcommand**

```typescript
case "show": {
  if (!options.intentId) {
    output.error("Missing signal ID. Usage: index intent show <id>", 1);
    return;
  }
  const intent = await client.getIntent(options.intentId);
  if (options.json) {
    console.log(JSON.stringify(intent));
    return;
  }
  // ... existing formatted output
}
```

- [ ] **Step 4: Add --json output to `create` and `archive` subcommands**

Same pattern: after the API call, check `options.json` and `console.log(JSON.stringify(result))` then return.

- [ ] **Step 5: Pass json flag from main.ts**

In `cli/src/main.ts`, update the intent case to pass the json flag:

```typescript
case "intent":
  await handleIntent(client, args.subcommand, {
    intentId: args.intentId,
    intentContent: args.intentContent,
    archived: args.archived,
    limit: args.limit,
    json: args.json,
  });
  return;
```

- [ ] **Step 6: Commit**

```bash
git add cli/src/intent.command.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add --json output to existing intent subcommands
EOF
)"
```

---

### Task 2: CLI `--json` Output on Existing Opportunity Commands

**Files:**
- Modify: `cli/src/opportunity.command.ts`
- Modify: `cli/src/main.ts`

- [ ] **Step 1: Add json option to handleOpportunity**

```typescript
export async function handleOpportunity(
  client: ApiClient,
  subcommand: string | undefined,
  options: {
    targetId?: string;
    status?: string;
    limit?: number;
    json?: boolean;
  },
): Promise<void> {
```

- [ ] **Step 2: Add --json to list, show, accept, reject**

For each existing case, after the API call:

```typescript
if (options.json) {
  console.log(JSON.stringify(result));
  return;
}
```

- [ ] **Step 3: Pass json flag from main.ts**

Update the opportunity case in `main.ts`:

```typescript
case "opportunity":
  await handleOpportunity(client, args.subcommand, {
    targetId: args.targetId,
    status: args.status,
    limit: args.limit,
    json: args.json,
  });
  return;
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/opportunity.command.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add --json output to existing opportunity subcommands
EOF
)"
```

---

### Task 3: CLI `--json` Output on Existing Network Commands

**Files:**
- Modify: `cli/src/network.command.ts`
- Modify: `cli/src/main.ts`

- [ ] **Step 1: Add json option to handleNetwork**

```typescript
export async function handleNetwork(
  client: ApiClient,
  subcommand: string | undefined,
  positionals: string[],
  options: { prompt?: string; json?: boolean },
): Promise<void> {
```

- [ ] **Step 2: Add --json to list, show, create, join, leave, invite**

Same pattern for each case. For `list`:

```typescript
case "list": {
  const networks = await client.listNetworks();
  if (options.json) {
    console.log(JSON.stringify(networks));
    return;
  }
  // ... existing formatted output
}
```

Repeat for `show`, `create`, `join`, `leave`, `invite`.

- [ ] **Step 3: Pass json flag from main.ts**

```typescript
case "network":
  await handleNetwork(client, args.subcommand, args.positionals ?? [], {
    prompt: args.prompt,
    json: args.json,
  });
  return;
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/network.command.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add --json output to existing network subcommands
EOF
)"
```

---

### Task 4: CLI `--json` Output on Existing Profile and Conversation Commands

**Files:**
- Modify: `cli/src/profile.command.ts`
- Modify: `cli/src/conversation.command.ts`
- Modify: `cli/src/main.ts`

- [ ] **Step 1: Add json option to handleProfile**

```typescript
export async function handleProfile(
  client: ApiClient,
  subcommand: string | undefined,
  positionals: string[],
  options?: { json?: boolean },
): Promise<void> {
```

Add `--json` output to the default (show self), `show`, and `sync` cases.

- [ ] **Step 2: Add json to handleConversation for `list` subcommand**

Add `json?: boolean` to options. In the `list` / `sessions` cases:

```typescript
if (options.json) {
  console.log(JSON.stringify(result));
  return;
}
```

- [ ] **Step 3: Pass json flag from main.ts for both commands**

Update profile and conversation dispatch in `main.ts` to pass `args.json`.

- [ ] **Step 4: Commit**

```bash
git add cli/src/profile.command.ts cli/src/conversation.command.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add --json output to profile and conversation commands
EOF
)"
```

---

### Task 5: CLI `profile create` and `profile update` Subcommands

**Files:**
- Modify: `cli/src/profile.command.ts`
- Modify: `cli/src/args.parser.ts`

These use `callTool()` from the tool HTTP API plan (assumed available).

- [ ] **Step 1: Add subcommands to args parser**

Add `"create"` and `"update"` to the profile subcommand handling in `args.parser.ts`. Parse `--linkedin`, `--github`, `--twitter` flags for `create`. For `update`, capture field name and value from positionals.

```typescript
// In ParsedCommand interface, add:
linkedin?: string;
github?: string;
twitter?: string;
```

```typescript
// In flag parsing:
} else if (arg === "--linkedin") {
  result.linkedin = args[i + 1];
  i += 2;
} else if (arg === "--github") {
  result.github = args[i + 1];
  i += 2;
} else if (arg === "--twitter") {
  result.twitter = args[i + 1];
  i += 2;
}
```

- [ ] **Step 2: Add create case to handleProfile**

```typescript
case "create": {
  output.info("Generating profile...");
  const query: Record<string, unknown> = {};
  if (options.linkedin) query.linkedinUrl = options.linkedin;
  if (options.github) query.githubUrl = options.github;
  if (options.twitter) query.twitterUrl = options.twitter;
  const result = await client.callTool("create_user_profile", query);
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to generate profile", 1);
    return;
  }
  output.success("Profile generation started. It may take a moment to complete.");
  return;
}
```

- [ ] **Step 3: Add update case to handleProfile**

```typescript
case "update": {
  const field = positionals[0];
  const value = positionals.slice(1).join(" ");
  if (!field || !value) {
    output.error("Usage: index profile update <field> <value>", 1);
    return;
  }
  const result = await client.callTool("update_user_profile", { [field]: value });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to update profile", 1);
    return;
  }
  output.success(`Profile ${field} updated.`);
  return;
}
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/profile.command.ts cli/src/args.parser.ts
git commit -m "$(cat <<'EOF'
feat(cli): add profile create and update subcommands
EOF
)"
```

---

### Task 6: CLI `network update` and `network delete` Subcommands

**Files:**
- Modify: `cli/src/network.command.ts`
- Modify: `cli/src/args.parser.ts`

- [ ] **Step 1: Add subcommands to args parser**

Add `"update"` and `"delete"` to network subcommand handling. Parse `--title` flag for update.

```typescript
// In ParsedCommand interface, add:
title?: string;
```

```typescript
// In flag parsing:
} else if (arg === "--title") {
  result.title = args[i + 1];
  i += 2;
}
```

- [ ] **Step 2: Add update case to handleNetwork**

```typescript
case "update": {
  const networkId = positionals[0];
  if (!networkId) {
    output.error("Usage: index network update <id> [--title <t>] [--prompt <p>]", 1);
    return;
  }
  const query: Record<string, unknown> = { indexId: networkId };
  if (options.title) query.title = options.title;
  if (options.prompt) query.prompt = options.prompt;
  const result = await client.callTool("update_index", query);
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to update network", 1);
    return;
  }
  output.success("Network updated.");
  return;
}
```

- [ ] **Step 3: Add delete case to handleNetwork**

```typescript
case "delete": {
  const networkId = positionals[0];
  if (!networkId) {
    output.error("Usage: index network delete <id>", 1);
    return;
  }
  const result = await client.callTool("delete_index", { indexId: networkId });
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? "Failed to delete network", 1);
    return;
  }
  output.success("Network deleted.");
  return;
}
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/network.command.ts cli/src/args.parser.ts
git commit -m "$(cat <<'EOF'
feat(cli): add network update and delete subcommands
EOF
)"
```

---

### Task 7: CLI `onboarding complete` Command

**Files:**
- Create: `cli/src/onboarding.command.ts`
- Modify: `cli/src/args.parser.ts`
- Modify: `cli/src/main.ts`

- [ ] **Step 1: Add onboarding to args parser**

Add `"onboarding"` to known commands and the `ParsedCommand.command` union. The only subcommand is `"complete"`.

- [ ] **Step 2: Create onboarding.command.ts**

```typescript
/**
 * Onboarding command handler for the Index CLI.
 */
import type { ApiClient } from './api.client';
import * as output from './output';

/**
 * Route an onboarding subcommand to the appropriate handler.
 */
export async function handleOnboarding(
  client: ApiClient,
  subcommand: string | undefined,
  options: { json?: boolean },
): Promise<void> {
  if (subcommand !== 'complete') {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Usage: index onboarding complete' }));
    } else {
      console.log('\nUsage:\n  index onboarding complete    Mark onboarding as done\n');
    }
    return;
  }

  const result = await client.callTool('complete_onboarding', {});
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.success) {
    output.error(result.error ?? 'Failed to complete onboarding', 1);
    return;
  }
  output.success('Onboarding marked as complete.');
}
```

- [ ] **Step 3: Wire in main.ts**

```typescript
import { handleOnboarding } from './onboarding.command';

// In the switch:
case "onboarding":
  await handleOnboarding(client, args.subcommand, { json: args.json });
  return;
```

- [ ] **Step 4: Commit**

```bash
git add cli/src/onboarding.command.ts cli/src/args.parser.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add onboarding complete command
EOF
)"
```

---

### Task 8: CLI `sync` Command

**Files:**
- Create: `cli/src/sync.command.ts`
- Modify: `cli/src/args.parser.ts`
- Modify: `cli/src/main.ts`

The `sync` command fetches profile, networks, intents, and contacts, then writes them to `~/.index/context.json`.

- [ ] **Step 1: Add sync to args parser**

Add `"sync"` to known commands and the `ParsedCommand.command` union.

- [ ] **Step 2: Create sync.command.ts**

```typescript
/**
 * Sync command — fetches user context and caches it locally.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ApiClient } from './api.client';
import * as output from './output';

const INDEX_DIR = join(homedir(), '.index');
const CONTEXT_FILE = join(INDEX_DIR, 'context.json');

/**
 * Fetch profile, networks, intents, and contacts. Write to ~/.index/context.json.
 */
export async function handleSync(
  client: ApiClient,
  options: { json?: boolean },
): Promise<void> {
  if (!options.json) {
    output.info('Syncing context...');
  }

  const [profile, networks, intents, contacts] = await Promise.all([
    client.getMe().catch(() => null),
    client.listNetworks().catch(() => []),
    client.listIntents({ limit: 100 }).catch(() => ({ intents: [] })),
    client.callTool('list_contacts', {}).catch(() => ({ success: false, data: { contacts: [] } })),
  ]);

  const context = {
    syncedAt: new Date().toISOString(),
    profile,
    networks,
    intents: intents.intents ?? intents,
    contacts: (contacts as any)?.data?.contacts ?? [],
  };

  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));

  if (options.json) {
    console.log(JSON.stringify(context));
  } else {
    output.success(`Context synced to ${CONTEXT_FILE}`);
    output.dim(`  Profile: ${profile?.name ?? 'not found'}`);
    output.dim(`  Networks: ${Array.isArray(networks) ? networks.length : 0}`);
    output.dim(`  Intents: ${Array.isArray(context.intents) ? context.intents.length : 0}`);
    output.dim(`  Contacts: ${context.contacts.length}`);
    console.log();
  }
}
```

- [ ] **Step 3: Wire in main.ts**

```typescript
import { handleSync } from './sync.command';

// In the switch:
case "sync":
  await handleSync(client, { json: args.json });
  return;
```

- [ ] **Step 4: Test manually**

Run: `cd cli && bun src/main.ts sync`
Expected: Syncs context and prints summary. `~/.index/context.json` created.

Run: `cd cli && bun src/main.ts sync --json`
Expected: Raw JSON output to stdout.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sync.command.ts cli/src/args.parser.ts cli/src/main.ts
git commit -m "$(cat <<'EOF'
feat(cli): add sync command to cache user context locally
EOF
)"
```

---

### Task 9: Plugin Package Setup

**Files:**
- Create: `plugin/package.json`
- Create: `plugin/tsconfig.json`

- [ ] **Step 1: Create plugin/package.json**

```json
{
  "name": "@indexnetwork/claude-plugin",
  "version": "0.1.0",
  "description": "Index Network Claude Code plugin — MCP server + skills",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "index-network-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^1.12.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "@types/node": "^22.0.0"
  },
  "files": [
    "dist",
    "skills"
  ],
  "keywords": ["index-network", "mcp", "claude", "plugin"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create plugin/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd plugin && bun install`
Expected: `node_modules` created with `@modelcontextprotocol/server` and `zod`.

- [ ] **Step 4: Commit**

```bash
git add plugin/package.json plugin/tsconfig.json
git commit -m "$(cat <<'EOF'
feat(plugin): initialize plugin package with MCP SDK dependency
EOF
)"
```

---

### Task 10: Plugin Auth Module

**Files:**
- Create: `plugin/src/auth.ts`

- [ ] **Step 1: Create auth.ts**

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CREDENTIALS_PATH = join(homedir(), '.index', 'credentials.json');

export interface AuthConfig {
  token: string;
  apiUrl: string;
}

/**
 * Resolve authentication credentials.
 * Priority: INDEX_API_TOKEN env → ~/.index/credentials.json → error.
 */
export function resolveAuth(): AuthConfig {
  // 1. Environment variable
  const envToken = process.env.INDEX_API_TOKEN;
  if (envToken) {
    return {
      token: envToken,
      apiUrl: process.env.INDEX_API_URL ?? 'https://protocol.index.network',
    };
  }

  // 2. Credentials file
  if (existsSync(CREDENTIALS_PATH)) {
    try {
      const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
      const creds = JSON.parse(raw) as { token?: string; apiUrl?: string };
      if (creds.token) {
        return {
          token: creds.token,
          apiUrl: creds.apiUrl ?? 'https://protocol.index.network',
        };
      }
    } catch {
      // Fall through to error
    }
  }

  throw new Error(
    'No Index Network credentials found. Set INDEX_API_TOKEN environment variable or run `index login`.'
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugin && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/src/auth.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add auth module for token resolution
EOF
)"
```

---

### Task 11: Plugin CLI Runner

**Files:**
- Create: `plugin/src/cli-runner.ts`

- [ ] **Step 1: Create cli-runner.ts**

```typescript
import { execFile } from 'child_process';
import type { AuthConfig } from './auth.js';

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

export interface CliResult {
  success: boolean;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

/**
 * Execute an Index CLI command with --json and return parsed result.
 *
 * @param command - CLI command parts, e.g. ['intent', 'list', '--archived']
 * @param auth - Auth config for token passthrough
 * @param timeout - Command timeout in ms (default 120s)
 */
export function runCli(
  command: string[],
  auth: AuthConfig,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<CliResult> {
  const args = [
    ...command,
    '--json',
    '--token', auth.token,
    '--api-url', auth.apiUrl,
  ];

  return new Promise((resolve, reject) => {
    execFile('index', args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // Try to parse stderr as JSON error
        if (stderr) {
          try {
            const parsed = JSON.parse(stderr);
            resolve({ success: false, error: parsed.error ?? stderr });
            return;
          } catch {
            // Not JSON, use raw stderr
          }
        }
        resolve({
          success: false,
          error: stderr || err.message,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        // If the CLI already returns { success, data, error }, pass through
        if (typeof parsed === 'object' && parsed !== null && 'success' in parsed) {
          resolve(parsed as CliResult);
        } else {
          // Wrap raw response
          resolve({ success: true, data: parsed });
        }
      } catch {
        // Non-JSON output — treat as raw text
        resolve({ success: true, data: stdout.trim() });
      }
    });
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugin && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/src/cli-runner.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add CLI runner to spawn index commands with --json
EOF
)"
```

---

### Task 12: Plugin Profile Tools

**Files:**
- Create: `plugin/src/tools/profile.tools.ts`

- [ ] **Step 1: Create profile.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(cli) }],
  };
}

export function registerProfileTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'read_user_profiles',
    {
      description: 'Find and read user profiles by ID, index, or name query',
      inputSchema: z.object({
        userId: z.string().optional().describe('Specific user ID'),
        indexId: z.string().optional().describe('Scope to a network'),
        query: z.string().optional().describe('Search by name'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['profile'];
      if (input.userId) {
        args.push('show', input.userId);
      } else if (input.query) {
        args.push('search', input.query);
      }
      if (input.indexId) args.push('--index', input.indexId);
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'create_user_profile',
    {
      description: 'Generate a user profile from LinkedIn/GitHub/Twitter URLs',
      inputSchema: z.object({
        linkedinUrl: z.string().optional().describe('LinkedIn profile URL'),
        githubUrl: z.string().optional().describe('GitHub profile URL'),
        twitterUrl: z.string().optional().describe('Twitter/X profile URL'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['profile', 'create'];
      if (input.linkedinUrl) args.push('--linkedin', input.linkedinUrl);
      if (input.githubUrl) args.push('--github', input.githubUrl);
      if (input.twitterUrl) args.push('--twitter', input.twitterUrl);
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'update_user_profile',
    {
      description: 'Update a field on the user profile (e.g., bio, skills)',
      inputSchema: z.object({
        field: z.string().describe('Profile field to update'),
        value: z.string().describe('New value'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['profile', 'update', input.field, input.value], auth));
    },
  );

  server.registerTool(
    'complete_onboarding',
    {
      description: 'Mark the user onboarding flow as complete',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      return toResult(await runCli(['onboarding', 'complete'], auth));
    },
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugin && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/src/tools/profile.tools.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP profile tools
EOF
)"
```

---

### Task 13: Plugin Intent Tools

**Files:**
- Create: `plugin/src/tools/intent.tools.ts`

- [ ] **Step 1: Create intent.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(cli) }],
  };
}

export function registerIntentTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'read_intents',
    {
      description: 'List intents (signals), optionally scoped to a network or including archived',
      inputSchema: z.object({
        indexId: z.string().optional().describe('Scope to a specific network'),
        archived: z.boolean().optional().describe('Include archived intents'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['intent', 'list'];
      if (input.indexId) args.push('--index', input.indexId);
      if (input.archived) args.push('--archived');
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'create_intent',
    {
      description: 'Create a new intent (signal) from a natural language description',
      inputSchema: z.object({
        description: z.string().describe('What the user is looking for or offering'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['intent', 'create', input.description], auth));
    },
  );

  server.registerTool(
    'update_intent',
    {
      description: 'Update an existing intent description',
      inputSchema: z.object({
        intentId: z.string().describe('Intent ID'),
        newDescription: z.string().describe('Updated description'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['intent', 'update', input.intentId, input.newDescription], auth));
    },
  );

  server.registerTool(
    'delete_intent',
    {
      description: 'Archive an intent (soft delete)',
      inputSchema: z.object({
        intentId: z.string().describe('Intent ID to archive'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['intent', 'archive', input.intentId], auth));
    },
  );

  server.registerTool(
    'create_intent_index',
    {
      description: 'Link an intent to a network',
      inputSchema: z.object({
        intentId: z.string().describe('Intent ID'),
        indexId: z.string().describe('Network ID to link to'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['intent', 'link', input.intentId, input.indexId], auth));
    },
  );

  server.registerTool(
    'read_intent_indexes',
    {
      description: 'List networks linked to an intent',
      inputSchema: z.object({
        intentId: z.string().describe('Intent ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['intent', 'links', input.intentId], auth));
    },
  );

  server.registerTool(
    'delete_intent_index',
    {
      description: 'Unlink an intent from a network',
      inputSchema: z.object({
        intentId: z.string().describe('Intent ID'),
        indexId: z.string().describe('Network ID to unlink'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['intent', 'unlink', input.intentId, input.indexId], auth));
    },
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugin && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add plugin/src/tools/intent.tools.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP intent tools
EOF
)"
```

---

### Task 14: Plugin Opportunity Tools

**Files:**
- Create: `plugin/src/tools/opportunity.tools.ts`

- [ ] **Step 1: Create opportunity.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(cli) }],
  };
}

export function registerOpportunityTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'create_opportunities',
    {
      description: 'Discover opportunities via semantic search, direct match, or introduction',
      inputSchema: z.object({
        searchQuery: z.string().optional().describe('Discovery query text'),
        targetUserId: z.string().optional().describe('For direct discovery: target user ID'),
        mode: z.enum(['discovery', 'direct', 'introduction']).optional().describe('Discovery mode'),
        sourceUserId: z.string().optional().describe('For introduction: first party user ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['opportunity', 'discover'];
      if (input.mode === 'introduction' && input.sourceUserId) {
        args.push('--introduce', input.sourceUserId, input.targetUserId ?? '');
      } else if (input.mode === 'direct' && input.targetUserId) {
        args.push('--target', input.targetUserId, input.searchQuery ?? '');
      } else if (input.searchQuery) {
        args.push(input.searchQuery);
      }
      return toResult(await runCli(args, auth, 180_000)); // 3 min timeout for discovery
    },
  );

  server.registerTool(
    'list_opportunities',
    {
      description: 'List opportunities, optionally filtered by status',
      inputSchema: z.object({
        status: z.string().optional().describe('Filter: pending, accepted, rejected, expired'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['opportunity', 'list'];
      if (input.status) args.push('--status', input.status);
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'show_opportunity',
    {
      description: 'Get full details of a specific opportunity',
      inputSchema: z.object({
        opportunityId: z.string().describe('Opportunity ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['opportunity', 'show', input.opportunityId], auth));
    },
  );

  server.registerTool(
    'accept_opportunity',
    {
      description: 'Accept an opportunity',
      inputSchema: z.object({
        opportunityId: z.string().describe('Opportunity ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['opportunity', 'accept', input.opportunityId], auth));
    },
  );

  server.registerTool(
    'reject_opportunity',
    {
      description: 'Reject an opportunity',
      inputSchema: z.object({
        opportunityId: z.string().describe('Opportunity ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['opportunity', 'reject', input.opportunityId], auth));
    },
  );
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd plugin && npx tsc --noEmit
git add plugin/src/tools/opportunity.tools.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP opportunity tools
EOF
)"
```

---

### Task 15: Plugin Network Tools

**Files:**
- Create: `plugin/src/tools/network.tools.ts`

- [ ] **Step 1: Create network.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(cli) }],
  };
}

export function registerNetworkTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'read_indexes',
    {
      description: 'List networks the user belongs to',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      return toResult(await runCli(['network', 'list'], auth));
    },
  );

  server.registerTool(
    'create_index',
    {
      description: 'Create a new network (community)',
      inputSchema: z.object({
        title: z.string().describe('Network name'),
        prompt: z.string().optional().describe('Network description/prompt'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['network', 'create', input.title];
      if (input.prompt) args.push('--prompt', input.prompt);
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'update_index',
    {
      description: 'Update a network title or prompt (owner only)',
      inputSchema: z.object({
        indexId: z.string().describe('Network ID'),
        title: z.string().optional().describe('New title'),
        prompt: z.string().optional().describe('New prompt'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['network', 'update', input.indexId];
      if (input.title) args.push('--title', input.title);
      if (input.prompt) args.push('--prompt', input.prompt);
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'delete_index',
    {
      description: 'Delete a network (owner only, must be sole member)',
      inputSchema: z.object({
        indexId: z.string().describe('Network ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['network', 'delete', input.indexId], auth));
    },
  );

  server.registerTool(
    'read_index_memberships',
    {
      description: 'List members of a network',
      inputSchema: z.object({
        indexId: z.string().describe('Network ID'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['network', 'show', input.indexId], auth));
    },
  );

  server.registerTool(
    'create_index_membership',
    {
      description: 'Invite a user to a network by email',
      inputSchema: z.object({
        indexId: z.string().describe('Network ID'),
        email: z.string().describe('Email of user to invite'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['network', 'invite', input.indexId, input.email], auth));
    },
  );

  server.registerTool(
    'delete_index_membership',
    {
      description: 'Leave a network',
      inputSchema: z.object({
        indexId: z.string().describe('Network ID to leave'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      return toResult(await runCli(['network', 'leave', input.indexId], auth));
    },
  );
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd plugin && npx tsc --noEmit
git add plugin/src/tools/network.tools.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP network tools
EOF
)"
```

---

### Task 16: Plugin Contact, Utility, and Conversation Tools

**Files:**
- Create: `plugin/src/tools/contact.tools.ts`
- Create: `plugin/src/tools/utility.tools.ts`
- Create: `plugin/src/tools/conversation.tools.ts`

- [ ] **Step 1: Create contact.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}

export function registerContactTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'list_contacts',
    {
      description: 'List all contacts in the user network',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => toResult(await runCli(['contact', 'list'], auth)),
  );

  server.registerTool(
    'add_contact',
    {
      description: 'Add a contact by email',
      inputSchema: z.object({ email: z.string().describe('Contact email') }),
    },
    async (input): Promise<CallToolResult> =>
      toResult(await runCli(['contact', 'add', input.email], auth)),
  );

  server.registerTool(
    'remove_contact',
    {
      description: 'Remove a contact by email',
      inputSchema: z.object({ email: z.string().describe('Contact email') }),
    },
    async (input): Promise<CallToolResult> =>
      toResult(await runCli(['contact', 'remove', input.email], auth)),
  );

  server.registerTool(
    'import_contacts',
    {
      description: 'Import contacts in bulk',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => toResult(await runCli(['contact', 'import'], auth)),
  );

  server.registerTool(
    'import_gmail_contacts',
    {
      description: 'Import contacts from Gmail (opens browser for OAuth consent)',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> =>
      toResult(await runCli(['contact', 'import', '--gmail'], auth)),
  );
}
```

- [ ] **Step 2: Create utility.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}

export function registerUtilityTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'scrape_url',
    {
      description: 'Extract text content from a web page URL',
      inputSchema: z.object({
        url: z.string().describe('URL to scrape'),
        objective: z.string().optional().describe('What to focus on when extracting'),
      }),
    },
    async (input): Promise<CallToolResult> => {
      const args = ['scrape', input.url];
      if (input.objective) args.push('--objective', input.objective);
      return toResult(await runCli(args, auth));
    },
  );

  server.registerTool(
    'sync_context',
    {
      description: 'Re-sync all cached user context (profile, networks, intents, contacts)',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => toResult(await runCli(['sync'], auth)),
  );
}
```

- [ ] **Step 3: Create conversation.tools.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}

export function registerConversationTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'list_conversations',
    {
      description: 'List all human-to-human conversations',
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> =>
      toResult(await runCli(['conversation', 'list'], auth)),
  );

  server.registerTool(
    'send_message',
    {
      description: 'Send a message in a human-to-human conversation',
      inputSchema: z.object({
        conversationId: z.string().describe('Conversation ID'),
        message: z.string().describe('Message text'),
      }),
    },
    async (input): Promise<CallToolResult> =>
      toResult(await runCli(['conversation', 'send', input.conversationId, input.message], auth)),
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
cd plugin && npx tsc --noEmit
git add plugin/src/tools/contact.tools.ts plugin/src/tools/utility.tools.ts plugin/src/tools/conversation.tools.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP contact, utility, and conversation tools
EOF
)"
```

---

### Task 17: Plugin MCP Resources

**Files:**
- Create: `plugin/src/resources/context.resources.ts`

- [ ] **Step 1: Create context.resources.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { ReadResourceResult } from '@modelcontextprotocol/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONTEXT_FILE = join(homedir(), '.index', 'context.json');

interface CachedContext {
  syncedAt: string;
  profile: unknown;
  networks: unknown[];
  intents: unknown[];
  contacts: unknown[];
}

function loadContext(): CachedContext | null {
  if (!existsSync(CONTEXT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONTEXT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function registerContextResources(server: McpServer): void {
  server.registerResource(
    'profile',
    'index://profile',
    {
      title: 'User Profile',
      description: 'Cached user profile (name, email, bio, skills, socials)',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const ctx = loadContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx?.profile ?? { error: 'No cached context. Run sync_context tool.' }),
        }],
      };
    },
  );

  server.registerResource(
    'networks',
    'index://networks',
    {
      title: 'User Networks',
      description: 'Cached list of networks the user belongs to, with roles and prompts',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const ctx = loadContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx?.networks ?? []),
        }],
      };
    },
  );

  server.registerResource(
    'intents',
    'index://intents',
    {
      title: 'User Intents',
      description: 'Cached active intents (signals) with confidence and linked networks',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const ctx = loadContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx?.intents ?? []),
        }],
      };
    },
  );

  server.registerResource(
    'contacts',
    'index://contacts',
    {
      title: 'User Contacts',
      description: 'Cached contact list',
      mimeType: 'application/json',
    },
    async (uri): Promise<ReadResourceResult> => {
      const ctx = loadContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx?.contacts ?? []),
        }],
      };
    },
  );
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd plugin && npx tsc --noEmit
git add plugin/src/resources/context.resources.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP context resources for cached user data
EOF
)"
```

---

### Task 18: Plugin MCP Server Entry Point

**Files:**
- Create: `plugin/src/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
#!/usr/bin/env node
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import { resolveAuth } from './auth.js';
import { runCli } from './cli-runner.js';
import { registerProfileTools } from './tools/profile.tools.js';
import { registerIntentTools } from './tools/intent.tools.js';
import { registerOpportunityTools } from './tools/opportunity.tools.js';
import { registerNetworkTools } from './tools/network.tools.js';
import { registerContactTools } from './tools/contact.tools.js';
import { registerUtilityTools } from './tools/utility.tools.js';
import { registerConversationTools } from './tools/conversation.tools.js';
import { registerContextResources } from './resources/context.resources.js';

async function main() {
  // 1. Resolve auth
  let auth;
  try {
    auth = resolveAuth();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // 2. Create MCP server
  const server = new McpServer({
    name: 'index-network',
    version: '0.1.0',
  });

  // 3. Register all tools
  registerProfileTools(server, auth);
  registerIntentTools(server, auth);
  registerOpportunityTools(server, auth);
  registerNetworkTools(server, auth);
  registerContactTools(server, auth);
  registerUtilityTools(server, auth);
  registerConversationTools(server, auth);

  // 4. Register resources
  registerContextResources(server);

  // 5. Sync context on startup (non-blocking — don't fail if sync errors)
  runCli(['sync'], auth).catch(() => {
    // Sync failure is non-fatal — resources will return empty data
  });

  // 6. Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugin && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build**

Run: `cd plugin && npx tsc`
Expected: `dist/` directory created with compiled JS.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/index.ts
git commit -m "$(cat <<'EOF'
feat(plugin): add MCP server entry point with tool and resource registration
EOF
)"
```

---

### Task 19: Core Skill — `index-network.md`

**Files:**
- Create: `plugin/skills/index-network.md`

- [ ] **Step 1: Write the core skill**

```markdown
---
name: index-network
description: Use when the user asks about finding people, managing their network, creating signals/intents, discovering opportunities, or anything related to Index Network. Always active when the Index Network plugin is loaded.
---

# Index Network

You help the right people find the user and help the user find them.

## Voice

Calm, direct, warm. You are approachable for non-technical users. You are aware you are running on the user's own machine but never assume terminal fluency. Avoid hype, corporate language, or jargon. Never use the word "search" — say "looking up", "find", or "discover" instead.

## Entity Model

- **User** — A person on the network with a profile and memberships
- **Profile** — Bio, skills, socials, generated from public sources (LinkedIn, GitHub, etc.)
- **Intent (Signal)** — What a user is looking for or offering. Has confidence (0-1) and inference type (explicit/implicit)
- **Opportunity** — A discovered match between users based on their intents. Has actors, interpretation, confidence, and status (pending/accepted/rejected/expired)
- **Network (Index)** — A community of users with a shared purpose. Has a prompt that guides how intents are evaluated within it
- **Contact** — A person in the user's personal network, tracked as a member of their personal index

## Context

At conversation start, read these MCP resources to understand the user's current state:
- `index://profile` — Who they are
- `index://networks` — Their communities
- `index://intents` — Their active signals
- `index://contacts` — Their contacts

If any resource is empty or shows an error, suggest running the `sync_context` tool.

## Auth

If any tool returns an authentication error, guide the user:
- "Set the `INDEX_API_TOKEN` environment variable with your token, or run `index login` in your terminal."

## After Mutations

After creating, updating, or deleting intents, networks, contacts, or profile data, call `sync_context` to refresh the cached resources.

## Sub-Skills

Based on what the user needs, invoke the appropriate sub-skill:
- **index-network:onboard** — When profile is incomplete, no intents exist, or this is a first conversation
- **index-network:discover** — When the user wants to find people, explore opportunities, or get introductions
- **index-network:signal** — When the user wants to express what they are looking for or offering
- **index-network:connect** — When the user wants to manage networks, contacts, or memberships
```

- [ ] **Step 2: Commit**

```bash
git add plugin/skills/index-network.md
git commit -m "$(cat <<'EOF'
feat(plugin): add core index-network skill
EOF
)"
```

---

### Task 20: Sub-Skills

**Files:**
- Create: `plugin/skills/index-network-onboard.md`
- Create: `plugin/skills/index-network-discover.md`
- Create: `plugin/skills/index-network-signal.md`
- Create: `plugin/skills/index-network-connect.md`

- [ ] **Step 1: Create index-network-onboard.md**

```markdown
---
name: index-network-onboard
description: Use when the user's profile is incomplete, they have no intents, or this appears to be their first interaction with Index Network.
---

# Onboarding

Guide new users to set up their Index Network presence. Do not follow a rigid script — adapt based on what already exists.

## Process

1. Read `index://profile`. If profile exists and is complete, confirm it with the user ("I see you are [name], [bio]. Is this right?"). If missing, ask the user for their LinkedIn/GitHub URL and call `create_user_profile`.

2. Read `index://intents`. If the user has active intents, summarize them and ask if they are still relevant. If none, ask: "What are you looking for or working on right now?" Then call `create_intent` with their description.

3. Read `index://networks`. If the user has no networks beyond their personal one, suggest they explore or create one.

4. When profile and at least one intent exist, call `complete_onboarding`.

## Principles

- Only ask about what is missing. Do not re-ask about things that already exist.
- Confirm existing data rather than overwriting it.
- Keep it conversational — this is not a form to fill out.
```

- [ ] **Step 2: Create index-network-discover.md**

```markdown
---
name: index-network-discover
description: Use when the user asks to find people, explore opportunities, get introductions, or discover matches for their needs.
---

# Discovery

Help users find relevant people through opportunity discovery.

## Modes

- **Open discovery**: User describes what they need → call `create_opportunities` with `searchQuery`
- **Direct discovery**: User names a specific person → call `create_opportunities` with `targetUserId` and `mode: "direct"`
- **Introduction**: User wants to connect two people → call `create_opportunities` with `mode: "introduction"`, `sourceUserId`, and `targetUserId`

## Process

1. Understand what the user is looking for. If vague, help them refine it into a clear query.
2. Run the appropriate discovery mode.
3. Present results conversationally — highlight why each match is relevant, what the confidence score means, and what the opportunity reasoning says.
4. If the user wants to act on an opportunity, use `accept_opportunity`. If they want to skip, use `reject_opportunity`.

## Managing Opportunities

- `list_opportunities` to show pending/accepted/rejected opportunities
- `show_opportunity` for full details on a specific match
- Help the user understand the actors, interpretation, and reasoning behind each opportunity
```

- [ ] **Step 3: Create index-network-signal.md**

```markdown
---
name: index-network-signal
description: Use when the user wants to express what they are looking for or offering, create or update intents/signals, or manage intent-network links.
---

# Signals (Intents)

Help users articulate and manage their intents — what they are looking for or what they can offer.

## Creating Intents

When a user describes a need or offering, call `create_intent` with their natural language description. The server handles enrichment, similarity checks, and indexing.

Do not ask the user to structure their intent — the server processes natural language.

## Updating Intents

If a user wants to refine an existing intent, call `update_intent`. The server checks similarity with the old version and enriches as needed.

## Linking to Networks

After creating an intent, suggest linking it to relevant networks with `create_intent_index`. Use `read_intent_indexes` to show current links. Use `delete_intent_index` to unlink.

## Archiving

When an intent is fulfilled or no longer relevant, call `delete_intent` to archive it.

## Reading

Use `read_intents` to list the user's active or archived intents. Scope to a network with `indexId` if the conversation is about a specific community.
```

- [ ] **Step 4: Create index-network-connect.md**

```markdown
---
name: index-network-connect
description: Use when the user wants to manage networks (create, join, leave, invite), manage contacts (add, remove, import), or handle community memberships.
---

# Networks & Contacts

Help users manage their communities and personal network.

## Networks

- `read_indexes` — List the user's networks
- `create_index` — Create a new network with a title and optional prompt
- `update_index` — Update network title or prompt (owner only)
- `delete_index` — Delete a network (owner only, must be sole member)
- `read_index_memberships` — See who is in a network
- `create_index_membership` — Invite someone by email
- `delete_index_membership` — Leave a network

When creating a network, help the user write a good prompt — it guides how the system evaluates intents within that community.

## Contacts

- `list_contacts` — Show the user's contacts
- `add_contact` — Add someone by email (creates a ghost user if they are not on the platform)
- `remove_contact` — Remove a contact
- `import_contacts` — Bulk import
- `import_gmail_contacts` — Import from Gmail (opens browser for OAuth)

## Join Policies

Networks have join policies: `public` (anyone can join) or `invite_only` (requires invitation). When a user asks to join a network, check the policy first.
```

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/
git commit -m "$(cat <<'EOF'
feat(plugin): add onboard, discover, signal, and connect sub-skills
EOF
)"
```

---

### Task 21: Add Plugin to Workspace and Register

**Files:**
- Modify: `package.json` (workspace root)

- [ ] **Step 1: Add plugin to workspace**

In the root `package.json`, add `"plugin"` to the `workspaces` array (if it uses workspaces), or verify it can be built independently.

- [ ] **Step 2: Build the plugin**

Run: `cd plugin && bun install && npx tsc`
Expected: `dist/` directory with compiled JS, no errors.

- [ ] **Step 3: Test the MCP server starts**

Run: `cd plugin && echo '{}' | node dist/index.js`
Expected: Server starts (may error on missing auth — that's expected). Verify it doesn't crash with an unhandled exception.

- [ ] **Step 4: Commit**

```bash
git add package.json plugin/
git commit -m "$(cat <<'EOF'
feat(plugin): add plugin to workspace, verify build
EOF
)"
```

---

### Task 22: Final Type Check and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Type check CLI**

Run: `cd cli && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 2: Type check plugin**

Run: `cd plugin && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 3: Lint CLI**

Run: `cd cli && bun run lint`
Expected: No lint errors.

- [ ] **Step 4: Build plugin**

Run: `cd plugin && npx tsc`
Expected: Clean build in `dist/`.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: fix type errors and lint issues from plugin implementation
EOF
)"
```
