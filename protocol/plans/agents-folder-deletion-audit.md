# Agent Folder Deletion Audit

> **Status**: READY FOR DELETION  
> **Created**: 2026-02-06  
> **Purpose**: Track what's being deleted from `src/agents/` and what still needs to be migrated

## Executive Summary

The `src/agents/` folder contains legacy agent implementations that have been superseded by the new protocol-based architecture in `src/lib/protocol/agents/`. This document audits what will be deleted and identifies any remaining dependencies that need resolution.

---

## Migration Status Overview

### ✅ Already Migrated to `lib/protocol/agents/`

These agents have been migrated and the old versions can be deleted:

| Old Path | New Path | Status |
|----------|----------|--------|
| `src/agents/profile/profile.generator.ts` | `src/lib/protocol/agents/profile/profile.generator.ts` | ✅ Migrated |
| `src/agents/profile/hyde/hyde.generator.ts` | `src/lib/protocol/agents/profile/hyde/hyde.generator.ts` | ✅ Migrated |
| `src/agents/intent/inferrer/explicit/explicit.inferrer.ts` | `src/lib/protocol/agents/intent/inferrer/explicit.inferrer.ts` | ✅ Migrated |
| `src/agents/intent/indexer/intent.indexer.ts` | `src/lib/protocol/agents/index/intent.indexer.ts` | ✅ Migrated |
| `src/agents/opportunity/opportunity.evaluator.ts` | `src/lib/protocol/agents/opportunity/opportunity.evaluator.ts` | ✅ Migrated |

### ⚠️ Still Referenced by Legacy Code

These old agent imports are still used and need to be updated before deletion:

| File | Old Import | Action Required |
|------|-----------|-----------------|
| `src/services/stake.service.ts` | `../agents/intent/stake/*` | **DEPRECATE** - Stakes are being replaced by opportunities |
| `src/services/intent.service.ts` | `../agents/core/intent_summarizer` | **MIGRATE** - Move to protocol or use direct LLM |
| `src/services/profile.service.ts` | `../agents/intent/manager/intent.manager.types` | **MIGRATE** - Move types to protocol interfaces |
| `src/lib/synthesis.ts` | `../agents/external/vibe_checker`, `../agents/intent/stake/intro` | **DEPRECATE** - Part of stakes system |
| `src/index.ts` | `./agents/context_brokers/connector`, `./agents/playground/server/registry` | **EVALUATE** - Context brokers + playground |
| `src/queues/intent.queue.ts` | `../agents/intent/inferrer/explicit/explicit.inferrer` | **UPDATE** - Change to `lib/protocol/agents/intent/inferrer` |
| `src/jobs/opportunity.job.ts` | `../lib/protocol/agents/opportunity/notification.agent` | ✅ Already using protocol path |

---

## Detailed Component Analysis

### 1. Profile & HyDE Agents ✅

**Status**: Successfully migrated to protocol

**Old Location**: `src/agents/profile/`
**New Location**: `src/lib/protocol/agents/profile/`

**Still Using Old Imports**:
- `src/services/profile.service.ts` - Lines 2-4
- `src/lib/protocol/interfaces/database.interface.ts` - Line 1

**Action**: Update imports to use `src/lib/protocol/agents/profile/`

---

### 2. Intent Agents (Partial Migration)

#### ✅ Migrated:
- **ExplicitIntentInferrer**: `lib/protocol/agents/intent/inferrer/explicit.inferrer.ts`
- **IntentIndexer**: `lib/protocol/agents/index/intent.indexer.ts`
- **SemanticVerifier**: `lib/protocol/agents/intent/verifier/semantic.verifier.ts`
- **IntentReconciler**: `lib/protocol/agents/intent/reconciler/intent.reconciler.ts`

#### ❌ Not Migrated (Legacy):

