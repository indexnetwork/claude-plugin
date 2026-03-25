---
trigger: "Reclassify docs in docs/domain/ — domain knowledge is about business logic, not design decisions or specs. Move docs to appropriate directories."
type: docs
branch: docs/reclassify-doc-types
created: 2026-03-26
---

## Related Files
- docs/domain/api-reference.md (frontmatter type: spec — API endpoint reference)
- docs/domain/architecture-overview.md (frontmatter type: domain — system design/layering, not business logic)
- docs/domain/protocol-deep-dive.md (frontmatter type: domain — graphs/agents/tools architecture, not business logic)
- docs/domain/getting-started.md (frontmatter type: domain — setup guide, not business logic)
- docs/swe-config.json (may need docs directory conventions added)

## Relevant Docs
None — knowledge base does not cover this area yet.

## Scope

The `docs/domain/` directory should contain **domain knowledge** — how the business logic works (e.g. what intents are, how opportunity discovery works, what indexes represent). Currently it holds 4 docs that are design/spec/guide content, not domain knowledge:

1. **api-reference.md** — API endpoint spec/reference. Move to `docs/specs/` or similar.
2. **architecture-overview.md** — System design, layering rules, dependency diagrams. Move to `docs/design/` or `docs/architecture/`.
3. **protocol-deep-dive.md** — Implementation guide for graphs, agents, tools. Move to `docs/design/` or `docs/architecture/`.
4. **getting-started.md** — Developer onboarding/setup guide. Move to `docs/guides/` or similar.

Tasks:
- Decide on directory structure (e.g. `docs/guides/`, `docs/specs/`, `docs/design/`)
- Move files to correct directories
- Update frontmatter `type` field to match new classification
- Keep `docs/domain/` for future actual domain knowledge docs
