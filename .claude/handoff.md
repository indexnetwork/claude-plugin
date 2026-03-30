---
trigger: "backend unification for chats - unify chat and conversation controllers/services in the protocol backend"
type: refactor
branch: refactor/chat-unification
base-branch: dev
created: 2026-03-30
linear-issue: IND-199
---

## Related Files
- protocol/src/controllers/chat.controller.ts
- protocol/src/controllers/conversation.controller.ts
- protocol/src/services/chat.service.ts
- protocol/src/services/conversation.service.ts
- protocol/src/adapters/database.adapter.ts (ChatDatabaseAdapter + ConversationDatabaseAdapter sections)
- protocol/src/schemas/conversation.schema.ts (shared DB schema for both systems)
- protocol/src/lib/protocol/graphs/chat.graph.ts
- protocol/src/types/chat-streaming.types.ts

## Relevant Docs
- docs/specs/api-reference.md (Chat and Conversation endpoint docs)
- docs/design/cli-interaction-design.md (A2A/H2A/H2H terminology and unification proposal — on branch docs/cli-interaction-design, PR #584)

## Related Issues
- IND-199 Design Index CLI — clarify A2A, H2A, H2H terminology (Done) — describes the "Chat vs Conversations Ambiguity" problem and unification plan
- IND-12 Chat/messaging feature development (Done)
- IND-110 [Chat] Conversation history in tools (Done)

## Scope
The codebase has two parallel systems for messaging that share the same underlying DB tables (conversations, messages, conversation_metadata, etc.):

1. **Chat system** (`/api/chat/*`): ChatController → ChatSessionService → ChatDatabaseAdapter. Uses "sessions" terminology. Always 2 participants (user + system-agent). SSE streaming from controller. Handles H2A (discovery) conversations with LLM graph processing.

2. **Conversation system** (`/api/conversations/*`): ConversationController → ConversationService → ConversationDatabaseAdapter. Uses "conversations" terminology. N participants. Redis pub/sub for real-time. Handles H2H (DMs) and has tasks/artifacts support.

ChatDatabaseAdapter is a facade over the same conversation tables — it creates conversations with a system-agent participant and stores session metadata (title, indexId, shareToken) in conversation_metadata.

**Goal**: Unify under a single conversation model where the interaction type (H2A, H2H, eventually A2A) determines behavior, not a separate code path. Key steps:

1. Merge ChatDatabaseAdapter into ConversationDatabaseAdapter (or create a unified adapter)
2. Merge ChatSessionService capabilities (graph invocation, SSE streaming, title generation) into ConversationService or a layered approach
3. Unify the controllers — either merge into ConversationController with chat-specific endpoints, or keep ChatController as a thin streaming layer that delegates to the unified service
4. Preserve all existing API routes for backward compatibility (frontend depends on both `/api/chat/*` and `/api/conversations/*`)
5. Update frontend contexts (AIChatContext, ConversationContext) to use unified backend — may be a follow-up PR