| Agent | Location | Purpose | Action |
|-------|----------|---------|--------|
| **IntentManager** | `src/agents/intent/manager/` | Orchestrates intent lifecycle | **MIGRATE** - Types used in services |
| **IntentRefiner** | `src/agents/intent/refiner/` | Refines intent descriptions | **EVALUATE** - Is this still needed? |
| **IntentSuggester** | `src/agents/intent/suggester/` | Suggests related intents | **EVALUATE** - Is this still needed? |
| **IntentAuditor** | `src/agents/intent/auditor/` | Audits intent freshness | **EVALUATE** - Replace with cron? |
| **ImplicitInferrer** | `src/agents/intent/inferrer/implicit/` | Infers intents from implicit signals | **EVALUATE** - Still needed? |
| **TagGenerator** | `src/agents/intent/tag/` | Generates tags for intents | **EVALUATE** - Is this used? |
| **Evaluators** (Semantic, Syntactic, Pragmatic) | `src/agents/intent/evaluator/` | Intent quality evaluation | **DEPRECATED** - Replaced by verifier |

---

### 3. Stakes System (Being Deprecated) ❌

**Status**: Entire stakes system is being replaced by opportunities

**Location**: `src/agents/intent/stake/`

**Components**:
- `StakeEvaluator` - Evaluates stake quality
- `SynthesisGenerator` - Generates synthesis for stakes
- `IntroGenerator` / `IntroMaker` - Generates introductions

**Currently Used By**:
- `src/services/stake.service.ts` (lines 75-77)
- `src/lib/synthesis.ts` (line 5)

**Action**: 
- **DELETE** entire stakes folder
- **REMOVE** `stake.service.ts`
- **REMOVE** `synthesis.ts` 
- Stakes are replaced by the new opportunity system

---

### 4. Opportunity Agents ✅

**Status**: Migrated to protocol

**Old**: `src/agents/opportunity/opportunity.evaluator.ts`
**New**: `src/lib/protocol/agents/opportunity/opportunity.evaluator.ts`

**New Addition**: `notification.agent.ts` (only in new location)

**Still Using Old Imports**:
- `src/services/opportunity.service.ts` (line 10)
- `src/jobs/opportunity.job.spec.ts` (lines 13-14)

**Action**: Update imports to protocol path

---

### 5. Core Utilities (Need Migration)

**Location**: `src/agents/core/`

| Utility | Purpose | Usage | Action |
|---------|---------|-------|--------|
| `intent_summarizer` | Summarizes intents | `src/services/intent.service.ts`, `src/services/opportunity.service.ts`, `src/lib/intent-service.ts` | **MIGRATE** to protocol or adapter |
| `intent_freshness_auditor` | Audits intent staleness | Not found in grep results | **EVALUATE** - Unused? |
| `intent_indexer` | ✅ Migrated to `lib/protocol/agents/index/` | N/A | N/A |
| `intent_inferrer` | Legacy wrapper? | Not found in grep results | **DELETE** if unused |
| `intent_tag_suggester` | Suggests tags | Not found in grep results | **EVALUATE** - Unused? |

**Action**: 
- Migrate `intent_summarizer` to protocol or create adapter
- Evaluate if auditor/tag suggester are still needed

---

### 6. External Integrations

**Location**: `src/agents/external/`

| Integration | Purpose | Usage | Action |
|-------------|---------|-------|--------|
| `vibe_checker` | Generates synthesis/vibes | `src/lib/synthesis.ts` (line 4) | **DEPRECATE** with stakes system |
| `intro_maker` | Generates intros | `src/lib/synthesis.ts` (line 5) | **DEPRECATE** with stakes system |

**Action**: Delete with stakes system

---

### 7. Context Brokers

**Location**: `src/agents/context_brokers/`

**Components**:
- `base.ts` - Base broker class
- `connector.ts` - Broker connector/registry
- `semantic_relevancy/` - Semantic relevancy broker

**Usage**: `src/index.ts` (line 8) - `initializeBrokers()`

**Status**: **EVALUATE** - Are context brokers still used?

**Action**: 
- If brokers are still active, keep and document
- If deprecated, remove from `index.ts` and delete

