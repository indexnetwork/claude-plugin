# Debug APIs Design

## Problem

When opportunities don't appear on the home page, there's no way to diagnose where the pipeline broke. The existing chat debug (bug icon) is frontend-only and doesn't cover the discovery/home pipeline.

## Solution

Three server-side debug endpoints behind a dev/admin gate, with frontend bug icons that fetch and copy the response to clipboard.

## Endpoints

### `GET /debug/intents/:id`

Per-intent pipeline trace. Returns:

```json
{
  "exportedAt": "ISO8601",
  "intent": {
    "id": "uuid",
    "text": "Looking for a React developer",
    "status": "active",
    "confidence": 0.85,
    "inferenceType": "explicit",
    "sourceType": "file",
    "hasEmbedding": true,
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  },
  "hydeDocuments": {
    "count": 3,
    "oldestGeneratedAt": "ISO8601",
    "newestGeneratedAt": "ISO8601"
  },
  "indexAssignments": [
    {
      "indexId": "uuid",
      "indexTitle": "AI Builders",
      "indexPrompt": "...",
      "autoAssign": true
    }
  ],
  "opportunities": {
    "total": 2,
    "byStatus": { "pending": 1, "expired": 1 },
    "items": [
      {
        "opportunityId": "uuid",
        "counterpartName": "Jane",
        "confidence": 0.72,
        "status": "pending",
        "createdAt": "ISO8601",
        "matchedViaIndex": "AI Builders"
      }
    ]
  },
  "diagnosis": {
    "hasEmbedding": true,
    "hasHydeDocuments": true,
    "isInAtLeastOneIndex": true,
    "hasOpportunities": true,
    "allOpportunitiesFilteredFromHome": true,
    "filterReasons": ["expired: 1"]
  }
}
```

### `GET /debug/home`

Home-level overview for the authenticated user. Returns:

```json
{
  "exportedAt": "ISO8601",
  "userId": "uuid",
  "intents": {
    "total": 12,
    "byStatus": { "active": 8, "archived": 4 },
    "withEmbeddings": 8,
    "withHydeDocuments": 6,
    "inAtLeastOneIndex": 5,
    "orphaned": 3
  },
  "indexes": [
    {
      "indexId": "uuid",
      "title": "AI Builders",
      "memberCount": 24,
      "userIntentsAssigned": 3
    }
  ],
  "opportunities": {
    "total": 15,
    "byStatus": { "pending": 2, "viewed": 3, "accepted": 5, "rejected": 3, "expired": 2 },
    "actionable": 2
  },
  "homeView": {
    "sectionsReturned": 1,
    "cardsReturned": 2,
    "filteredOut": {
      "notActionable": 8,
      "duplicateCounterpart": 3,
      "notVisible": 2
    },
    "cacheStatus": {
      "presenterCacheHits": 2,
      "categorizerCacheHit": true
    }
  },
  "diagnosis": {
    "hasActiveIntents": true,
    "intentsHaveEmbeddings": true,
    "intentsHaveHydeDocuments": false,
    "intentsAreIndexed": true,
    "hasOpportunities": true,
    "opportunitiesReachHome": true,
    "bottleneck": "3 intents missing HyDE documents"
  }
}
```

### `GET /debug/chat/:id`

Server-side chat debug (replaces current frontend-only assembly). Returns:

```json
{
  "sessionId": "uuid",
  "exportedAt": "ISO8601",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "turns": [
    {
      "messageIndex": 1,
      "graph": "agent_loop",
      "iterations": 3,
      "tools": [
        {
          "name": "search_contacts",
          "args": { "query": "..." },
          "resultSummary": "Found 5 contacts",
          "success": true,
          "steps": [{ "step": "Parsed query", "detail": "..." }]
        }
      ]
    }
  ]
}
```

## Dev/Admin Gate

Environment-based guard (`DebugGuard`):
- Enabled when `NODE_ENV === 'development'` OR `ENABLE_DEBUG_API === 'true'`
- Returns 404 when disabled (not 403, to avoid revealing endpoint existence)
- Applied alongside `AuthGuard` on all debug endpoints

## Frontend Changes

### `DebugCopyButton` shared component
- Renders Lucide `Bug` icon button (same style as existing chat debug)
- Props: `fetchPath: string`
- onClick: fetches the URL, copies JSON response to clipboard, shows green checkmark for 2s
- Handles loading state (spinner) and error state (red X)

### Placement
- **Library > Intents**: bug icon per intent row → calls `/debug/intents/:id`
- **Home page**: bug icon in header/toolbar → calls `/debug/home`
- **Chat**: refactor existing bug icon to use `DebugCopyButton` → calls `/debug/chat/:id`

### Chat cleanup
- Remove `debugMetaByTurn` state from `AIChatContext`
- Remove `debug_meta` SSE event handling
- Remove `handleCopyDebug` logic from `ChatContent.tsx`
- Backend can stop emitting `debug_meta` SSE events (chat streamer)

## Architecture

```
Frontend                          Backend
─────────                         ───────
DebugCopyButton ──fetch──→ AuthGuard + DebugGuard
  (Bug icon)                      │
  copy to clipboard ←─────────── DebugController
                                   ├── getIntentDebug(intentId, userId)
                                   ├── getHomeDebug(userId)
                                   └── getChatDebug(sessionId, userId)
                                        │
                                   Services / DB queries
                                   (read-only, no side effects)
```

## Files to Create/Modify

### New files
- `protocol/src/controllers/debug.controller.ts` — debug endpoints
- `protocol/src/guards/debug.guard.ts` — env-based gate
- `frontend/src/components/DebugCopyButton.tsx` — shared debug button

### Modified files
- `protocol/src/main.ts` — register DebugController
- `protocol/src/lib/protocol/streamers/chat.streamer.ts` — keep debug_meta emission for now (remove later)
- `frontend/src/components/ChatContent.tsx` — replace handleCopyDebug with DebugCopyButton
- `frontend/src/contexts/AIChatContext.tsx` — remove debugMetaByTurn (after chat endpoint works)
- Frontend intent list component — add DebugCopyButton per row
- Frontend home page component — add DebugCopyButton in header

## Non-goals
- No new database tables or schema changes
- No user-facing debug UI (just copy-to-clipboard)
- No real-time pipeline tracing (static snapshot only)
- No new dependencies
