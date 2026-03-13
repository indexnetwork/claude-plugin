# Centralize Model Configuration

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all agent model configuration into a single file, eliminate duplicated OpenRouter boilerplate across 15 agent files, and trim CLAUDE.md to under 40k characters.

**Architecture:** Create `model.config.ts` with per-agent model settings and a `createModel()` helper that returns a `ChatOpenAI` instance. Each agent replaces its inline `new ChatOpenAI({...})` with a call to `createModel("agentKey")`. Fix `AgentModelOptions.model` type to accept any string (currently restricted to two OpenAI models). Trim CLAUDE.md by removing outdated OpenRouter preset docs and condensing verbose sections.

**Tech Stack:** TypeScript, LangChain (`@langchain/openai`), Bun

---

## Chunk 1: Model Config and Helper

### Task 1: Create model.config.ts

**Files:**
- Create: `protocol/src/lib/protocol/agents/model.config.ts`

- [ ] **Step 1: Create model.config.ts with per-agent config and helper**

```typescript
import { ChatOpenAI } from "@langchain/openai";

/**
 * Per-agent model configuration.
 * Single source of truth for all LLM model settings across agents.
 */
export const MODEL_CONFIG = {
  intentInferrer:      { model: "google/gemini-2.5-flash" },
  intentIndexer:       { model: "google/gemini-2.5-flash" },
  intentVerifier:      { model: "google/gemini-2.5-flash" },
  intentReconciler:    { model: "google/gemini-2.5-flash" },
  intentClarifier:     { model: "google/gemini-2.5-flash" },
  profileGenerator:    { model: "google/gemini-2.5-flash" },
  profileHydeGenerator:{ model: "google/gemini-2.5-flash" },
  hydeGenerator:       { model: "google/gemini-2.5-flash" },
  lensInferrer:        { model: "google/gemini-2.5-flash" },
  opportunityEvaluator:{ model: "google/gemini-2.5-flash" },
  opportunityPresenter:{ model: "google/gemini-2.5-flash" },
  homeCategorizer:     { model: "google/gemini-2.5-flash" },
  suggestionGenerator: { model: "google/gemini-2.5-flash", temperature: 0.4, maxTokens: 512 },
  chatTitleGenerator:  { model: "google/gemini-2.5-flash", temperature: 0.3, maxTokens: 32 },
  chat:                { model: process.env.CHAT_MODEL ?? "google/gemini-3-pro-preview", maxTokens: 8192 },
} as const satisfies Record<string, ModelSettings>;

/** Settings that can be configured per agent. */
export interface ModelSettings {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Creates a ChatOpenAI instance configured for OpenRouter.
 * @param agent - Key from MODEL_CONFIG identifying which agent's settings to use.
 * @returns A ChatOpenAI instance ready for use (call .withStructuredOutput() as needed).
 */
export function createModel(agent: keyof typeof MODEL_CONFIG): ChatOpenAI {
  const config = MODEL_CONFIG[agent];
  return new ChatOpenAI({
    model: config.model,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/agents/model.config.ts
git commit -m "feat(agents): add centralized model config with per-agent settings"
```

### Task 2: Fix AgentModelOptions.model type

**Files:**
- Modify: `protocol/src/lib/langchain/langchain.ts:68`

- [ ] **Step 1: Widen the model type from union to string**

Change line 68:
```typescript
// Before:
model?: 'openai/gpt-4o' | 'openai/gpt-4o-mini';
// After:
model?: string;
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/langchain/langchain.ts
git commit -m "fix(langchain): widen AgentModelOptions.model type to string"
```

---

## Chunk 2: Refactor Agents (batch 1 — intent agents)

All intent agents follow the same pattern: replace module-level `new ChatOpenAI({...})` with `createModel("agentKey")`. Keep `.withStructuredOutput()` calls unchanged.

### Task 3: Refactor intent.inferrer.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/intent.inferrer.ts`

- [ ] **Step 1: Replace ChatOpenAI import and instantiation**

Remove:
```typescript
import { ChatOpenAI } from "@langchain/openai";
// ...
const model = new ChatOpenAI({
  model: 'google/gemini-2.5-flash',
  configuration: { baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY }
});
```

Add:
```typescript
import { createModel } from "./model.config";
// ...
const model = createModel("intentInferrer");
```

- [ ] **Step 2: Verify no other ChatOpenAI references remain in the file**

### Task 4: Refactor intent.indexer.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/intent.indexer.ts`

- [ ] **Step 1: Same pattern as Task 3**

Replace `import { ChatOpenAI }` and `new ChatOpenAI({...})` with:
```typescript
import { createModel } from "./model.config";
const model = createModel("intentIndexer");
```

