---
trigger: "IND-211 — refactor: remove adapter imports from src/lib/protocol/interfaces/"
type: refactor
branch: refactor/adapter-interface-decoupling
base-branch: dev
created: 2026-03-27
version-bump: patch
linear-issue: IND-211
---

## Related Files
- protocol/src/adapters/database.adapter.ts (imports VectorStore from embedder.interface, types from database.interface)
- protocol/src/adapters/integration.adapter.ts (imports from integration.interface)
- protocol/src/adapters/embedder.adapter.ts (imports LensEmbedding, ProfileEmbeddingSearchOptions from embedder.interface; re-exports LensEmbedding)
- protocol/src/adapters/cache.adapter.ts (imports Cache, CacheOptions from cache.interface)
- protocol/src/lib/protocol/interfaces/database.interface.ts (protocol-layer types)
- protocol/src/lib/protocol/interfaces/embedder.interface.ts (protocol-layer types)
- protocol/src/lib/protocol/interfaces/integration.interface.ts (protocol-layer types)
- protocol/src/lib/protocol/interfaces/cache.interface.ts (protocol-layer types)

## Relevant Docs
- docs/design/architecture-overview.md

## Related Issues
- IND-211 refactor: remove adapter imports from src/lib/protocol/interfaces/ (Triage)

## Scope
Remove all imports from `src/lib/protocol/interfaces/` in the four adapter files, enforcing the architecture rule that adapters must not depend on the protocol layer.

### For each adapter
1. Identify the types imported from protocol interfaces
2. Define equivalent types locally in the adapter (or a shared adapter types file)
3. Replace the import with the local type
4. Ensure the local type structurally aligns with the protocol interface (TypeScript structural typing ensures compatibility without import coupling)

### Affected imports
- **database.adapter.ts**: `VectorStore` (from embedder.interface), several types from database.interface
- **integration.adapter.ts**: types from integration.interface
- **embedder.adapter.ts**: `LensEmbedding`, `ProfileEmbeddingSearchOptions` from embedder.interface (also re-exports `LensEmbedding`)
- **cache.adapter.ts**: `Cache`, `CacheOptions` from cache.interface

### Key consideration
- The `embedder.adapter.ts` re-exports `LensEmbedding` — consumers of that re-export need to be updated to import from the adapter's local type instead
- Use TypeScript structural typing: adapters define their own types that happen to match the protocol interface shape, no import needed