---

### 8. Playground (Development Tool)

**Location**: `src/agents/playground/`

**Components**:
- Full React/Vite app for testing agents
- Server registry for agent testing
- UI components for each agent type

**Usage**: 
- `src/index.ts` (lines 21-22) - Agent playground routes
- `/api/agent-playground/agents`
- `/api/agent-playground/run`

**Status**: Development/debugging tool

**Action**: 
- **EVALUATE** - Is this still used in development?
- Consider moving to separate repo or tools folder
- If keeping, update to use new protocol agents

---

### 9. Common Types

**Location**: `src/agents/common/types.ts`

**Exports**:
- `VectorSearchResult`
- `VectorStoreOption`
- `Embedder` interface

**Usage**: Widely used across services

**Action**: **MIGRATE** to `src/lib/protocol/interfaces/` before deletion

---

## Deletion Plan

### Phase 1: Update Imports (Safe Changes)

Update these files to use the new protocol agent paths:

```typescript
// Files to update:
- src/lib/protocol/interfaces/database.interface.ts
- src/services/profile.service.ts
- src/services/opportunity.service.ts
- src/jobs/opportunity.job.spec.ts
- src/queues/intent.queue.ts
- src/lib/protocol/graphs/intent/intent.graph.ts (if any old imports remain)
```

**Action**: Change all imports from `../agents/*` to `../lib/protocol/agents/*`

---

### Phase 2: Migrate Common Types & Utilities

Before deletion, migrate these to protocol:

1. **Common Types** (`src/agents/common/types.ts`)
   - Move to `src/lib/protocol/interfaces/`
   - Update all imports

2. **Intent Summarizer** (`src/agents/core/intent_summarizer/`)
   - Move to protocol agents or create adapter
   - Update services that use it

3. **IntentManager Types** (`src/agents/intent/manager/intent.manager.types.ts`)
   - Move `UserMemoryProfile` type to protocol interfaces
   - Update imports in `profile.service.ts`

---

### Phase 3: Deprecate Stakes System

**Files to Delete**:
- `src/agents/intent/stake/` (entire folder)
- `src/services/stake.service.ts`
- `src/lib/synthesis.ts`
- Routes in `src/index.ts` related to stakes/synthesis

**Database**: 
- `intent_stakes` table will be removed (already deprecated per migration 0018)

---

### Phase 4: Evaluate & Decide

Review these components with team:

1. **Context Brokers** - Still needed? If yes, document architecture
2. **Agent Playground** - Move to separate repo or keep?
3. **Legacy Agents** (Refiner, Suggester, Auditor) - Still used?
4. **ImplicitInferrer** - Replace or keep?

---

### Phase 5: Delete `src/agents/`

After phases 1-4 are complete:

```bash
# Backup first (just in case)
git checkout -b backup/agents-folder
git add protocol/src/agents/
git commit -m "backup: Archive src/agents/ before deletion"
git push origin backup/agents-folder

# Then on main branch
git checkout main
git rm -rf protocol/src/agents/
git commit -m "refactor: Remove legacy src/agents/ folder

All agents have been migrated to src/lib/protocol/agents/
Stakes system has been deprecated in favor of opportunities
See plans/agents-folder-deletion-audit.md for details"
```

---

## Required Migrations Before Deletion

### 1. Update Imports in These Files

```typescript
// src/lib/protocol/interfaces/database.interface.ts
- import { ProfileDocument } from '../agents/profile/profile.generator';
+ import { ProfileDocument } from '../agents/profile/profile.generator';

// src/services/profile.service.ts
- import { HydeGeneratorAgent } from '../agents/profile/hyde/hyde.generator';
- import { ProfileGenerator } from '../agents/profile/profile.generator';
+ import { HydeGenerator } from '../lib/protocol/agents/profile/hyde/hyde.generator';
+ import { ProfileGenerator } from '../lib/protocol/agents/profile/profile.generator';

// src/services/opportunity.service.ts
- import { OpportunityEvaluator } from '../agents/opportunity/opportunity.evaluator';
+ import { OpportunityEvaluator } from '../lib/protocol/agents/opportunity/opportunity.evaluator';

// src/queues/intent.queue.ts
- import { ExplicitIntentInferrer } from '../agents/intent/inferrer/explicit/explicit.inferrer';
+ import { ExplicitIntentInferrer } from '../lib/protocol/agents/intent/inferrer/explicit.inferrer';
```

