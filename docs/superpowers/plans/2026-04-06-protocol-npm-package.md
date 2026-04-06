# Protocol NPM Package Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `protocol/src/lib/protocol/` to `packages/protocol/` and publish it as `@indexnetwork/protocol` on NPM so both the internal protocol app and external consumers can use it.

**Architecture:** The source moves wholesale to `packages/protocol/src/`. A new `index.ts` barrel exports everything the protocol app currently uses (graph factories, agents, support utilities, interfaces, types). The protocol app then imports from `@indexnetwork/protocol` like any other NPM package — no workspace reference. The `model.config.ts` gains a `ModelConfig` interface and a `configureProtocol()` function so consumers can inject credentials without environment variables.

**Tech Stack:** TypeScript (tsc), Bun workspaces, NPM registry, `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `zod`

---

> **Note on exports:** The design doc describes a "minimal" exports surface for external semver guarantees. In practice, the protocol app imports 40+ named exports (graph factories, agents, support utilities) from `lib/protocol` and all of these must be exported. All are exported from `index.ts` with a comment marking the recommended public API vs internals.

---

### Task 1: Create `packages/protocol/` scaffold

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`

- [ ] **Step 1: Create `packages/protocol/package.json`**

```json
{
  "name": "@indexnetwork/protocol",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "@langchain/core": "^1.1.17",
    "@langchain/langgraph": "^1.1.2",
    "@langchain/langgraph-checkpoint-postgres": "^1.0.0",
    "@langchain/openai": "^1.2.3",
    "@modelcontextprotocol/server": "^2.0.0-alpha.2",
    "dotenv": "^16.3.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/protocol/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "**/*.test.ts", "node_modules", "dist"]
}
```

- [ ] **Step 3: Add `packages/*` to root workspaces**

In `package.json` at the repo root, add a `"workspaces"` key:

```json
{
  "name": "index-monorepo",
  "private": true,
  "packageManager": "bun@1.2.20",
  "workspaces": ["packages/*"],
  ...
}
```

- [ ] **Step 4: Commit scaffold**

```bash
git add packages/protocol/package.json packages/protocol/tsconfig.json package.json
git commit -m "chore: scaffold packages/protocol workspace"
```

---

### Task 2: Move source files

**Files:**
- Move: `protocol/src/lib/protocol/` → `packages/protocol/src/`

The entire directory moves. All relative imports inside the lib (`from "../agents/..."`, `from "../interfaces/..."`, etc.) remain valid because the files move together.

- [ ] **Step 1: Move the source directory**

```bash
cp -r protocol/src/lib/protocol/. packages/protocol/src/
```

Verify the copy:
```bash
ls packages/protocol/src/
# Expected: agents/ docs/ graphs/ interfaces/ mcp/ states/ streamers/ support/ tools/ types/ README.md
```

- [ ] **Step 2: Verify no imports broke inside the package itself**

The internal relative imports (`from "../agents/chat.agent"`, `from "../interfaces/database.interface"`, etc.) all use paths relative to each file and will still resolve correctly after the move. Spot-check:

```bash
head -10 packages/protocol/src/graphs/chat.graph.ts
# Should show relative imports like: from "../agents/chat.agent"
# NOT absolute or lib/protocol paths
```

- [ ] **Step 3: Commit the source move**

```bash
git add packages/protocol/src/
git commit -m "feat(protocol-pkg): move lib source to packages/protocol/src"
```

---

### Task 3: Refactor `model.config.ts`

**Files:**
- Modify: `packages/protocol/src/agents/model.config.ts`

Replace the static `MODEL_CONFIG` const and `createModel` function with a version that accepts optional `ModelConfig`, and add a `configureProtocol()` function for module-level config so agents that call `createModel` internally pick it up without needing constructor injection.

- [ ] **Step 1: Replace `packages/protocol/src/agents/model.config.ts`**

