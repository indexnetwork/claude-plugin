# Instrument lib/protocol with Performance Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `@Timed()` decorators to all agent public async methods and `timed()` wrappers to all graph node functions in `lib/protocol/`.

**Architecture:** Mechanical edits — each agent file gets an import + `@Timed()` above each target method. Each graph file gets an import + each node's body wrapped in `timed("GraphName.nodeName", async () => { ... })`.

**Tech Stack:** TypeScript decorators (`@Timed()`), `timed()` wrapper from `lib/performance`.

---

### Task 1: Intent agents — `@Timed()` decorators

**Files:**
- Modify: `protocol/src/lib/protocol/agents/intent.inferrer.ts`
- Modify: `protocol/src/lib/protocol/agents/intent.verifier.ts`
- Modify: `protocol/src/lib/protocol/agents/intent.reconciler.ts`
- Modify: `protocol/src/lib/protocol/agents/intent.indexer.ts`
- Modify: `protocol/src/lib/protocol/agents/intent.clarifier.ts`

**For each file:**

1. Add import after existing imports: `import { Timed } from "../../performance";`
2. Add `@Timed()` on the line before each target `async` method

**Specific methods:**

`intent.inferrer.ts`:
- Line 153: Add `@Timed()` before `public async invoke(...)`

`intent.verifier.ts`:
- Line 130: Add `@Timed()` before `public async invoke(...)`

`intent.reconciler.ts`:
- Line 150: Add `@Timed()` before `public async invoke(...)`

`intent.indexer.ts`:
- Line 113: Add `@Timed()` before `public async invoke(...)`
- Line 160: Add `@Timed()` before `public async evaluate(...)`

`intent.clarifier.ts`:
- Line 105: Add `@Timed()` before `public async invoke(...)`

**Commit:**
```bash
git add protocol/src/lib/protocol/agents/intent.*.ts
git commit -m "feat(performance): instrument intent agents with @Timed()"
```

---

### Task 2: Profile agents — `@Timed()` decorators

**Files:**
- Modify: `protocol/src/lib/protocol/agents/profile.generator.ts`
- Modify: `protocol/src/lib/protocol/agents/profile.hyde.generator.ts`
- Modify: `protocol/src/lib/protocol/agents/hyde.generator.ts`

**For each file:**

1. Add import: `import { Timed } from "../../performance";`
2. Add `@Timed()` before each target method

**Specific methods:**

`profile.generator.ts`:
- Line 67: Add `@Timed()` before `public async invoke(...)`

`profile.hyde.generator.ts`:
- Line 83: Add `@Timed()` before `public async invoke(...)`

`hyde.generator.ts`:
- Line 48: Add `@Timed()` before `async generate(...)`

**Commit:**
```bash
git add protocol/src/lib/protocol/agents/profile.generator.ts protocol/src/lib/protocol/agents/profile.hyde.generator.ts protocol/src/lib/protocol/agents/hyde.generator.ts
git commit -m "feat(performance): instrument profile/hyde agents with @Timed()"
```

---

### Task 3: Opportunity agents — `@Timed()` decorators

**Files:**
- Modify: `protocol/src/lib/protocol/agents/opportunity.evaluator.ts`
- Modify: `protocol/src/lib/protocol/agents/opportunity.presenter.ts`

**For each file:**

1. Add import: `import { Timed } from "../../performance";`
2. Add `@Timed()` before each target method

**Specific methods:**

`opportunity.evaluator.ts`:
- Line 252: Add `@Timed()` before `public async invoke(...)`
- Line 341: Add `@Timed()` before `public async invokeEntityBundle(...)`

`opportunity.presenter.ts`:
- Line 280: Add `@Timed()` before `public async present(...)`
- Line 334: Add `@Timed()` before `public async presentHomeCard(...)`
- Line 405: Add `@Timed()` before `public async presentBatch(...)`
- Line 425: Add `@Timed()` before `public async presentHomeCardBatch(...)`

**Commit:**
```bash
git add protocol/src/lib/protocol/agents/opportunity.*.ts
git commit -m "feat(performance): instrument opportunity agents with @Timed()"
```

---

### Task 4: Chat agents — `@Timed()` decorators

**Files:**
- Modify: `protocol/src/lib/protocol/agents/chat.agent.ts`
- Modify: `protocol/src/lib/protocol/agents/chat.title.generator.ts`
- Modify: `protocol/src/lib/protocol/agents/suggestion.generator.ts`
- Modify: `protocol/src/lib/protocol/agents/home.categorizer.ts`

**For each file:**

1. Add import: `import { Timed } from "../../performance";`
2. Add `@Timed()` before each target method

**Specific methods:**

`chat.agent.ts`:
- Line 189: Add `@Timed()` before `async runIteration(...)`
- Line 409: Add `@Timed()` before `async run(...)`
- Line 474: Add `@Timed()` before `async streamRun(...)`

