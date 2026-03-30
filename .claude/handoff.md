---
trigger: "Refactor CLI implementation for architectural soundness — inspect current cli/ codebase and improve structure, patterns, and consistency"
type: refactor
branch: refactor/cli-architecture
base-branch: dev
created: 2026-03-30
version-bump: patch
---

## Related Files
- cli/src/main.ts (621 lines — bloated entry point with inline handlers)
- cli/src/output.ts (1062 lines — monolithic formatter)
- cli/src/api.client.ts (688 lines — types mixed with HTTP methods)
- cli/src/args.parser.ts (220 lines — argument parsing)
- cli/src/auth.store.ts (71 lines — credential storage)
- cli/src/chat.command.ts (173 lines — SSE stream renderer)
- cli/src/network.command.ts (162 lines — clean extracted module pattern)
- cli/src/conversation.command.ts (183 lines — clean extracted module pattern)
- cli/src/login.command.ts (179 lines — login flow)
- cli/src/sse.parser.ts (63 lines — SSE parser)

## Relevant Docs
- docs/specs/cli-v1.md
- docs/specs/cli-profile.md
- docs/specs/cli-intent-command.md
- docs/specs/cli-opportunity.md
- docs/specs/cli-network.md
- docs/specs/cli-conversation.md

## Related Issues
None — no related issues found.

## Scope
The CLI was built incrementally across 6 PRs (#598–#608). Later commands (network, conversation) follow a clean extracted-module pattern, but earlier commands (chat, profile, intent, opportunity) have their handlers inline in main.ts. This refactor brings consistency.

### 1. Extract command handlers from main.ts into separate modules

Create these new files following the network.command.ts / conversation.command.ts pattern:
- `cli/src/profile.command.ts` — extract runProfileMe, runProfileShow, runProfileSync
- `cli/src/intent.command.ts` — extract runIntent and its sub-handlers
- `cli/src/opportunity.command.ts` — extract runOpportunity and its sub-handlers

Each module should export a single `handleX(client, subcommand, positionals, options)` function. main.ts should become a thin dispatcher (~100-150 lines).

The chat command is special (REPL, SSE streaming, streamToTerminal) — extract chat handler logic into chat.command.ts (which already exists for renderSSEStream). Move streamToTerminal, handleStreamError, runChatList, runChatOneShot, runChatRepl there.

Login/logout can stay in main.ts or move to login.command.ts (which already exists).

### 2. Extract types from api.client.ts into cli/src/types.ts

Move all interface/type definitions (ChatSession, UserProfile, StreamChatParams, UserData, Intent, Opportunity, Network, etc.) out of api.client.ts into a shared types file. api.client.ts should focus on HTTP methods only.

### 3. Split output.ts by concern

Split the 1062-line output.ts into:
- `cli/src/output/index.ts` — re-exports everything (preserves `import * as output from "./output"`)
- `cli/src/output/base.ts` — ANSI constants, error/success/info/dim/heading helpers
- `cli/src/output/markdown.ts` — MarkdownRenderer class
- `cli/src/output/formatters.ts` — all table/card formatters (session, profile, intent, opportunity, network, conversation, member, message)

OR keep output.ts as a single file but fix the mid-file import (move to top).

### 4. Standardize auth flow

All command handlers should receive an already-authenticated ApiClient. main.ts calls requireAuth() once and passes the client down. No handler should call requireAuth internally.

### 5. Preserve all existing behavior and tests

This is a pure structural refactor. All 18+ conversation tests, all existing CLI tests must continue to pass. No API changes, no output changes.
