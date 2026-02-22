# Instrument lib/protocol with Performance Tracking

## Overview

Apply the performance tracking library (`src/lib/performance/`) to all agents and graph nodes in `src/lib/protocol/`. Agents get the `@Timed()` decorator on public async methods. Graph node functions get the `timed()` wrapper.

## Agents — `@Timed()` Decorator

22 methods across 14 agent files:

| Agent | File | Methods |
|---|---|---|
| ChatAgent | chat.agent.ts | run, streamRun, runIteration |
| ChatTitleGenerator | chat.title.generator.ts | invoke |
| HomeCategorizerAgent | home.categorizer.ts | categorize |
| HydeGenerator | hyde.generator.ts | generate |
| IntentClarifier | intent.clarifier.ts | invoke |
| IntentIndexer | intent.indexer.ts | invoke, evaluate |
| ExplicitIntentInferrer | intent.inferrer.ts | invoke |
| IntentReconciler | intent.reconciler.ts | invoke |
| SemanticVerifier | intent.verifier.ts | invoke |
| ProfileGenerator | profile.generator.ts | invoke |
| HydeGenerator (profile) | profile.hyde.generator.ts | invoke |
| SuggestionGenerator | suggestion.generator.ts | generate |
| OpportunityEvaluator | opportunity.evaluator.ts | invoke, invokeEntityBundle |
| OpportunityPresenter | opportunity.presenter.ts | present, presentHomeCard, presentBatch, presentHomeCardBatch |

Each file gets `import { Timed } from "../../performance"` (relative path varies) and `@Timed()` above each listed method.

## Graphs — `timed()` Wrapper

~48 node functions across 9 graph files. Each node assignment wrapped as `timed("GraphName.nodeName", () => ...)`.

| Graph Factory | File | Nodes |
|---|---|---|
| ChatGraphFactory | chat.graph.ts | agentLoopNode |
| HomeGraphFactory | home.graph.ts | loadOpportunitiesNode, generateCardTextNode, categorizeDynamicallyNode, normalizeAndSortNode |
| HydeGraphFactory | hyde.graph.ts | checkCacheNode, generateMissingNode, embedNode, cacheResultsNode |
| IndexGraphFactory | index.graph.ts | readNode, createNode, updateNode, deleteNode |
| IndexMembershipGraphFactory | index_membership.graph.ts | addMemberNode, listMembersNode, removeMemberNode |
| IntentGraphFactory | intent.graph.ts | prepNode, inferenceNode, verificationNode, reconciliationNode, executorNode, queryNode |
| IntentIndexGraphFactory | intent_index.graph.ts | assignNode, readNode, unassignNode |
| OpportunityGraphFactory | opportunity.graph.ts | prepNode, scopeNode, resolveNode, discoveryNode, evaluationNode, rankingNode, introValidationNode, introEvaluationNode, persistNode, readNode, updateNode, deleteNode, sendNode |
| ProfileGraphFactory | profile.graph.ts | checkStateNode, scrapeNode, autoGenerateNode, generateProfileNode, embedSaveProfileNode, generateHydeNode, embedSaveHydeNode |

Each graph file gets `import { timed } from "../../performance"` (relative path varies).

## Not Instrumented

- Static methods (ChatAgent.create)
- Streamers (event forwarding)
- Tools (thin wrappers, upstream tracked)
- Private methods
- Sync methods