`chat.title.generator.ts`:
- Line 42: Add `@Timed()` before `async invoke(...)`

`suggestion.generator.ts`:
- Line 66: Add `@Timed()` before `async generate(...)`

`home.categorizer.ts`:
- Line 131: Add `@Timed()` before `async categorize(...)`

**Commit:**
```bash
git add protocol/src/lib/protocol/agents/chat.agent.ts protocol/src/lib/protocol/agents/chat.title.generator.ts protocol/src/lib/protocol/agents/suggestion.generator.ts protocol/src/lib/protocol/agents/home.categorizer.ts
git commit -m "feat(performance): instrument chat/suggestion/home agents with @Timed()"
```

---

### Task 5: Intent & IntentIndex graphs — `timed()` wrapper

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/intent.graph.ts`
- Modify: `protocol/src/lib/protocol/graphs/intent_index.graph.ts`

**For each file:**

1. Add import: `import { timed } from "../../performance";`

**Wrapping pattern:** For each node, change:
```typescript
const nodeName = async (state: typeof XGraphState.State) => {
  // ... body ...
};
```
to:
```typescript
const nodeName = async (state: typeof XGraphState.State) => {
  return timed("GraphName.nodeName", async () => {
    // ... body ...
  });
};
```

**intent.graph.ts nodes (6):**
- Line 134: `prepNode` → wrap body with `timed("IntentGraph.prep", async () => { ... })`
- Line 171: `inferenceNode` → `timed("IntentGraph.inference", async () => { ... })`
- Line 209: `verificationNode` → `timed("IntentGraph.verification", async () => { ... })`
- Line 301: `reconciliationNode` → `timed("IntentGraph.reconciliation", async () => { ... })`
- Line 373: `executorNode` → `timed("IntentGraph.executor", async () => { ... })`
- Line 535: `queryNode` → `timed("IntentGraph.query", async () => { ... })`

**intent_index.graph.ts nodes (3):**
- Line 41: `assignNode` → `timed("IntentIndexGraph.assign", async () => { ... })`
- Line 182: `readNode` → `timed("IntentIndexGraph.read", async () => { ... })`
- Line 288: `unassignNode` → `timed("IntentIndexGraph.unassign", async () => { ... })`

**Commit:**
```bash
git add protocol/src/lib/protocol/graphs/intent.graph.ts protocol/src/lib/protocol/graphs/intent_index.graph.ts
git commit -m "feat(performance): instrument intent graphs with timed()"
```

---

### Task 6: Opportunity graph — `timed()` wrapper

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/opportunity.graph.ts`

1. Add import: `import { timed } from "../../performance";`

**13 nodes to wrap:**
- Line 111: `prepNode` → `timed("OpportunityGraph.prep", async () => { ... })` (NOTE: this node already has `withCallLogging` — wrap the entire node body including the `withCallLogging` call)
- Line 168: `scopeNode` → `timed("OpportunityGraph.scope", async () => { ... })`
- Line 226: `resolveNode` → `timed("OpportunityGraph.resolve", async () => { ... })`
- Line 294: `discoveryNode` → `timed("OpportunityGraph.discovery", async () => { ... })`
- Line 469: `evaluationNode` → `timed("OpportunityGraph.evaluation", async () => { ... })`
- Line 585: `rankingNode` → `timed("OpportunityGraph.ranking", async () => { ... })`
- Line 624: `introValidationNode` → `timed("OpportunityGraph.introValidation", async () => { ... })`
- Line 709: `introEvaluationNode` → `timed("OpportunityGraph.introEvaluation", async () => { ... })`
- Line 780: `persistNode` → `timed("OpportunityGraph.persist", async () => { ... })`
- Line 943: `readNode` → `timed("OpportunityGraph.read", async () => { ... })`
- Line 1064: `updateNode` → `timed("OpportunityGraph.update", async () => { ... })`
- Line 1109: `deleteNode` → `timed("OpportunityGraph.delete", async () => { ... })`
- Line 1147: `sendNode` → `timed("OpportunityGraph.send", async () => { ... })`

**Commit:**
```bash
git add protocol/src/lib/protocol/graphs/opportunity.graph.ts
git commit -m "feat(performance): instrument opportunity graph with timed()"
```

---