```typescript
import { ChatOpenAI } from "@langchain/openai";

/** Settings that can be configured per agent. */
export interface ModelSettings {
  model: string;
  temperature?: number;
  maxTokens?: number;
  reasoning?: { effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'; exclude?: boolean };
}

/**
 * Runtime configuration for the protocol package.
 * Set once via configureProtocol() at application startup.
 * All fields fall back to environment variables if not provided.
 */
export interface ModelConfig {
  /** OpenRouter API key. Falls back to OPENROUTER_API_KEY env var. */
  apiKey?: string;
  /** OpenRouter base URL. Falls back to OPENROUTER_BASE_URL env var. */
  baseURL?: string;
  /** Override the chat agent model. Falls back to CHAT_MODEL env var. */
  chatModel?: string;
  /** Override the chat reasoning effort. Falls back to CHAT_REASONING_EFFORT env var. */
  chatReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

/** Module-level config set by configureProtocol(). Merged with per-call overrides. */
let _activeConfig: ModelConfig = {};

/**
 * Configure the protocol package with runtime credentials and settings.
 * Call once at application startup before any agents are used.
 * Falls back to environment variables for any field not provided.
 *
 * @param config - Runtime configuration overrides
 */
export function configureProtocol(config: ModelConfig): void {
  _activeConfig = config;
}

function getModelConfig(config?: ModelConfig) {
  const merged: ModelConfig = { ..._activeConfig, ...config };
  return {
    intentInferrer:       { model: "google/gemini-2.5-flash" },
    intentIndexer:        { model: "google/gemini-2.5-flash" },
    intentVerifier:       { model: "google/gemini-2.5-flash" },
    intentReconciler:     { model: "google/gemini-2.5-flash" },
    intentClarifier:      { model: "google/gemini-2.5-flash" },
    profileGenerator:     { model: "google/gemini-2.5-flash" },
    profileHydeGenerator: { model: "google/gemini-2.5-flash" },
    hydeGenerator:        { model: "google/gemini-2.5-flash" },
    lensInferrer:         { model: "google/gemini-2.5-flash" },
    opportunityEvaluator: { model: "google/gemini-2.5-flash" },
    opportunityPresenter: { model: "google/gemini-2.5-flash" },
    negotiationProposer:  { model: "google/gemini-2.5-flash" },
    negotiationResponder: { model: "google/gemini-2.5-flash" },
    homeCategorizer:      { model: "google/gemini-2.5-flash" },
    suggestionGenerator:  { model: "google/gemini-2.5-flash", temperature: 0.4, maxTokens: 512 },
    chatTitleGenerator:   { model: "google/gemini-2.5-flash", temperature: 0.3, maxTokens: 32 },
    negotiationInsights:  { model: "google/gemini-2.5-flash", temperature: 0.4, maxTokens: 512 },
    inviteGenerator:      { model: "google/gemini-2.5-flash", temperature: 0.3, maxTokens: 512 },
    chat: {
      model: merged.chatModel ?? process.env.CHAT_MODEL ?? "google/gemini-3-pro-preview",
      maxTokens: 8192,
      reasoning: {
        effort: (merged.chatReasoningEffort ?? process.env.CHAT_REASONING_EFFORT ?? "low") as NonNullable<ModelSettings["reasoning"]>["effort"],
        exclude: true,
      },
    },
  } as const;
}

/**
 * Returns the model name string for the given agent key.
 * @param agent - Key from MODEL_CONFIG identifying which agent's settings to use.
 * @param config - Optional runtime config overrides (merged with module-level config).
 */
export function getModelName(agent: keyof ReturnType<typeof getModelConfig>, config?: ModelConfig): string {
  return getModelConfig(config)[agent].model;
}

/**
 * Creates a ChatOpenAI instance configured for OpenRouter.
 * @param agent - Key identifying which agent's model settings to use.
 * @param config - Optional runtime config overrides (merged with module-level config).
 */
export function createModel(agent: keyof ReturnType<typeof getModelConfig>, config?: ModelConfig): ChatOpenAI {
  const merged: ModelConfig = { ..._activeConfig, ...config };
  const apiKey = merged.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(`createModel(${agent}): OPENROUTER_API_KEY is required. Pass via configureProtocol({ apiKey }) or set the OPENROUTER_API_KEY environment variable.`);
  }
  const cfg = getModelConfig(merged)[agent] as ModelSettings;
  return new ChatOpenAI({
    model: cfg.model,
    configuration: {
      baseURL: merged.baseURL ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey,
    },
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    ...(cfg.reasoning && { modelKwargs: { reasoning: cfg.reasoning } }),
  });
}
```

