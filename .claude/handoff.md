---
trigger: "Add 'key' fields (human-readable identifiers) to users and indexes. Use prefix-matching for other entities in CLI. CLI list commands should display short IDs."
type: feat
branch: feat/user-index-keys
base-branch: dev
created: 2026-03-31
---

## Related Files
- protocol/src/schemas/database.schema.ts (users table ~L38, indexes table ~L232)
- protocol/src/adapters/database.adapter.ts (user lookups ~L4047, index lookups ~L2089)
- protocol/src/services/user.service.ts (findById, findByIds, findWithGraph)
- protocol/src/services/index.service.ts (getIndexById, getPublicIndexById)
- protocol/src/controllers/user.controller.ts (user endpoints)
- protocol/src/controllers/index.controller.ts (index endpoints with :id params)
- cli/src/output/formatters.ts (list display — network ~L413, intent ~L154, opportunity ~L275, conversation ~L546)
- cli/src/intent.command.ts
- cli/src/opportunity.command.ts
- cli/src/network.command.ts
- cli/src/conversation.command.ts
- cli/src/api.client.ts (typed HTTP client)

## Relevant Docs
- docs/specs/api-reference.md
- docs/design/protocol-deep-dive.md
- docs/design/architecture-overview.md

## Related Issues
None — no related issues found.

## Scope

### 1. Schema: Add `key` column to users and indexes
- Add `key: text('key').unique()` to both `users` and `indexes` tables
- Generate migration, rename following convention
- Auto-generate keys on creation (from name/title, kebab-case, with uniqueness suffix if needed)
- Users and index owners can update their key via API

### 2. Backend: Key-based lookup
- Adapter: Add `findByKey(key)` for users, `getIndexByKey(key)` for indexes
- Adapter: Update existing lookup methods to accept `idOrKey` (detect UUID vs key format)
- Service: Propagate idOrKey resolution
- Controller: User and index endpoints accept key or UUID in path params
- API: Add PUT endpoint for updating key (with validation: lowercase, alphanumeric + hyphens, min 3 chars)

### 3. Backend: Prefix-matching for other entities
- Adapter/Service: For intents, opportunities, conversations — support ID prefix lookup (WHERE id LIKE '$prefix%')
- Controller: Accept short IDs in path params, resolve to full UUID

### 4. CLI: Display short IDs in list commands
- Intent list: Show first 8 chars of UUID
- Opportunity list: Show first 8 chars of UUID
- Conversation list: Show first 8 chars instead of full UUID
- Network list: Show key (not UUID)
- All `show`, `archive`, `accept`, `reject` subcommands: Accept short ID prefix or key