### 2. Migrate Common Types

Create `src/lib/protocol/interfaces/embedder.interface.ts`:

```typescript
export interface Embedder {
  generate(text: string): Promise<number[]>;
  generateMultiple(texts: string[]): Promise<number[][]>;
}

export interface VectorSearchResult {
  id: string;
  similarity: number;
  metadata?: Record<string, any>;
}

export type VectorStoreOption = 'pgvector' | 'pinecone' | 'in-memory';
```

### 3. Migrate Intent Summarizer

Options:
- Move to `src/lib/protocol/agents/intent/summarizer.ts`
- Or create `src/adapters/summarizer.adapter.ts` using protocol interfaces

### 4. Remove Stakes References

Delete or update:
- `src/services/stake.service.ts` - DELETE
- `src/lib/synthesis.ts` - DELETE
- Routes in `src/index.ts` - Remove `/api/stakes/*`, `/api/synthesis/*`

---

## Post-Deletion Verification

After deletion, run these checks:

```bash
# 1. Check for any remaining imports
cd protocol
grep -r "from.*agents/" src/ --exclude-dir=lib/protocol/agents

# 2. TypeScript compilation
bun run typecheck

# 3. Run tests
bun test

# 4. Check for broken routes
grep -r "agents" src/index.ts src/routes/
```

---

## Questions for Team

1. **Context Brokers**: Are these still active? The `initializeBrokers()` is called in `index.ts` but unclear if it's used.

2. **Agent Playground**: Do we still use this for development? Should it move to a separate repo?

3. **Implicit Intent Inference**: Is this feature still needed or replaced by other mechanisms?

4. **Intent Auditor/Freshness**: Is this handled by cron jobs now or still needed?

5. **Intent Refiner/Suggester**: Are these features still in the product?

---

## Migration Timeline

| Phase | Tasks | Estimated Time | Blocker? |
|-------|-------|----------------|----------|
| Phase 1 | Update imports | 1-2 hours | No |
| Phase 2 | Migrate types & utils | 2-3 hours | No |
| Phase 3 | Remove stakes system | 1-2 hours | No |
| Phase 4 | Team decisions | 1 meeting | Yes - need input |
| Phase 5 | Delete folder | 30 minutes | Phases 1-4 complete |

**Total**: 1-2 days + team meeting

---

## Success Criteria

- [ ] All imports updated to use `lib/protocol/agents/`
- [ ] Common types migrated to protocol interfaces
- [ ] Intent summarizer migrated or adapted
- [ ] Stakes system fully removed
- [ ] Team decisions made on brokers/playground/legacy agents
- [ ] TypeScript compiles with no errors
- [ ] All tests pass
- [ ] No references to old `src/agents/` path remain
- [ ] Documentation updated (CLAUDE.md, README.md)

---

## Rollback Plan

If issues arise after deletion:

```bash
# Restore from backup branch
git checkout backup/agents-folder
git checkout -b restore-agents
git cherry-pick <commit-hash>  # Pick the deletion commit
git revert HEAD                # Revert the deletion
git checkout main
git merge restore-agents
```

Or restore specific files:

```bash
git checkout backup/agents-folder -- protocol/src/agents/path/to/file.ts
```

---

## Notes

- **Intent stakes** are already deprecated (migration 0018 shows opportunity redesign)
- **HyDE system** has been migrated and is working in the new location
- **Profile & Opportunity** agents are confirmed working in protocol
- Most of the old agents are either migrated or deprecated
- Main work is updating import paths and removing stakes system