- [ ] **Step 2: Add `modelConfig?: ModelConfig` to `ToolContext` in `tool.helpers.ts`**

In `packages/protocol/src/tools/tool.helpers.ts`, add `modelConfig` to the `ToolContext` interface. Find the block that ends `ToolContext` and add before the closing `}`:

```typescript
  /** Optional runtime LLM config. Pass to override env vars for API key, model, etc. */
  modelConfig?: ModelConfig;
```

Also add the import at the top of `tool.helpers.ts`:

```typescript
import type { ModelConfig } from "../agents/model.config";
```

- [ ] **Step 3: Call `configureProtocol` in `createChatTools`**

In `packages/protocol/src/tools/index.ts`, add to the top of `createChatTools`:

```typescript
import { configureProtocol } from "../agents/model.config";

export async function createChatTools(
  deps: ToolContext,
  preResolvedContext?: ResolvedToolContext
) {
  // Apply model config so all agents created in this session use the right credentials.
  if (deps.modelConfig) {
    configureProtocol(deps.modelConfig);
  }
  // ... rest unchanged
```

- [ ] **Step 4: Commit the model.config refactor**

```bash
git add packages/protocol/src/agents/model.config.ts packages/protocol/src/tools/tool.helpers.ts packages/protocol/src/tools/index.ts
git commit -m "feat(protocol-pkg): add ModelConfig, configureProtocol, thread through ToolContext"
```

---

### Task 4: Create `packages/protocol/src/index.ts` barrel

**Files:**
- Create: `packages/protocol/src/index.ts`

This file is the single entry point for `@indexnetwork/protocol`. It exports everything the protocol app needs plus the public API surface.

- [ ] **Step 1: Create `packages/protocol/src/index.ts`**

```typescript
// ─── Public API (recommended for external consumers) ──────────────────────────

export { createChatTools, configureProtocol } from "./tools";
export type { ChatTools } from "./tools";
export type { ModelConfig } from "./agents/model.config";
export type {
  ToolContext,
  ResolvedToolContext,
  ToolDeps,
  ProtocolDeps,
  DefineTool,
  RawToolDefinition,
  ToolRegistry,
} from "./tools/tool.helpers";
export { ChatContextAccessError } from "./tools/tool.helpers";

// ─── Interfaces (implement these to wire up your infrastructure) ───────────────

export type * from "./interfaces/auth.interface";
export type * from "./interfaces/cache.interface";
export type * from "./interfaces/chat-session.interface";
export type * from "./interfaces/contact.interface";
export type * from "./interfaces/database.interface";
export type * from "./interfaces/embedder.interface";
export type * from "./interfaces/enrichment.interface";
export type * from "./interfaces/integration.interface";
export type * from "./interfaces/queue.interface";
export type * from "./interfaces/scraper.interface";
export type * from "./interfaces/storage.interface";

// ─── Graph factories (used by the protocol app; advanced use for external consumers) ──

export { ChatGraphFactory } from "./graphs/chat.graph";
export { HomeGraphFactory } from "./graphs/home.graph";
export { HydeGraphFactory } from "./graphs/hyde.graph";
export { IndexGraphFactory } from "./graphs/index.graph";
export { IndexMembershipGraphFactory } from "./graphs/index_membership.graph";
export { IntentGraphFactory } from "./graphs/intent.graph";
export { IntentIndexGraphFactory } from "./graphs/intent_index.graph";
export { MaintenanceGraphFactory } from "./graphs/maintenance.graph";
export type { MaintenanceGraphDatabase, MaintenanceGraphCache, MaintenanceGraphQueue } from "./graphs/maintenance.graph";
export { NegotiationGraphFactory, createDefaultNegotiationGraph } from "./graphs/negotiation.graph";
export { OpportunityGraphFactory } from "./graphs/opportunity.graph";
export { ProfileGraphFactory } from "./graphs/profile.graph";

// ─── Agents (used by the protocol app; advanced use for external consumers) ───

export { ChatTitleGenerator } from "./agents/chat.title.generator";
export { HydeGenerator } from "./agents/hyde.generator";
export { IntentIndexer } from "./agents/intent.indexer";
export { LensInferrer } from "./agents/lens.inferrer";
export { NegotiationInsightsGenerator } from "./agents/negotiation.insights.generator";
export type { NegotiationDigest } from "./agents/negotiation.insights.generator";
export { NegotiationProposer } from "./agents/negotiation.proposer";
export { NegotiationResponder } from "./agents/negotiation.responder";
export { OpportunityPresenter, gatherPresenterContext } from "./agents/opportunity.presenter";
export type { PresenterDatabase } from "./agents/opportunity.presenter";

// ─── Support utilities (used by the protocol app) ─────────────────────────────

export { canUserSeeOpportunity, isActionableForViewer, validateOpportunityActors } from "./support/opportunity.utils";
export { getPrimaryActionLabel } from "./support/opportunity.constants";
export { persistOpportunities } from "./support/opportunity.persist";
export { presentOpportunity } from "./support/opportunity.presentation";
export type { UserInfo } from "./support/opportunity.presentation";
export { stripUuids, stripIntroducerMentions } from "./support/opportunity.sanitize";

// ─── Tools (used by the protocol app) ────────────────────────────────────────

export { createToolRegistry } from "./tools/tool.registry";
export { resolveChatContext } from "./tools/tool.helpers";

// ─── MCP ──────────────────────────────────────────────────────────────────────

export { createMcpServer } from "./mcp/mcp.server";
export type { ScopedDepsFactory } from "./mcp/mcp.server";

// ─── States (for advanced graph consumers) ────────────────────────────────────

export type { UserNegotiationContext } from "./states/negotiation.state";

// ─── Streamers ────────────────────────────────────────────────────────────────

export { ChatStreamer, ResponseStreamer } from "./streamers";
```

