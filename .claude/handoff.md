---
trigger: "CLI conversation command — add H2H DM support to the CLI using the unified /api/conversations/* endpoints"
type: feat
branch: feat/cli-conversation
base-branch: dev
created: 2026-03-30
linear-issue: IND-199
---

## Related Files
- cli/src/main.ts (entry point, command routing)
- cli/src/args.parser.ts (ParsedCommand, KNOWN_COMMANDS, subcommand parsing)
- cli/src/api.client.ts (ApiClient class, types)
- cli/src/output.ts (ANSI formatters, tables, cards)
- cli/src/network.command.ts (reference for command handler pattern)
- cli/src/chat.command.ts (SSE streaming — conversation may need real-time via SSE)
- protocol/src/controllers/conversation.controller.ts (API endpoints to target)
- protocol/src/services/conversation.service.ts (service layer, DM dedup, real-time pub/sub)

## Relevant Docs
- docs/specs/api-reference.md (Conversation endpoint documentation)
- docs/specs/cli-v1.md (CLI v1 spec — auth, chat commands)

## Related Issues
- IND-199 Design Index CLI — clarify A2A, H2A, H2H terminology (Done) — parent design issue covering CLI conversation support

## Scope
Add an `index conversation` command to the CLI for H2H (Human-to-Human) direct messaging. The backend unified conversation system (PR #607) is now merged, providing these endpoints:

### API Endpoints to implement:
- `GET /api/conversations` — list conversations
- `POST /api/conversations` — create conversation with participants
- `POST /api/conversations/dm` — get or create a DM with a peer
- `GET /api/conversations/:id/messages` — get messages (supports limit, before cursor, taskId filter)
- `POST /api/conversations/:id/messages` — send a message (parts array)
- `PATCH /api/conversations/:id/metadata` — update metadata
- `DELETE /api/conversations/:id` — hide conversation
- `GET /api/conversations/stream` — SSE for real-time events

### CLI subcommands needed:
- `index conversation list` — list DM conversations
- `index conversation with <user-id>` — open/resume a DM with a user (get-or-create)
- `index conversation show <id>` — show messages in a conversation
- `index conversation send <id> <message>` — send a message
- `index conversation stream` — (optional) real-time SSE listener

### Implementation pattern (follow existing commands):
1. Add "conversation" to ParsedCommand.command union and KNOWN_COMMANDS
2. Add CONVERSATION_SUBCOMMANDS set and parsing in args.parser.ts
3. Add conversation API methods and types to api.client.ts
4. Add conversation output formatters (conversationTable, conversationCard, messageList) to output.ts
5. Create conversation.command.ts handler (follow network.command.ts pattern)
6. Wire into main.ts command routing
