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