- [ ] **Step 2: Commit the barrel**

```bash
git add packages/protocol/src/index.ts
git commit -m "feat(protocol-pkg): add index.ts barrel with full export surface"
```

---

### Task 5: Install packages and build

**Files:** none (tooling only)

- [ ] **Step 1: Install deps in `packages/protocol`**

```bash
cd packages/protocol && bun install
```

Expected: resolves `@langchain/*`, `zod`, etc.

- [ ] **Step 2: Build `packages/protocol`**

```bash
cd packages/protocol && bun run build
```

Expected: `dist/` directory created with `index.js`, `index.d.ts`, and all subdirectories.

If there are TypeScript errors, fix them before proceeding. Common issues:
- `export type *` syntax requires TypeScript 5+. If it errors, replace with explicit named type exports.
- `ChatContextAccessError` is a class, not a type — export it as a value: `export { ChatContextAccessError }` not `export type { ... }`.

- [ ] **Step 3: Verify the dist has the expected entry point**

```bash
ls packages/protocol/dist/
# Expected: index.js  index.d.ts  index.js.map  agents/  graphs/  interfaces/  ...

node -e "import('@indexnetwork/protocol').then(m => console.log(Object.keys(m).slice(0, 5)))" 2>/dev/null || echo "module not linked yet — ok"
```

- [ ] **Step 4: Commit the built dist**

```bash
git add packages/protocol/dist/
git commit -m "feat(protocol-pkg): initial build output"
```

> **Note:** In CI the dist is built fresh before publish. Committing it here is just for local verification. Add `packages/protocol/dist` to `.gitignore` after the initial verification if you prefer clean history.

---

### Task 6: Delete the old source from `protocol/src/lib/protocol/`

**Files:**
- Delete: `protocol/src/lib/protocol/` (entire directory)

- [ ] **Step 1: Delete the old directory**

```bash
rm -rf protocol/src/lib/protocol/
```

- [ ] **Step 2: Verify it's gone**

```bash
ls protocol/src/lib/
# Expected: drizzle/  log.ts  parallel/  (no protocol/ directory)
```

- [ ] **Step 3: Commit the deletion**

```bash
git add -A protocol/src/lib/protocol/
git commit -m "feat(protocol-pkg): remove lib/protocol (now in packages/protocol)"
```

---

### Task 7: Add `@indexnetwork/protocol` to `protocol/package.json`

**Files:**
- Modify: `protocol/package.json`

For now, use a `file:` reference to the local build so we can test locally before publishing to NPM.

