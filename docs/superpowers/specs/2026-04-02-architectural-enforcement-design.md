---
title: "Programmatic Architectural Enforcement"
type: spec
tags: [eslint, boundaries, architecture, enforcement, ci, pre-commit]
created: 2026-04-02
---

# Programmatic Architectural Enforcement

## Problem

The protocol backend has well-documented architectural rules (layering, protocol isolation, adapter naming, cross-service communication) but zero programmatic enforcement. Violations are caught only through manual code review — or not at all. AI agents (Cursor, Copilot) routinely generate code that ignores `.cursor/rules` and violates layering boundaries.

## Goals

- Catch architectural violations at editor time (red squiggles), commit time (pre-commit hook), and PR time (CI)
- Enforce the protocol's strict layering: Controllers → Services → Adapters
- Prevent protocol layer from importing adapters directly
- Prevent services from importing other services
- Flag adapter files named after technology instead of concept
- Normalize ESLint across the monorepo to v9 flat config

## Non-Goals

- `Pick<>` interface narrowing enforcement (not statically enforceable with ESLint; stays as code review)
- Graph invariants (conditional edges, `Annotation.Root`, no-throw nodes — requires custom AST analysis; deferred)
- "No business logic in queues" (judgment call, not statically enforceable)
- Boundary enforcement in frontend or CLI (no layering architecture to enforce)

---

## Components

### 1. ESLint 9 Upgrade (Protocol + Frontend)

Upgrade both packages from their current versions to ESLint 9 with flat config format.

**Protocol** (currently ESLint 8, legacy config):
- Replace `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` with `typescript-eslint` v8+
- Convert `eslint.config.mjs` from legacy format to flat config
- Preserve existing rules: `no-explicit-any` (error), `no-unused-vars` (with underscore ignore)

**Frontend** (currently ESLint 9, already flat config):
- Update dependencies to latest within v9
- No structural config changes needed

**Root lint script** (`bun run lint`) continues to run both.

### 2. `eslint-plugin-boundaries` in Protocol

Install `eslint-plugin-boundaries` and configure architectural element definitions with allowed import directions.

#### Element Definitions

| Element | Pattern | Description |
|---|---|---|
| `controllers` | `src/controllers/**` | HTTP handlers |
| `services` | `src/services/**` | Business logic |
| `adapters` | `src/adapters/**` | Infrastructure wrappers |
| `protocol` | `src/lib/protocol/**` | Graphs, agents, tools, interfaces |
| `queues` | `src/queues/**` | BullMQ job handlers |
| `events` | `src/events/**` | Event emitter definitions |
| `guards` | `src/guards/**` | Auth/validation guards |
| `schemas` | `src/schemas/**` | Drizzle table definitions |
| `types` | `src/types/**` | Shared type definitions |
| `main` | `src/main.ts` | Entry point (wires everything) |
| `cli` | `src/cli/**` | CLI/maintenance scripts |

#### Dependency Rules

Each rule specifies what an element is **allowed** to import. Everything not listed is disallowed.

**Controllers** can import:
- `services`
- `guards`
- `types`
- `schemas` (for Zod validation types only — not Drizzle operators)

**Controllers** CANNOT import:
- `adapters` (must go through services)
- `protocol` (must go through services)
- `queues`, `events`

**Services** can import:
- `adapters`
- `protocol`
- `events`
- `queues`
- `schemas`
- `types`

**Services** CANNOT import:
- Other `services` (use events/queues for cross-service communication)

**Adapters** can import:
- `schemas`
- `types`
- External packages only

**Adapters** CANNOT import:
- `protocol` (especially not `lib/protocol/interfaces/`)
- `services`, `controllers`, `queues`, `events`

**Protocol** can import:
- Only itself (sub-paths within `src/lib/protocol/`)
- `types`

**Protocol** CANNOT import:
- `adapters`, `services`, `controllers`, `schemas`, `queues`, `events`

**Queues** can import:
- `services`
- `adapters`
- `protocol`
- `schemas`
- `types`
- `events`

**Queues** CANNOT import:
- `controllers`

**Events** can import:
- `types` only

**Events** CANNOT import:
- Everything else (events are pure definitions)