### Task 7: Profile & HyDE graphs — `timed()` wrapper

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/profile.graph.ts`
- Modify: `protocol/src/lib/protocol/graphs/hyde.graph.ts`

1. Add import to each: `import { timed } from "../../performance";`

**profile.graph.ts nodes (7):**
- Line 77: `checkStateNode` → `timed("ProfileGraph.checkState", async () => { ... })`
- Line 247: `scrapeNode` → `timed("ProfileGraph.scrape", async () => { ... })`
- Line 332: `autoGenerateNode` → `timed("ProfileGraph.autoGenerate", async () => { ... })`
- Line 437: `generateProfileNode` → `timed("ProfileGraph.generateProfile", async () => { ... })`
- Line 491: `embedSaveProfileNode` → `timed("ProfileGraph.embedSaveProfile", async () => { ... })`
- Line 552: `generateHydeNode` → `timed("ProfileGraph.generateHyde", async () => { ... })`
- Line 591: `embedSaveHydeNode` → `timed("ProfileGraph.embedSaveHyde", async () => { ... })`

**hyde.graph.ts nodes (4):**
- Line 48: `checkCacheNode` → `timed("HydeGraph.checkCache", async () => { ... })`
- Line 110: `generateMissingNode` → `timed("HydeGraph.generateMissing", async () => { ... })`
- Line 145: `embedNode` → `timed("HydeGraph.embed", async () => { ... })`
- Line 182: `cacheResultsNode` → `timed("HydeGraph.cacheResults", async () => { ... })`

**Commit:**
```bash
git add protocol/src/lib/protocol/graphs/profile.graph.ts protocol/src/lib/protocol/graphs/hyde.graph.ts
git commit -m "feat(performance): instrument profile and hyde graphs with timed()"
```

---

### Task 8: Remaining graphs — `timed()` wrapper

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/chat.graph.ts`
- Modify: `protocol/src/lib/protocol/graphs/home.graph.ts`
- Modify: `protocol/src/lib/protocol/graphs/index.graph.ts`
- Modify: `protocol/src/lib/protocol/graphs/index_membership.graph.ts`

1. Add import to each: `import { timed } from "../../performance";`

**chat.graph.ts nodes (1):**
- Line 191: `agentLoopNode` → NOTE: this node takes two params `(state, config)`. Wrap as: `timed("ChatGraph.agentLoop", async () => { ... })` — the `state` and `config` params are captured by closure.

**home.graph.ts nodes (4):**
- Line 190: `loadOpportunitiesNode` → `timed("HomeGraph.loadOpportunities", async () => { ... })`
- Line 235: `generateCardTextNode` → `timed("HomeGraph.generateCardText", async () => { ... })`
- Line 388: `categorizeDynamicallyNode` → `timed("HomeGraph.categorizeDynamically", async () => { ... })`
- Line 417: `normalizeAndSortNode` → `timed("HomeGraph.normalizeAndSort", async () => { ... })`

**index.graph.ts nodes (4):**
- Line 29: `readNode` → `timed("IndexGraph.read", async () => { ... })`
- Line 94: `createNode` → `timed("IndexGraph.create", async () => { ... })`
- Line 137: `updateNode` → `timed("IndexGraph.update", async () => { ... })`
- Line 169: `deleteNode` → `timed("IndexGraph.delete", async () => { ... })`

**index_membership.graph.ts nodes (3):**
- Line 28: `addMemberNode` → `timed("IndexMembershipGraph.addMember", async () => { ... })`
- Line 101: `listMembersNode` → `timed("IndexMembershipGraph.listMembers", async () => { ... })`
- Line 147: `removeMemberNode` → `timed("IndexMembershipGraph.removeMember", async () => { ... })`

**Commit:**
```bash
git add protocol/src/lib/protocol/graphs/chat.graph.ts protocol/src/lib/protocol/graphs/home.graph.ts protocol/src/lib/protocol/graphs/index.graph.ts protocol/src/lib/protocol/graphs/index_membership.graph.ts
git commit -m "feat(performance): instrument chat, home, index, and membership graphs with timed()"
```

---

### Task 9: Verify and commit design docs

**Step 1:** Run the performance library tests to ensure nothing is broken:
```bash
cd protocol && bun test src/lib/performance/performance.spec.ts
```
Expected: 9 tests pass.

**Step 2:** Commit design/plan docs:
```bash
git add docs/plans/2026-02-22-instrument-protocol-performance-design.md docs/plans/2026-02-22-instrument-protocol-performance-implementation.md
git commit -m "docs: add instrumentation design and implementation plan"
```

---

## Important Notes

- **Import path for agents:** `import { Timed } from "../../performance";` (agents are at `lib/protocol/agents/`, performance is at `lib/performance/`)
- **Import path for graphs:** `import { timed } from "../../performance";` (graphs are at `lib/protocol/graphs/`, performance is at `lib/performance/`)
- **The `timed()` wrapper captures the node's `state` param via closure.** The node signature stays the same — only the body is wrapped.
- **`opportunity.graph.ts` prepNode** already uses `withCallLogging`. Wrap the entire body including that call — `timed` tracks duration while `withCallLogging` tracks inputs/outputs/logging. They serve different purposes.
- **`chat.graph.ts` agentLoopNode** takes `(state, config)` — both are captured by closure inside the `timed` wrapper.