- [ ] **Step 1: Add the dependency**

In `protocol/package.json`, add to `"dependencies"`:

```json
"@indexnetwork/protocol": "file:../packages/protocol"
```

- [ ] **Step 2: Install**

```bash
cd protocol && bun install
```

Expected: `@indexnetwork/protocol` appears in `protocol/node_modules/@indexnetwork/`.

- [ ] **Step 3: Verify the import resolves**

```bash
cd protocol && node -e "import('@indexnetwork/protocol').then(m => console.log('OK:', Object.keys(m).length, 'exports'))"
```

Expected: `OK: <N> exports` (some positive number).

---

### Task 8: Migrate imports in `protocol/src/`

**Files:**
- Modify: 26 files in `protocol/src/` that import from `../lib/protocol/...`

All imports from `lib/protocol` become imports from `@indexnetwork/protocol`. Since all exports are at the top level of the package, the import path simplifies to just the package name regardless of which subpath was previously used.

- [ ] **Step 1: Run automated replacement**

```bash
# Replace all lib/protocol import paths with @indexnetwork/protocol
find protocol/src -name "*.ts" | xargs sed -i \
  "s|from '[^']*lib/protocol[^']*'|from '@indexnetwork/protocol'|g"
```

- [ ] **Step 2: Verify the replacements look correct**

```bash
grep -r "lib/protocol" protocol/src/ --include="*.ts"
# Expected: no output (all replaced)

grep -r "@indexnetwork/protocol" protocol/src/ --include="*.ts" | head -10
# Expected: several files showing the new import
```

- [ ] **Step 3: Fix any duplicate imports**

The sed replacement may create multiple `import { ... } from '@indexnetwork/protocol'` statements in the same file. Consolidate them manually. Check which files have multiple:

```bash
grep -l "@indexnetwork/protocol" protocol/src/**/*.ts | xargs grep -c "@indexnetwork/protocol" | grep -v ":1$"
```

For each file with multiple occurrences, merge the import statements into one. Example — before:

```typescript
import { ChatGraphFactory } from '@indexnetwork/protocol';
import type { ChatGraphCompositeDatabase } from '@indexnetwork/protocol';
```

After:

```typescript
import { ChatGraphFactory } from '@indexnetwork/protocol';
import type { ChatGraphCompositeDatabase } from '@indexnetwork/protocol';
```

(These can stay separate — TypeScript handles `import` and `import type` separately fine. Only merge if the same kind is duplicated.)

- [ ] **Step 4: Update `protocol-init.ts` ProtocolDeps import**

`protocol/src/protocol-init.ts` imports `ProtocolDeps` from `lib/protocol/tools/tool.helpers`. Verify it now reads:

```typescript
import type { ProtocolDeps } from '@indexnetwork/protocol';
```

- [ ] **Step 5: Commit the import migration**

```bash
git add protocol/src/
git commit -m "feat(protocol-pkg): migrate all lib/protocol imports to @indexnetwork/protocol"
```

---

### Task 9: Fix TypeScript compilation in `protocol/`

**Files:**
- Modify: `protocol/tsconfig.json` (if needed)
- Modify: any files with type errors

- [ ] **Step 1: Run the TypeScript compiler**

