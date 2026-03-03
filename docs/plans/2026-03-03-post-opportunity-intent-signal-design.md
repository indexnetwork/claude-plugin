# Post-Opportunity Intent Signal Suggestion

**Date**: 2026-03-03
**Status**: Approved

## Problem

When a user runs a discovery query (e.g. "I'm looking for investors for my game project") and opportunities are found, the system surfaces relevant people — but never prompts the user to also broadcast their own need as a signal. Other users with matching interests cannot find them unless the user explicitly creates an intent.

## Goal

After showing discovery results, if the user doesn't have a related intent, the agent asks if they'd like to create a signal. If they agree, the agent proposes one via the standard `create_intent` proposal flow (inference → verification → `intent_proposal` card for the user to approve or skip).

## Non-goals

- No changes to `opportunity.graph.ts` or `opportunity.discover.ts`
- No auto-creation of intents (user must explicitly agree, then approve the proposal card)
- No changes to `chat.agent.ts`

## Flow

```
User: "I'm looking for investors for my game project"

→ Agent calls create_opportunities(searchQuery="investors for game project")
  → Opportunity graph runs discovery → 8 candidates found
  → Tool returns: { found: true, opportunities: [...], suggestIntentCreationForVisibility: true, suggestedIntentDescription: "looking for investors for my game project" }

→ Agent presents opportunity cards
→ Agent asks: "Would you also like to create a signal for this so investors can find you?"

User: "Yes"

→ Agent calls create_intent(description="looking for investors for my game project")
  → Intent graph runs inference + verification in propose mode
  → Returns intent_proposal code block

→ Agent includes intent_proposal block verbatim in response
→ User approves or skips via the interactive card
```

## Changes

### 1. `protocol/src/lib/protocol/tools/opportunity.tools.ts`

In the discovery success path (results found, `searchQuery` non-empty), append two fields to the `success(...)` return value:

```typescript
suggestIntentCreationForVisibility: true,
suggestedIntentDescription: searchQuery,
```

This signals to the agent that it should offer intent creation after presenting the opportunity cards.

### 2. `protocol/src/lib/protocol/agents/chat.prompt.ts`

Add a rule to the discovery pattern (Pattern 1) in the system prompt:

> When `create_opportunities` returns `suggestIntentCreationForVisibility: true`, after presenting the opportunity cards, ask the user if they'd like to create a signal so others can find them. If the user agrees, call `create_intent(description=suggestedIntentDescription)` and include the returned `intent_proposal` block verbatim. This follows the same proposal flow as explicit intent creation — the user approves or skips via the card.

## Why this approach

- Minimal scope: two small changes, no graph or agent loop changes
- Consistent UX: the proposal card is the same as explicit `create_intent` — no new UI or streaming events needed
- Agent-driven: the thinking model handles the conversational ask and the follow-through; the flag is just a hint
- Non-intrusive: the agent asks once; the user is in control of whether to create the signal
