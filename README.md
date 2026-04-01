# Index Network Plugin for Claude

Find the right people and let them find you — from inside Claude.

This plugin connects Claude to [Index Network](https://index.network), an intent-driven discovery protocol. Describe what you're looking for or offering, and the network finds relevant people across your communities.

## What It Does

- **Discover people** — describe a need and get matched with relevant people based on intents, not keyword search
- **Manage intents** — express what you're looking for or offering; the system handles enrichment and indexing
- **Explore opportunities** — review, accept, or reject discovered matches with context on why they're relevant
- **Manage networks** — create communities, invite members, set prompts that guide how intents are evaluated
- **Manage contacts** — add people by email, bulk import, or connect Gmail

The plugin exposes 32 MCP tools and 4 context resources, plus skills that guide Claude's behavior for each workflow.

## Prerequisites

- [Index CLI](https://github.com/indexnetwork/index) installed and available as `index` in your PATH
- An Index Network account with an API token

## Authentication

The plugin resolves auth in this order:

1. **`INDEX_API_TOKEN` environment variable** — set this in your Claude Code or Claude Desktop config
2. **`~/.index/credentials.json`** — created by running `index login` in your terminal

## Install in Claude Code

```bash
# Add the marketplace
/plugin marketplace add indexnetwork/claude-plugin

# Install the plugin
/plugin install index-network@indexnetwork-claude-plugin
```

Or load locally during development:

```bash
claude --plugin-dir /path/to/claude-plugin
```

## Install in Claude Desktop

1. Open **Settings → Plugins**
2. Add the plugin directory or point to this repository

Set `INDEX_API_TOKEN` in the MCP server environment configuration.

## Skills

The plugin includes 5 skills that shape how Claude interacts with Index Network:

| Skill | When it activates |
|-------|-------------------|
| `index-network` | Always active — reads your context, guides Claude's voice and behavior |
| `index-network:onboard` | First interaction, incomplete profile, or no intents |
| `index-network:discover` | Finding people, exploring opportunities, requesting introductions |
| `index-network:signal` | Expressing what you're looking for or offering |
| `index-network:connect` | Managing networks, contacts, and memberships |

## MCP Tools

### Profile
`read_user_profiles` · `create_user_profile` · `update_user_profile` · `complete_onboarding`

### Intents
`read_intents` · `create_intent` · `update_intent` · `delete_intent` · `create_intent_index` · `read_intent_indexes` · `delete_intent_index`

### Opportunities
`create_opportunities` · `list_opportunities` · `show_opportunity` · `accept_opportunity` · `reject_opportunity`

### Networks
`read_indexes` · `create_index` · `update_index` · `delete_index` · `read_index_memberships` · `create_index_membership` · `delete_index_membership`

### Contacts
`list_contacts` · `add_contact` · `remove_contact` · `import_contacts` · `import_gmail_contacts`

### Conversations
`list_conversations` · `send_message`

### Utility
`scrape_url` · `sync_context`

## MCP Resources

| URI | Description |
|-----|-------------|
| `index://profile` | Your profile (bio, skills, socials) |
| `index://networks` | Communities you belong to |
| `index://intents` | Your active signals |
| `index://contacts` | People in your personal network |

These are cached locally at `~/.index/context.json` and refreshed via `sync_context`.

## Development

```bash
npm install
npm run build
npm run dev          # watch mode
```

The plugin is an MCP server using `@modelcontextprotocol/sdk` with stdio transport. It wraps the `index` CLI — all domain logic (enrichment, similarity checks, opportunity evaluation) runs server-side.

## License

MIT