### Task 5: Refactor intent.verifier.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/intent.verifier.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("intentVerifier");
```

### Task 6: Refactor intent.reconciler.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/intent.reconciler.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("intentReconciler");
```

### Task 7: Refactor intent.clarifier.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/intent.clarifier.ts`

- [ ] **Step 1: Replace factory function with createModel**

Remove the `createIntentClarifierChatModel()` function (lines 9-25) and replace usages with:
```typescript
import { createModel } from "./model.config";
// In constructor, replace:
//   const baseModel = createIntentClarifierChatModel();
// With:
const baseModel = createModel("intentClarifier");
```

- [ ] **Step 2: Commit all intent agents**

```bash
git add protocol/src/lib/protocol/agents/intent.inferrer.ts \
      protocol/src/lib/protocol/agents/intent.indexer.ts \
      protocol/src/lib/protocol/agents/intent.verifier.ts \
      protocol/src/lib/protocol/agents/intent.reconciler.ts \
      protocol/src/lib/protocol/agents/intent.clarifier.ts
git commit -m "refactor(agents): use centralized model config for intent agents"
```

---

## Chunk 3: Refactor Agents (batch 2 — profile, hyde, lens, opportunity)

### Task 8: Refactor profile.generator.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/profile.generator.ts`

- [ ] **Step 1: Replace ChatOpenAI with createModel**

```typescript
import { createModel } from "./model.config";
const model = createModel("profileGenerator");
```

### Task 9: Refactor profile.hyde.generator.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/profile.hyde.generator.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("profileHydeGenerator");
```

### Task 10: Refactor hyde.generator.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/hyde.generator.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("hydeGenerator");
```

### Task 11: Refactor lens.inferrer.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/lens.inferrer.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("lensInferrer");
```

### Task 12: Refactor opportunity.evaluator.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/opportunity.evaluator.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("opportunityEvaluator");
```

### Task 13: Refactor opportunity.presenter.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/opportunity.presenter.ts`

- [ ] **Step 1: Same pattern**

```typescript
import { createModel } from "./model.config";
const model = createModel("opportunityPresenter");
```

- [ ] **Step 2: Commit batch 2**

```bash
git add protocol/src/lib/protocol/agents/profile.generator.ts \
      protocol/src/lib/protocol/agents/profile.hyde.generator.ts \
      protocol/src/lib/protocol/agents/hyde.generator.ts \
      protocol/src/lib/protocol/agents/lens.inferrer.ts \
      protocol/src/lib/protocol/agents/opportunity.evaluator.ts \
      protocol/src/lib/protocol/agents/opportunity.presenter.ts
git commit -m "refactor(agents): use centralized model config for profile, hyde, lens, opportunity agents"
```

---

## Chunk 4: Refactor Agents (batch 3 — chat, suggestions, home)

### Task 14: Refactor suggestion.generator.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/suggestion.generator.ts`

- [ ] **Step 1: Replace constructor-local ChatOpenAI with createModel**

In constructor, replace:
```typescript
const llm = new ChatOpenAI({
  model: "google/gemini-2.5-flash",
  configuration: {
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  },
  temperature: 0.4,
  maxTokens: 512,
});
```

With:
```typescript
import { createModel } from "./model.config";
// ...
const llm = createModel("suggestionGenerator");
```

### Task 15: Refactor home.categorizer.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/home.categorizer.ts`

- [ ] **Step 1: Same pattern**

In constructor, replace `new ChatOpenAI({...})` with:
```typescript
import { createModel } from "./model.config";
// ...
const llm = createModel("homeCategorizer");
```

### Task 16: Refactor chat.title.generator.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/chat.title.generator.ts`

- [ ] **Step 1: Replace ChatOpenAI with createModel**

In constructor, replace `new ChatOpenAI({...})` with:
```typescript
import { createModel } from "./model.config";
// ...
this.model = createModel("chatTitleGenerator");
```

### Task 17: Refactor chat.agent.ts

**Files:**
- Modify: `protocol/src/lib/protocol/agents/chat.agent.ts`

- [ ] **Step 1: Replace ChatOpenAI instantiation with createModel + reasoning config**

The chat agent has special reasoning config. Replace the `new ChatOpenAI({...})` block with:
```typescript
import { createModel } from "./model.config";
// ...
const reasoningEffort = process.env.CHAT_REASONING_EFFORT ?? "low";
this.model = new ChatOpenAI({
  .../* use createModel's config but add reasoning */
});
```

