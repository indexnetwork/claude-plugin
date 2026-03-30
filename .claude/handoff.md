---
trigger: "Add `index intent` command to the CLI — list, show, create, and archive intents (signals)."
type: feat
branch: feat/cli-intent
base-branch: dev
created: 2026-03-30
---

## Related Files
- cli/src/main.ts — entry point, command routing (add intent case)
- cli/src/args.parser.ts — argument parser (add "intent" command + subcommands: list, show, create, archive)
- cli/src/api.client.ts — HTTP client (add listIntents, getIntent, createIntent, archiveIntent methods)
- cli/src/output.ts — terminal formatting (add intent list table, intent detail card)
- protocol/src/controllers/intent.controller.ts — intent API endpoints
- cli/src/auth.store.ts — credential loading (reuse existing)

## Relevant Docs
- docs/specs/cli-v1.md — CLI v1 spec (login + chat), pattern reference
- docs/domain/intents.md — intent domain model (speech acts, felicity conditions, lifecycle)
- docs/specs/api-reference.md — full API reference
- docs/design/cli-interaction-design.md — CLI design doc with intent command surface

## Related Issues
- IND-199 Design Index CLI — clarify A2A, H2A, H2H terminology (Done)
- IND-144 Standardize terminology: replace 'priority' with 'signal' throughout UI (Done) — user-facing term is "signal", internal API uses "intent"

## Scope
Add `index intent` command to the existing cli/ workspace with four subcommands:

1. **`index intent list`** — List the user's intents. Calls POST /api/intents/list with pagination. Renders a table with: description (truncated), confidence, sourceType, status, createdAt. Supports `--archived` flag to include archived intents, `--limit <n>` for page size.

2. **`index intent show <id>`** — Show full intent details. Calls GET /api/intents/:id. Renders a detailed card with: full description, confidence score, inference type, source type, status, timestamps, and index assignments if present.

3. **`index intent create <content>`** — Create an intent from natural language. Calls POST /api/intents/process with { content }. Prints the created intent summary. Content can be quoted multi-word string.

4. **`index intent archive <id>`** — Archive an intent. Calls PATCH /api/intents/:id/archive. Prints confirmation.

Implementation touches:
- `args.parser.ts`: Add "intent" to KNOWN_COMMANDS, parse subcommands ("list", "show", "create", "archive") and positional args (id, content)
- `api.client.ts`: Add listIntents(opts), getIntent(id), processIntent(content), archiveIntent(id) methods. Note: list is POST not GET.
- `main.ts`: Add "intent" case in switch, wire to handler functions
- `output.ts`: Add intentTable() and intentCard() renderers. User-facing copy should say "signal" where appropriate (per IND-144).
- New test file: `cli/tests/intent.command.test.ts`
- Update `cli/README.md` with intent command docs

API notes:
- POST /api/intents/list body: { page?, limit?, archived?, sourceType? } → { intents[], pagination }
- GET /api/intents/:id → { intent }
- PATCH /api/intents/:id/archive → { success: true }
- POST /api/intents/process body: { content } → result object
