---
trigger: "IND-199: Build the `index` CLI tool — first iteration with `index login` (auth) and `index chat` (H2A streaming). The CLI connects to the Index Network REST API and will later be wrapped as a Claude Code skill."
type: feat
branch: feat/cli
base-branch: dev
created: 2026-03-30
linear-issue: IND-199
---

## Related Files
- docs/design/cli-interaction-design.md (design doc, on branch docs/cli-interaction-design, PR #584)
- docs/specs/api-reference.md (full API reference)
- protocol/src/controllers/chat.controller.ts (H2A endpoints: /api/chat/stream, /api/chat/sessions, etc.)
- protocol/src/controllers/conversation.controller.ts (H2H/A2A endpoints)
- protocol/src/controllers/intent.controller.ts
- protocol/src/controllers/opportunity.controller.ts
- protocol/src/controllers/profile.controller.ts

## Relevant Docs
- docs/design/cli-interaction-design.md — canonical CLI design: terminology (A2A/H2A/H2H), command surface, unification proposal
- docs/specs/api-reference.md — all REST endpoints, auth patterns (Bearer JWT, AuthGuard)
- docs/design/architecture-overview.md — monorepo structure, protocol layering
- docs/.archive/superpowers/plans/2026-03-19-unified-conversations.md — context on conversation model history

## Related Issues
- IND-199 Design Index CLI — clarify A2A, H2A, H2H terminology (In Review)
- IND-192 Rename "index" to "network" across full stack (In Review) — may affect CLI noun naming

## Scope
Build the first iteration of the `index` CLI binary. Scope limited to:

1. **`index login`** — Browser-based OAuth flow via Better Auth. Opens browser, receives callback, stores JWT session token locally (~/.index/credentials or similar).
2. **`index chat [message]`** — Start or continue an H2A conversation with the system agent. Connects to `POST /api/chat/stream` via SSE. Renders streamed tokens to terminal. Supports interactive REPL mode and one-shot mode (message as argument).
3. **`index chat --session <id>`** — Resume a specific session.
4. **`index chat --list`** — List existing chat sessions (GET /api/chat/sessions).

Out of scope for this iteration: `index conversation`, `index intent`, `index opportunity`, `index profile`, `index idx`, and all H2H/A2A CLI commands.

Tech decisions to make in worktree:
- CLI framework (Commander.js, or Bun-native with parseArgs)
- Package structure (new `cli/` workspace or standalone in protocol?)
- Token storage format and location
- SSE client for streaming (eventsource polyfill or raw fetch)
