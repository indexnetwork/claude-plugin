---
trigger: "Based on docs/, update README.md and possibly CLAUDE.md"
type: docs
branch: docs/update-readme-claude
created: 2026-03-27
version-bump: none
---

## Related Files
- README.md
- CLAUDE.md
- docs/design/architecture-overview.md
- docs/design/protocol-deep-dive.md
- docs/domain/negotiation.md
- docs/guides/getting-started.md
- docs/specs/api-reference.md
- docs/swe-config.json

## Relevant Docs
- docs/design/architecture-overview.md
- docs/guides/getting-started.md

## Scope
Update README.md and CLAUDE.md to reflect the current state of the project based on the newly created docs/ directory:

**README.md:**
- Fix outdated prerequisites (Node.js 18+ → Bun 1.2+, add pgvector 0.5+ and Redis 6+)
- Remove speculative Future Roadmap section (TEE/XMTP/decentralized storage)
- Add bilateral negotiation to Key Features and How It Works
- Fix "Next.js" → "Vite + React Router v7 SPA" in project structure
- Update graph count from 6 to 11, add negotiation
- Fix contributing workflow to branch from dev (not main), use worktrees
- Add Documentation section linking to all docs/ files
- Link Getting Started to docs/guides/getting-started.md

**CLAUDE.md:**
- Add docs/ directory tree to monorepo structure
- Add negotiation graph to protocol graphs list
- Update docs reference from lib/protocol/docs/ to docs/design/ and docs/domain/
