# Claude Plugin Skills-Only Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the Claude plugin to skills-only (no MCP server) so skills instruct Claude to run CLI commands directly via Bash.

**Architecture:** Remove all TypeScript/MCP code from the plugin repo. Rewrite 5 skill markdown files to reference `index` CLI commands instead of MCP tools. The plugin becomes pure content — no build, no dependencies.

**Tech Stack:** Markdown (skills), `@indexnetwork/cli` (prerequisite)

**Spec:** `docs/superpowers/specs/2026-04-02-claude-plugin-skills-only-design.md`

---

## File Map

All work happens in the plugin submodule at `plugin/` (which maps to `/Users/aposto/.claude/plugins/marketplaces/indexnetwork-claude-plugin/`).

**Delete:**
- `plugin/src/` (entire directory — index.ts, auth.ts, cli-runner.ts, tools/*, resources/*)
- `plugin/.mcp.json`
- `plugin/package.json`
- `plugin/package-lock.json`
- `plugin/tsconfig.json`
- `plugin/node_modules/` (if present)
- `plugin/dist/` (if present)

**Rewrite:**
- `plugin/skills/index-network/SKILL.md`
- `plugin/skills/index-network-onboard/SKILL.md`
- `plugin/skills/index-network-discover/SKILL.md`
- `plugin/skills/index-network-signal/SKILL.md`
- `plugin/skills/index-network-connect/SKILL.md`

**Update:**
- `plugin/.gitignore`
- `plugin/README.md`

**Keep unchanged:**
- `plugin/.claude-plugin/plugin.json`
- `plugin/.claude-plugin/marketplace.json`
- `plugin/.github/workflows/sync-submodule.yml`

---

### Task 1: Remove MCP server code and config

**Files:**
- Delete: `plugin/src/` (entire directory)
- Delete: `plugin/.mcp.json`
- Delete: `plugin/package.json`
- Delete: `plugin/package-lock.json`
- Delete: `plugin/tsconfig.json`
- Delete: `plugin/node_modules/` (if exists)
- Delete: `plugin/dist/` (if exists)
- Modify: `plugin/.gitignore`

- [ ] **Step 1: Remove code, config, and build artifacts**

```bash
cd plugin
rm -rf src/ dist/ node_modules/ .mcp.json package.json package-lock.json tsconfig.json
```

- [ ] **Step 2: Simplify .gitignore**

Replace contents of `plugin/.gitignore` with:

```
.DS_Store
```

No `dist/`, `node_modules/`, or `bun.lock` — those don't exist anymore.

- [ ] **Step 3: Verify plugin structure**

```bash
ls -la plugin/
```

Expected: `.claude-plugin/`, `skills/`, `.github/`, `.git/`, `.gitignore`, `README.md` — no code files.

- [ ] **Step 4: Commit**

```bash
cd plugin
git add -A
git commit -m "chore: remove MCP server code and config

The plugin is now skills-only. CLI commands replace MCP tools.
No build step, no npm dependencies, no MCP server."
```

---

### Task 2: Rewrite core skill (index-network)

**Files:**
- Rewrite: `plugin/skills/index-network/SKILL.md`

- [ ] **Step 1: Write the new core skill**

Replace `plugin/skills/index-network/SKILL.md` with:

```markdown
---
name: index-network
description: Use when the user asks about finding people, managing their network, creating signals/intents, discovering opportunities, or anything related to Index Network. Always active when the Index Network plugin is loaded.
---

# Index Network

You help the right people find the user and help the user find them.

## Voice

Calm, direct, warm. Approachable for non-technical users. Aware you are running on the user's own machine but never assume terminal fluency. Avoid hype, corporate language, or jargon. Never use the word "search" — say "looking up", "find", or "discover" instead.

## Entity Model

- **User** — A person on the network with a profile and memberships
- **Profile** — Bio, skills, socials, generated from public sources (LinkedIn, GitHub, etc.)
- **Intent (Signal)** — What a user is looking for or offering. Has confidence (0-1) and inference type (explicit/implicit)
- **Opportunity** — A discovered match between users based on their intents. Has actors, interpretation, confidence, and status (pending/accepted/rejected/expired)
- **Network (Index)** — A community of users with a shared purpose. Has a prompt that guides how intents are evaluated within it
- **Contact** — A person in the user's personal network, tracked as a member of their personal index

## Setup (run on every activation)

### 1. CLI Check

Silently run `which index`. If the CLI is not found, tell the user:

> "Index Network needs the CLI tool. Install it and log in:"
>
> `!npm install -g @indexnetwork/cli`
>
> Then authenticate:
>
> `!index login`

Stop here until the CLI is available.

### 2. Auth Check

Silently run `index profile --json 2>&1`. If the output contains an authentication error, tell the user:

> "You need to log in to Index Network:"
>
> `!index login`

Stop here until auth succeeds.

### 3. Context Gathering

Silently run all four commands and internalize the results. Do not show output to the user.

- `index profile --json` — who they are
- `index intent list --json` — their active signals
- `index network list --json` — their communities
- `index contact list --json` — their contacts

Use this context to understand the user's current state before responding.

## Sub-Skills

Based on what the user needs, invoke the appropriate sub-skill:

- **index-network:onboard** — When profile is incomplete, no intents exist, or this is a first conversation
- **index-network:discover** — When the user wants to find people, explore opportunities, or get introductions
- **index-network:signal** — When the user wants to express what they are looking for or offering
- **index-network:connect** — When the user wants to manage networks, contacts, or memberships

## After Mutations

After creating, updating, or deleting anything, silently re-run the relevant list command to refresh your context. For example, after creating an intent, re-run `index intent list --json` silently.

## CLI Reference

All commands use `--json` for structured output. Run via Bash. Always quote strings that may contain spaces.

### Profile
- `index profile --json` — view own profile
- `index profile show <user-id> --json` — view another user
- `index profile create --linkedin <url> --github <url> --twitter <url> --json` — create from social URLs
- `index profile update <field> --details "<text>" --json` — update a field
- `index profile search "<query>" --json` — find profiles
- `index onboarding complete --json` — mark onboarding done

### Intents (Signals)
- `index intent list [--archived] [--limit <n>] --json` — list intents
- `index intent show <id> --json` — show intent details
- `index intent create "<description>" --json` — create intent
- `index intent update <id> "<content>" --json` — update intent
- `index intent archive <id> --json` — archive intent
- `index intent link <id> <network-id> --json` — link to network
- `index intent unlink <id> <network-id> --json` — unlink from network
- `index intent links <id> --json` — show linked networks

### Opportunities
- `index opportunity discover "<query>" --json` — discover opportunities
- `index opportunity list [--status <s>] [--limit <n>] --json` — list opportunities
- `index opportunity show <id> --json` — show details
- `index opportunity accept <id> --json` — accept
- `index opportunity reject <id> --json` — reject

### Networks
- `index network list --json` — list networks
- `index network create "<name>" [--prompt "<p>"] --json` — create
- `index network show <id> --json` — show with members
- `index network update <id> [--title "<t>"] [--prompt "<p>"] --json` — update
- `index network delete <id> --json` — delete
- `index network join <id> --json` — join public
- `index network leave <id> --json` — leave
- `index network invite <id> <email> --json` — invite by email

### Contacts
- `index contact list --json` — list contacts
- `index contact add <email> --json` — add
- `index contact remove <email> --json` — remove
- `index contact import --json` — import
- `index contact import --gmail --json` — import from Gmail

### Conversations
- `index conversation list --json` — list conversations
- `index conversation send <id> "<message>" --json` — send message

### Utility
- `index scrape "<url>" [--objective "<text>"] --json` — scrape URL
- `index sync --json` — sync context cache
```

- [ ] **Step 2: Verify skill has valid frontmatter**

```bash
head -4 plugin/skills/index-network/SKILL.md
```

Expected: YAML frontmatter with `name: index-network` and `description:` fields.

- [ ] **Step 3: Commit**

```bash
cd plugin
git add skills/index-network/SKILL.md
git commit -m "feat: rewrite core skill for CLI-direct execution

Replace MCP tool references with CLI commands. Add setup gates
for CLI availability and auth. Add silent context gathering."
```

---

### Task 3: Rewrite onboarding skill

**Files:**
- Rewrite: `plugin/skills/index-network-onboard/SKILL.md`

- [ ] **Step 1: Write the new onboarding skill**

Replace `plugin/skills/index-network-onboard/SKILL.md` with:

```markdown
---
name: index-network-onboard
description: Use when the user's profile is incomplete, they have no intents, or this appears to be their first interaction with Index Network.
---

# Onboarding

Guide new users to set up their Index Network presence. Do not follow a rigid script — adapt based on what already exists.

## Prerequisites

The parent skill (index-network) has already verified CLI availability and auth. Context has been gathered silently — you already know the user's profile, intents, networks, and contacts.

## Process

1. **Profile** — If profile exists and is complete, confirm it with the user ("I see you're [name], [bio]. Is this right?"). If missing or incomplete, ask the user for their LinkedIn or GitHub URL, then run:

   ```
   index profile create --linkedin <url> --github <url> --json
   ```

   Wait for the command to complete, then silently re-run `index profile --json` to refresh context.

2. **First intent** — If the user has active intents, summarize them and ask if they are still relevant. If none exist, ask conversationally: "What are you looking for or working on right now?" Then run:

   ```
   index intent create "<their description>" --json
   ```

   Silently re-run `index intent list --json` to refresh context.

3. **Networks** — If the user has no networks beyond their personal one, suggest they explore or create one. If they want to create one:

   ```
   index network create "<name>" --prompt "<purpose>" --json
   ```

4. **Completion** — When profile and at least one intent exist, run:

   ```
   index onboarding complete --json
   ```

## Principles

- Only ask about what is missing. Do not re-ask about things that already exist.
- Confirm existing data rather than overwriting it.
- Keep it conversational — this is not a form to fill out.
- If the CLI is not installed or auth fails, the parent skill handles that — you should never encounter it.
```

- [ ] **Step 2: Commit**

```bash
cd plugin
git add skills/index-network-onboard/SKILL.md
git commit -m "feat: rewrite onboard skill for CLI-direct execution"
```

---

### Task 4: Rewrite discover skill

**Files:**
- Rewrite: `plugin/skills/index-network-discover/SKILL.md`

- [ ] **Step 1: Write the new discover skill**

Replace `plugin/skills/index-network-discover/SKILL.md` with:

```markdown
---
name: index-network-discover
description: Use when the user asks to find people, explore opportunities, get introductions, or discover matches for their needs.
---

# Discovery

Help users find relevant people through opportunity discovery.

## Prerequisites

The parent skill (index-network) has already verified CLI availability and auth. Context has been gathered silently.

## Modes

- **Open discovery** — User describes what they need:

  ```
  index opportunity discover "<query>" --json
  ```

- **Targeted discovery** — User names a specific person. Use their user ID:

  ```
  index opportunity discover "<query>" --target <user-id> --json
  ```

- **Introduction** — User wants to connect two people:

  ```
  index opportunity discover --introduce <user-id-1> <user-id-2> --json
  ```

Note: Discovery can take up to 3 minutes. Let the user know you're looking.

## Process

1. Understand what the user is looking for. If vague, help them refine it into a clear query.
2. Run the appropriate discovery command.
3. Present results conversationally — highlight why each match is relevant, what the confidence score means, and what the opportunity reasoning says.
4. If the user wants to act on an opportunity:

   ```
   index opportunity accept <id> --json
   ```

   If they want to skip:

   ```
   index opportunity reject <id> --json
   ```

## Managing Opportunities

- List pending/accepted/rejected:

  ```
  index opportunity list --status <status> --json
  ```

- Show full details:

  ```
  index opportunity show <id> --json
  ```

- Help the user understand the actors, interpretation, and reasoning behind each opportunity.
```

- [ ] **Step 2: Commit**

```bash
cd plugin
git add skills/index-network-discover/SKILL.md
git commit -m "feat: rewrite discover skill for CLI-direct execution"
```

---

### Task 5: Rewrite signal skill

**Files:**
- Rewrite: `plugin/skills/index-network-signal/SKILL.md`

- [ ] **Step 1: Write the new signal skill**

Replace `plugin/skills/index-network-signal/SKILL.md` with:

```markdown
---
name: index-network-signal
description: Use when the user wants to express what they are looking for or offering, create or update intents/signals, or manage intent-network links.
---

# Signals (Intents)

Help users articulate and manage their intents — what they are looking for or what they can offer.

## Prerequisites

The parent skill (index-network) has already verified CLI availability and auth. Context has been gathered silently.

## Creating Intents

When a user describes a need or offering, run:

```
index intent create "<their natural language description>" --json
```

Do not ask the user to structure their intent — the server processes natural language. After creating, silently re-run `index intent list --json` to refresh context.

## Updating Intents

If a user wants to refine an existing intent:

```
index intent update <id> "<new description>" --json
```

The server checks similarity with the old version and enriches as needed.

## Linking to Networks

After creating an intent, suggest linking it to relevant networks:

```
index intent link <intent-id> <network-id> --json
```

Show current links:

```
index intent links <intent-id> --json
```

Unlink:

```
index intent unlink <intent-id> <network-id> --json
```

## Archiving

When an intent is fulfilled or no longer relevant:

```
index intent archive <id> --json
```

## Reading

List the user's active or archived intents:

```
index intent list [--archived] [--limit <n>] --json
```

Show details of a specific intent:

```
index intent show <id> --json
```
```

- [ ] **Step 2: Commit**

```bash
cd plugin
git add skills/index-network-signal/SKILL.md
git commit -m "feat: rewrite signal skill for CLI-direct execution"
```

---

### Task 6: Rewrite connect skill

**Files:**
- Rewrite: `plugin/skills/index-network-connect/SKILL.md`

- [ ] **Step 1: Write the new connect skill**

Replace `plugin/skills/index-network-connect/SKILL.md` with:

```markdown
---
name: index-network-connect
description: Use when the user wants to manage networks (create, join, leave, invite), manage contacts (add, remove, import), or handle community memberships.
---

# Networks & Contacts

Help users manage their communities and personal network.

## Prerequisites

The parent skill (index-network) has already verified CLI availability and auth. Context has been gathered silently.

## Networks

List networks:

```
index network list --json
```

Create a new network:

```
index network create "<name>" --prompt "<purpose>" --json
```

When creating a network, help the user write a good prompt — it guides how the system evaluates intents within that community.

Update network title or prompt (owner only):

```
index network update <id> --title "<new title>" --prompt "<new prompt>" --json
```

Delete a network (owner only):

```
index network delete <id> --json
```

Show network members:

```
index network show <id> --json
```

Invite someone by email:

```
index network invite <id> <email> --json
```

Join a public network:

```
index network join <id> --json
```

Leave a network:

```
index network leave <id> --json
```

## Contacts

List contacts:

```
index contact list --json
```

Add someone by email (creates a ghost user if they are not on the platform):

```
index contact add <email> --json
```

Remove a contact:

```
index contact remove <email> --json
```

Bulk import:

```
index contact import --json
```

Import from Gmail (opens browser for OAuth):

```
index contact import --gmail --json
```

## Join Policies

Networks have join policies: `public` (anyone can join) or `invite_only` (requires invitation). When a user asks to join a network, check the policy first by running `index network show <id> --json`.

After any network or contact mutation, silently re-run the relevant list command to refresh context.
```

- [ ] **Step 2: Commit**

```bash
cd plugin
git add skills/index-network-connect/SKILL.md
git commit -m "feat: rewrite connect skill for CLI-direct execution"
```

---

### Task 7: Update README and bump version

**Files:**
- Rewrite: `plugin/README.md`
- Modify: `plugin/.claude-plugin/plugin.json` (version bump)
- Modify: `plugin/.claude-plugin/marketplace.json` (version bump)

- [ ] **Step 1: Write new README**

Replace `plugin/README.md` with:

```markdown
# Index Network — Claude Code Plugin

Find the right people and let them find you. This plugin adds Index Network skills to Claude Code — managing intents, discovering opportunities, and connecting communities.

## Prerequisites

Install the CLI and authenticate:

```bash
npm install -g @indexnetwork/cli
index login
```

## What This Plugin Does

This plugin provides **skills** (behavioral guidance) that teach Claude how to use the Index Network CLI on your behalf. There is no MCP server — Claude runs CLI commands directly via Bash.

### Skills

| Skill | Purpose |
|---|---|
| `index-network` | Core skill — CLI setup, context gathering, sub-skill dispatch |
| `index-network:onboard` | Guide new users through profile and first intent setup |
| `index-network:discover` | Find relevant people and opportunities |
| `index-network:signal` | Create and manage intents (what you're looking for or offering) |
| `index-network:connect` | Manage networks, contacts, and memberships |

## How It Works

1. When activated, the skill silently checks that the CLI is installed and authenticated
2. It gathers your profile, intents, networks, and contacts silently for context
3. Based on your request, it invokes the appropriate sub-skill
4. Sub-skills run `index` CLI commands with `--json` output and present results conversationally
```

- [ ] **Step 2: Bump version in plugin.json**

Update `plugin/.claude-plugin/plugin.json` version from `0.1.0` to `0.2.0`.

- [ ] **Step 3: Bump version in marketplace.json**

Update `plugin/.claude-plugin/marketplace.json` version from `0.1.0` to `0.2.0`.

- [ ] **Step 4: Commit**

```bash
cd plugin
git add README.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "docs: update README for skills-only architecture

Bump version to 0.2.0. Document CLI prerequisite and skill-based
approach. Remove all references to MCP server."
```

---

### Task 8: Sync submodule pointer in parent repo

**Files:**
- Modify: `plugin` (submodule pointer in parent repo)

- [ ] **Step 1: Update submodule pointer**

From the parent repo root (`/Users/aposto/Projects/index`):

```bash
cd plugin && git log --oneline -1
```

Note the commit hash.

```bash
cd ..
git add plugin
git commit -m "chore: sync plugin submodule to skills-only redesign"
```

- [ ] **Step 2: Verify plugin structure is clean**

```bash
ls plugin/
```

Expected: `.claude-plugin/`, `.github/`, `.gitignore`, `README.md`, `skills/` — no code files, no `src/`, no `package.json`, no `.mcp.json`.