**Guards** can import:
- `adapters`
- `schemas`
- `types`

**Main** can import:
- Everything (it's the composition root)

**CLI** can import:
- Everything (maintenance scripts need broad access)

#### Self-Import Rule

Services cannot import other services. This is configured as a boundaries rule where `services` elements cannot import other `services` elements (except themselves — a service file can import from its own module).

### 3. Adapter Filename Lint Rule

Add an ESLint `no-restricted-syntax` or custom rule scoped to `src/adapters/` that flags filenames containing technology names.

Disallowed patterns in adapter filenames:
- `drizzle` → should be `database`
- `redis` → should be `cache`
- `bullmq` → should be `queue`
- `s3` → should be `storage`
- `resend` → should be `email`

Implementation: A standalone filename check script (`scripts/check-adapter-names.sh`) run in CI and pre-commit. ESLint doesn't natively lint filenames, so a simple script is more reliable than trying to shoehorn this into an ESLint rule.

### 4. `lint-staged` + Pre-Commit Hook

Install `lint-staged` as a root devDependency. Configure it to run ESLint on staged `.ts` files.

**Root `package.json` lint-staged config:**
```json
{
  "lint-staged": {
    "protocol/src/**/*.ts": "eslint --no-warn-ignored",
    "frontend/src/**/*.ts": "eslint --no-warn-ignored",
    "frontend/src/**/*.tsx": "eslint --no-warn-ignored"
  }
}
```

**Extend `scripts/hooks/pre-commit`:**
Add `bunx lint-staged` invocation after the existing `llms.txt` generation logic. If `lint-staged` exits non-zero, the commit is blocked.

### 5. GitHub Actions CI Lint Workflow

New file: `.github/workflows/lint.yml`

**Trigger:** Pull requests targeting `dev` branch.

**Steps:**
1. Checkout code
2. Install Bun
3. `bun install`
4. `bun run lint` (runs ESLint across protocol + frontend)
5. Run adapter filename check script

**Behavior:** PR is blocked from merging if lint fails. Uses GitHub branch protection rules on `dev` to require the check to pass.

---

## Enforcement Stack

```
Developer writes code (or AI agent generates it)
    ↓
ESLint in editor → red squiggles on architectural violations immediately
    ↓
git commit → lint-staged runs ESLint on staged files → blocks commit if violations
    ↓
git push + PR to dev → GitHub Actions runs full lint → blocks merge if violations
```

---

## Boundary Rules Quick Reference

| From ↓ / To → | controllers | services | adapters | protocol | queues | events | guards | schemas | types |
|---|---|---|---|---|---|---|---|---|---|
| **controllers** | - | yes | NO | NO | NO | NO | yes | yes | yes |
| **services** | NO | NO (self only) | yes | yes | yes | yes | NO | yes | yes |
| **adapters** | NO | NO | - | NO | NO | NO | NO | yes | yes |
| **protocol** | NO | NO | NO | self only | NO | NO | NO | NO | yes |
| **queues** | NO | yes | yes | yes | - | yes | NO | yes | yes |
| **events** | NO | NO | NO | NO | NO | - | NO | NO | yes |
| **guards** | NO | NO | yes | NO | NO | NO | - | yes | yes |

`main.ts` and `cli/` can import anything (composition root and maintenance scripts).

---

## Acceptance Criteria

1. Protocol and frontend both use ESLint 9 with flat config
2. `eslint-plugin-boundaries` is configured in protocol with all element definitions and dependency rules from this spec
3. A controller importing from `adapters/` produces an ESLint error
4. A service importing another service produces an ESLint error
5. A file in `lib/protocol/` importing from `adapters/` produces an ESLint error
6. An adapter importing from `lib/protocol/interfaces/` produces an ESLint error
7. Adapter files named after technology (e.g. `drizzle.adapter.ts`) are flagged by the filename check
8. `lint-staged` is configured and the pre-commit hook runs ESLint on staged files
9. GitHub Actions workflow runs `bun run lint` on PRs to `dev`
10. All existing code passes the new rules (fix any current violations or add targeted `eslint-disable` comments with explanation)
11. `bun run lint` passes with zero errors after implementation