**Note:** The chat agent needs `modelKwargs.reasoning` which `createModel()` doesn't support. Two approaches:
1. Add a `reasoningEffort` option to `ModelSettings` and handle it in `createModel()`.
2. Use `createModel("chat")` for the base config, then reconstruct with reasoning kwargs.

**Chosen approach:** Extend `ModelSettings` to support an optional `reasoning` field and handle it in `createModel()`:

In `model.config.ts`, add to `ModelSettings`:
```typescript
export interface ModelSettings {
  model: string;
  temperature?: number;
  maxTokens?: number;
  reasoning?: { effort?: string; exclude?: boolean };
}
```

Update `chat` entry in `MODEL_CONFIG`:
```typescript
chat: {
  model: process.env.CHAT_MODEL ?? "google/gemini-3-pro-preview",
  maxTokens: 8192,
  reasoning: { effort: process.env.CHAT_REASONING_EFFORT ?? "low", exclude: true },
},
```

Update `createModel()` to pass `modelKwargs`:
```typescript
export function createModel(agent: keyof typeof MODEL_CONFIG): ChatOpenAI {
  const config = MODEL_CONFIG[agent];
  return new ChatOpenAI({
    model: config.model,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    ...(config.reasoning && { modelKwargs: { reasoning: config.reasoning } }),
  });
}
```

Then in `chat.agent.ts`:
```typescript
import { createModel } from "./model.config";
// Replace the ChatOpenAI instantiation with:
this.model = createModel("chat");
```

- [ ] **Step 2: Commit batch 3**

```bash
git add protocol/src/lib/protocol/agents/suggestion.generator.ts \
      protocol/src/lib/protocol/agents/home.categorizer.ts \
      protocol/src/lib/protocol/agents/chat.title.generator.ts \
      protocol/src/lib/protocol/agents/chat.agent.ts \
      protocol/src/lib/protocol/agents/model.config.ts
git commit -m "refactor(agents): use centralized model config for chat, suggestion, home agents"
```

---

## Chunk 5: Verify and Clean Up

### Task 18: Verify no remaining direct ChatOpenAI in agents

- [ ] **Step 1: Search for leftover ChatOpenAI imports in agent files**

Run: `grep -r "new ChatOpenAI" protocol/src/lib/protocol/agents/`
Expected: No matches (all replaced with `createModel()`)

Run: `grep -r "from \"@langchain/openai\"" protocol/src/lib/protocol/agents/`
Expected: Only in `model.config.ts`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd protocol && bunx tsc --noEmit`
Expected: No errors related to model config changes

- [ ] **Step 3: Remove unused ChatOpenAI import from each agent file if still present**

After replacing `new ChatOpenAI(...)`, the `import { ChatOpenAI }` line should also be removed from each agent file (unless it's used elsewhere in the file for type annotations).

- [ ] **Step 4: Commit cleanup if needed**

```bash
git add -A protocol/src/lib/protocol/agents/
git commit -m "chore(agents): remove unused ChatOpenAI imports"
```

---

## Chunk 6: Trim CLAUDE.md

### Task 19: Remove outdated OpenRouter preset documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the OpenRouter Configuration section**

Find the "### OpenRouter Configuration" section (describes presets like `intent-inferrer`, `vibe-checker`, etc.) and replace with:

```markdown
### OpenRouter Configuration

The protocol uses OpenRouter as the LLM provider. Model settings per agent are centralized in `protocol/src/lib/protocol/agents/model.config.ts`.

**Environment Variables**:
- `OPENROUTER_API_KEY` - Required
- `OPENROUTER_BASE_URL` - Optional (defaults to `https://openrouter.ai/api/v1`)
- `CHAT_MODEL` - Override chat agent model (defaults to `google/gemini-3-pro-preview`)
- `CHAT_REASONING_EFFORT` - Chat reasoning budget (`minimal|low|medium|high`, defaults to `low`)
```

### Task 20: Condense verbose sections to reach <38k chars

**Files:**
- Modify: `CLAUDE.md`

Target sections to condense:
1. **Bun Test Standards** — reduce detailed bullet list to a compact checklist
2. **Agent/Service/Controller code style subsections** — replace verbose explanations with brief rules + template file references
3. **"Why migrations get out of sync"** — reduce to 2-3 line summary
4. **Protocol Environment Variables** — remove empty placeholder comments
5. **Worktrees section** — condense the explanation paragraph

- [ ] **Step 1: Condense each section** (see specific edits below, applied during implementation)

- [ ] **Step 2: Verify character count**

Run: `wc -c CLAUDE.md`
Expected: Under 38,000 characters

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: trim CLAUDE.md to under 40k chars, update OpenRouter docs"
```