```bash
cd protocol && bunx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 2: Fix errors**

Common errors and fixes:

**"Cannot find module '@indexnetwork/protocol'"**
Make sure `protocol/node_modules/@indexnetwork/protocol` exists. If not, re-run `bun install` in `protocol/`.

**"Module '@indexnetwork/protocol' has no exported member 'X'"**
The export is missing from `packages/protocol/src/index.ts`. Add it and rebuild:
```bash
# Add export to packages/protocol/src/index.ts, then:
cd packages/protocol && bun run build
cd ../protocol && bun install
```

**Type mismatch errors after consolidating imports**
These usually mean a named export from one subpath collides with another. Check the specific error and resolve by being more explicit about which types are imported.

- [ ] **Step 3: Run again until clean**

```bash
cd protocol && bunx tsc --noEmit
# Expected: no output (zero errors)
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(protocol-pkg): resolve TypeScript errors after import migration"
```

---

### Task 10: Run existing tests

**Files:** none (verification only)

- [ ] **Step 1: Run the lib's own unit tests**

The unit tests moved to `packages/protocol/src/`. Run them there:

```bash
cd packages/protocol && bun test src/ 2>&1 | tail -20
```

If tests fail because they import from paths that no longer exist, update the import paths within the test files to use relative imports (since they're inside the package now).

- [ ] **Step 2: Run the protocol app tests**

```bash
cd protocol && bun test tests/ 2>&1 | tail -20
```

- [ ] **Step 3: Fix any test import failures**

Test files in `protocol/src/` that previously imported from `lib/protocol` will have been migrated in Task 8. If any were missed:

```bash
grep -r "lib/protocol" protocol/src/ --include="*.spec.ts"
# Fix any remaining ones manually
```

- [ ] **Step 4: Commit test fixes**

```bash
git add -A
git commit -m "fix(protocol-pkg): update test imports after migration"
```

---

### Task 11: Publish `@indexnetwork/protocol@0.1.0`

**Files:**
- Modify: `protocol/package.json` (change `file:` ref to pinned version)

- [ ] **Step 1: Build a clean dist**

```bash
cd packages/protocol && rm -rf dist && bun run build
```

- [ ] **Step 2: Publish to NPM**

Requires `NPM_TOKEN` set in your environment or CI:

```bash
cd packages/protocol && npm publish --access public
```

Expected output ends with: `+ @indexnetwork/protocol@0.1.0`

- [ ] **Step 3: Switch `protocol/` to the published version**

In `protocol/package.json`, change:
```json
"@indexnetwork/protocol": "file:../packages/protocol"
```
to:
```json
"@indexnetwork/protocol": "0.1.0"
```

Then reinstall:
```bash
cd protocol && bun install
```

- [ ] **Step 4: Verify the protocol app still builds**

```bash
cd protocol && bunx tsc --noEmit && echo "Build OK"
```

- [ ] **Step 5: Create a git tag for the package release**

```bash
git tag protocol-v0.1.0 -m "release: @indexnetwork/protocol 0.1.0"
```

- [ ] **Step 6: Final commit**

```bash
git add protocol/package.json
git commit -m "chore: pin @indexnetwork/protocol to 0.1.0 published version"
```

---

### Task 12: Clean up and finish

**Files:**
- Modify: `CLAUDE.md` (add packages/ to monorepo structure)
- Modify: `docs/design/architecture-overview.md` (if it exists, note new package)

- [ ] **Step 1: Update `CLAUDE.md` monorepo structure**

In the monorepo structure section of `CLAUDE.md`, add `packages/` alongside `protocol/`, `frontend/`, `cli/`:

```markdown
index/
├── protocol/          # Backend API & Agent Engine (Bun, Express, TypeScript)
├── packages/
│   └── protocol/      # @indexnetwork/protocol NPM package (agent graphs, interfaces)
├── frontend/          # Vite + React Router v7 SPA with React 19
├── cli/               # CLI client (@indexnetwork/cli) — Bun, TypeScript
├── plugin/            # Claude plugin (skills-only, subtree → indexnetwork/claude-plugin)
├── docs/              # Project documentation (design/, domain/, guides/, specs/)
└── scripts/           # Worktree helpers, hooks, dev launcher
```

Also add a build note in the Protocol section:

```markdown
# Build @indexnetwork/protocol first (protocol/ depends on published version)
cd packages/protocol && bun run build && npm publish
```

- [ ] **Step 2: Delete the design spec (task complete)**

```bash
rm docs/superpowers/specs/2026-04-06-protocol-npm-package-design.md
```

- [ ] **Step 3: Final commit**

```bash
git add CLAUDE.md
git add -A docs/superpowers/specs/
git commit -m "docs: update CLAUDE.md for packages/ workspace and remove completed spec"
```

- [ ] **Step 4: Merge into dev**

Follow the standard finishing-a-development-branch skill. Push to both remotes:

```bash
git checkout dev
git merge feat/protocol-npm-package
git push upstream dev && git push origin dev
```

Then tag and publish the CLI if needed (it isn't affected here), clean up the worktree:

```bash
git worktree remove .worktrees/feat-protocol-npm-package
git branch -d feat/protocol-npm-package
```
