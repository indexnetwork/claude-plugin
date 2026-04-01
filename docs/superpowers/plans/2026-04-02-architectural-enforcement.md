# Architectural Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Programmatically enforce protocol architectural layering rules via ESLint boundaries, lint-staged pre-commit hook, and GitHub Actions CI lint workflow.

**Architecture:** Upgrade both protocol and frontend to ESLint 9 flat config, add `eslint-plugin-boundaries` to protocol to enforce import direction rules between architectural layers, wire up lint-staged for pre-commit gating, and add a GitHub Actions workflow to block PRs with violations.

**Tech Stack:** ESLint 9, typescript-eslint v8+, eslint-plugin-boundaries, lint-staged, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-02-architectural-enforcement-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `protocol/eslint.config.mjs` | ESLint 9 flat config + boundaries rules |
| Modify | `protocol/package.json` | Update ESLint deps, add boundaries plugin |
| Modify | `frontend/package.json` | Update ESLint deps to latest |
| Modify | `package.json` (root) | Add lint-staged config and devDependency |
| Modify | `scripts/hooks/pre-commit` | Add lint-staged invocation |
| Create | `.github/workflows/lint.yml` | CI lint workflow for PRs |
| Create | `scripts/check-adapter-names.sh` | Adapter filename validation script |
| Modify | `protocol/src/lib/protocol/tools/index.ts` | Remove direct adapter imports (fix violation) |
| Modify | `protocol/src/controllers/storage.controller.ts` | Remove direct adapter import (fix violation) |
| Modify | `protocol/src/controllers/chat.controller.ts` | Remove direct lib/protocol import (fix violation) |
| Modify | `protocol/src/controllers/user.controller.ts` | Remove direct lib/protocol import (fix violation) |
| Modify | `protocol/src/controllers/debug.controller.ts` | Remove direct lib/protocol import (fix violation) |
| Modify | `protocol/src/controllers/integration.controller.ts` | Remove direct lib/protocol import (fix violation) |
| Modify | `protocol/src/controllers/tool.controller.ts` | Remove direct lib/protocol import (fix violation) |

---

## Task 1: Upgrade Protocol ESLint to v9

**Files:**
- Modify: `protocol/package.json` (devDependencies)
- Modify: `protocol/eslint.config.mjs`

- [ ] **Step 1: Remove old ESLint packages and install new ones**

```bash
cd protocol
bun remove eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
bun add -d eslint@latest typescript-eslint@latest @eslint/js@latest
```

- [ ] **Step 2: Rewrite protocol ESLint config to flat format**

Replace the entire `protocol/eslint.config.mjs` with:

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "drizzle/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
);
```

- [ ] **Step 3: Update the protocol lint script**

In `protocol/package.json`, change the lint script from:
```json
"lint": "eslint src/**/*.ts"
```
to:
```json
"lint": "eslint src/"
```

ESLint 9 flat config handles file matching via the config's `files` array, so the glob in the CLI command is no longer needed. Passing `src/` as a directory is cleaner and avoids shell glob expansion issues.

- [ ] **Step 4: Run lint to verify the upgrade works**

```bash
cd protocol
bun run lint
```

Expected: Lint runs successfully. There may be existing errors (like `no-explicit-any` violations) — that's fine. The important thing is that ESLint itself doesn't crash or fail to parse the config.

- [ ] **Step 5: Commit**

```bash
git add protocol/package.json protocol/eslint.config.mjs protocol/bun.lock
git commit -m "chore(protocol): upgrade ESLint to v9 flat config"
```

---

## Task 2: Update Frontend ESLint to Latest

**Files:**
- Modify: `frontend/package.json` (devDependencies)

- [ ] **Step 1: Update frontend ESLint packages to latest**

```bash
cd frontend
bun add -d eslint@latest typescript-eslint@latest @eslint/js@latest eslint-plugin-react-hooks@latest eslint-plugin-react-refresh@latest
```

- [ ] **Step 2: Run lint to verify**

```bash
cd frontend
bun run lint
```

Expected: Lint runs successfully. No config changes needed — frontend is already using flat config format.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/bun.lock
git commit -m "chore(frontend): update ESLint deps to latest"
```

---

## Task 3: Fix Protocol Layer Violations — `lib/protocol/tools/index.ts`

The tool composition root (`src/lib/protocol/tools/index.ts`) directly imports from `adapters/` and `queues/`, violating protocol layer isolation. These dependencies must be injected instead.

**Files:**
- Modify: `protocol/src/lib/protocol/tools/index.ts`

- [ ] **Step 1: Identify the adapter/queue imports to remove**

In `protocol/src/lib/protocol/tools/index.ts`, lines 17-25 import directly from adapters and queues:

```ts
import { RedisCacheAdapter } from "../../../adapters/cache.adapter";
import { ComposioIntegrationAdapter } from "../../../adapters/integration.adapter";
import {
  chatDatabaseAdapter,
  conversationDatabaseAdapter,
  createUserDatabase,
  createSystemDatabase,
} from "../../../adapters/database.adapter";
import { intentQueue } from "../../../queues/intent.queue";
```

- [ ] **Step 2: Read the full file to understand the ToolContext and how adapters are used**

Read `protocol/src/lib/protocol/tools/index.ts` completely. Understand:
- How `ToolContext` and `ResolvedToolContext` are defined
- Where the imported adapters are used (likely in `createChatTools()` or `resolveToolContext()`)
- What the caller passes in vs what's hardcoded

- [ ] **Step 3: Move adapter instantiation to the caller**

The adapters imported here should already be available in the caller (the service or controller that invokes chat tools). Refactor so that:
1. `ToolContext` / `ResolvedToolContext` accepts these adapters as injected properties
2. Remove the direct adapter imports from this file
3. Update the caller (likely `ChatService` or `ChatController`) to pass the adapters in

The exact changes depend on the file's structure — read it fully first. The principle: every adapter reference in this file should come from a parameter, not an import.

- [ ] **Step 4: Verify no adapter imports remain in lib/protocol/**

```bash
cd protocol
grep -rn "from.*\.\./\.\./\.\./adapters/" src/lib/protocol/ --include="*.ts" | grep -v "\.spec\." | grep -v "\.test\."
```

Expected: No matches (test files excluded — they get a separate eslint-disable or are excluded from boundaries).

- [ ] **Step 5: Run existing tests to verify nothing broke**

```bash
cd protocol
bun test tests/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(protocol): inject adapters into tool composition root

Remove direct adapter/queue imports from lib/protocol/tools/index.ts.
Dependencies are now passed via ToolContext, maintaining protocol
layer isolation."
```

---

## Task 4: Fix Controller Layer Violations

Controllers are importing directly from `adapters/` and `lib/protocol/`. These need to go through services.

**Files:**
- Modify: `protocol/src/controllers/storage.controller.ts`
- Modify: `protocol/src/controllers/chat.controller.ts`
- Modify: `protocol/src/controllers/user.controller.ts`
- Modify: `protocol/src/controllers/debug.controller.ts`
- Modify: `protocol/src/controllers/integration.controller.ts`
- Modify: `protocol/src/controllers/tool.controller.ts`

- [ ] **Step 1: Fix `storage.controller.ts` — imports `S3StorageAdapter` directly**

Read `protocol/src/controllers/storage.controller.ts`. The controller imports `S3StorageAdapter` from adapters. Refactor to go through a storage service, or if a service already exists that wraps it, use that instead.

- [ ] **Step 2: Fix `chat.controller.ts` — imports `SuggestionGenerator` from lib/protocol**

Read `protocol/src/controllers/chat.controller.ts`. The controller imports `SuggestionGenerator` directly from `lib/protocol/agents/`. Move this to `ChatService` (or a new `SuggestionService` if `ChatService` is the wrong home).

- [ ] **Step 3: Fix `user.controller.ts` — imports `NegotiationInsightsGenerator` from lib/protocol**

Read `protocol/src/controllers/user.controller.ts`. Move the `NegotiationInsightsGenerator` usage behind a service method.

- [ ] **Step 4: Fix `debug.controller.ts` — imports opportunity utils from lib/protocol**

Read `protocol/src/controllers/debug.controller.ts`. It imports `canUserSeeOpportunity` and `isActionableForViewer` from `lib/protocol/support/opportunity.utils`. Since these are pure utility functions (no DB access), consider moving them to a shared location outside `lib/protocol/` (e.g. `src/lib/utils/`) or wrapping them in the opportunity service.

- [ ] **Step 5: Fix `integration.controller.ts` — imports type from lib/protocol/interfaces**

Read `protocol/src/controllers/integration.controller.ts`. It imports `IntegrationAdapter` type from `lib/protocol/interfaces/`. Move the type import to `src/types/` or define the needed type in the service layer.

- [ ] **Step 6: Fix `tool.controller.ts` — imports `ChatContextAccessError` from lib/protocol**

Read `protocol/src/controllers/tool.controller.ts`. It imports `ChatContextAccessError` from `lib/protocol/tools/tool.helpers`. Move this error class to a shared location (e.g. `src/lib/errors/` or `src/types/errors.ts`).

- [ ] **Step 7: Verify no controller-to-adapter or controller-to-protocol imports remain**

```bash
cd protocol
grep -rn "from.*adapters/" src/controllers/ --include="*.ts" | grep -v "\.spec\." | grep -v "\.test\." | grep -v "tests/"
grep -rn "from.*lib/protocol/" src/controllers/ --include="*.ts" | grep -v "\.spec\." | grep -v "\.test\." | grep -v "tests/"
```

Expected: No matches for production code.

- [ ] **Step 8: Run tests**

```bash
cd protocol
bun test tests/
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(protocol): fix controller layering violations

Controllers no longer import from adapters/ or lib/protocol/ directly.
All dependencies routed through services."
```

---

## Task 5: Add `eslint-plugin-boundaries` to Protocol

**Files:**
- Modify: `protocol/package.json`
- Modify: `protocol/eslint.config.mjs`

- [ ] **Step 1: Install eslint-plugin-boundaries**

```bash
cd protocol
bun add -d eslint-plugin-boundaries@latest
```

- [ ] **Step 2: Add boundaries configuration to `protocol/eslint.config.mjs`**

Add the boundaries plugin and rules to the existing flat config. Replace the entire file with:

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  { ignores: ["dist/", "drizzle/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // ── Architectural boundary enforcement ──────────────────────────────
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/tests/**"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "controllers", pattern: "src/controllers/*", mode: "file" },
        { type: "services", pattern: "src/services/*", mode: "file" },
        { type: "adapters", pattern: "src/adapters/*", mode: "file" },
        { type: "protocol", pattern: "src/lib/protocol/**/*", mode: "file" },
        { type: "queues", pattern: "src/queues/*", mode: "file" },
        { type: "events", pattern: "src/events/*", mode: "file" },
        { type: "guards", pattern: "src/guards/*", mode: "file" },
        { type: "schemas", pattern: "src/schemas/*", mode: "file" },
        { type: "types", pattern: "src/types/*", mode: "file" },
        { type: "main", pattern: "src/main.ts", mode: "file" },
        { type: "cli", pattern: "src/cli/**/*", mode: "file" },
      ],
      "boundaries/ignore": ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/tests/**"],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // Controllers can import: services, guards, types, schemas
            {
              from: "controllers",
              allow: ["services", "guards", "types", "schemas"],
            },
            // Services can import: adapters, protocol, events, queues, schemas, types
            // NOTE: services cannot import other services — handled by boundaries/entry-point or a separate no-self rule
            {
              from: "services",
              allow: ["adapters", "protocol", "events", "queues", "schemas", "types"],
            },
            // Adapters can import: schemas, types
            {
              from: "adapters",
              allow: ["schemas", "types"],
            },
            // Protocol can import: only itself and types
            {
              from: "protocol",
              allow: ["protocol", "types"],
            },
            // Queues can import: services, adapters, protocol, schemas, types, events
            {
              from: "queues",
              allow: ["services", "adapters", "protocol", "schemas", "types", "events"],
            },
            // Events can import: types only
            {
              from: "events",
              allow: ["types"],
            },
            // Guards can import: adapters, schemas, types
            {
              from: "guards",
              allow: ["adapters", "schemas", "types"],
            },
            // Main (composition root) can import anything
            {
              from: "main",
              allow: [
                "controllers", "services", "adapters", "protocol",
                "queues", "events", "guards", "schemas", "types", "cli",
              ],
            },
            // CLI scripts can import anything
            {
              from: "cli",
              allow: [
                "controllers", "services", "adapters", "protocol",
                "queues", "events", "guards", "schemas", "types",
              ],
            },
          ],
        },
      ],
    },
  },
);
```

- [ ] **Step 3: Run lint to verify boundaries work**

```bash
cd protocol
bun run lint
```

Expected: Lint passes with zero boundary errors (since we fixed violations in Tasks 3-4). If any new violations appear, they are pre-existing and must be fixed or given targeted `eslint-disable` comments with explanation.

- [ ] **Step 4: Verify boundaries catch violations — create a temporary test**

Create a temporary file to confirm the rule catches violations:

```bash
cd protocol
cat > /tmp/test-violation.ts << 'EOF'
// Temporary: verify boundaries catch this
import { DatabaseAdapter } from '../adapters/database.adapter';
EOF
```

Actually, a simpler verification: temporarily add a bad import to a controller, run lint, confirm it errors, then revert:

```bash
cd protocol
# Add a bad import to a controller
echo 'import { DatabaseAdapter } from "../adapters/database.adapter";' >> src/controllers/chat.controller.ts

# Lint should catch it
bun run lint 2>&1 | grep "boundaries/element-types" || echo "ERROR: boundary rule not catching violations"

# Revert
git checkout src/controllers/chat.controller.ts
```

Expected: The lint output shows a `boundaries/element-types` error for the bad import.

- [ ] **Step 5: Commit**

```bash
git add protocol/package.json protocol/eslint.config.mjs protocol/bun.lock
git commit -m "feat(protocol): add eslint-plugin-boundaries for architectural enforcement

Enforce strict layering rules:
- Controllers can only import services, guards, types, schemas
- Services cannot import other services or controllers
- Adapters cannot import protocol, services, or controllers
- Protocol layer can only import itself and types
- Test files are excluded from boundary checks"
```

---

## Task 6: Add Service-to-Service Import Prevention

`eslint-plugin-boundaries` `element-types` rule prevents a service from importing adapters/controllers/etc, but the "services cannot import other services" rule needs explicit handling. The `element-types` rule allows `services` → `services` by default when the `from` matches the `allow`.

**Files:**
- Modify: `protocol/eslint.config.mjs`

- [ ] **Step 1: Confirm the current config already blocks service-to-service imports**

Check whether the Task 5 config already blocks this. In the `element-types` rules, the `from: "services"` rule does NOT include `"services"` in its `allow` array. With `default: "disallow"`, this means service-to-service imports are already blocked.

Verify by running:

```bash
cd protocol
# Check if any service imports another service (production code only)
grep -rn "from.*\.\.\/.*\.service" src/services/ --include="*.ts" | grep -v "\.spec\." | grep -v "\.test\." | grep -v "tests/"
```

Expected: No matches (the earlier exploration found no service-to-service violations). The rule is already in place from Task 5.

- [ ] **Step 2: Verify with a temporary test**

```bash
cd protocol
# Pick any service file
echo 'import { ChatService } from "./chat.service";' >> src/services/intent.service.ts

bun run lint 2>&1 | grep "boundaries/element-types" || echo "ERROR: service-to-service not caught"

git checkout src/services/intent.service.ts
```

Expected: Lint error on the service-to-service import.

- [ ] **Step 3: Commit (if any config change was needed)**

If the existing config already handles this, no commit needed — just mark as verified.

---

## Task 7: Create Adapter Filename Check Script

**Files:**
- Create: `scripts/check-adapter-names.sh`

- [ ] **Step 1: Create the script**

Create `scripts/check-adapter-names.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Check that adapter files are named by concept, not technology.
# See: docs/superpowers/specs/2026-04-02-architectural-enforcement-design.md

ADAPTER_DIR="protocol/src/adapters"
VIOLATIONS=0

TECH_NAMES="drizzle|redis|bullmq|s3|resend|composio|postgres|pgvector|ioredis"

for file in "$ADAPTER_DIR"/*.ts; do
  basename=$(basename "$file")
  if echo "$basename" | grep -qiE "^($TECH_NAMES)\."; then
    echo "ERROR: Adapter file named after technology: $basename"
    echo "  Adapters must be named by concept (e.g. database.adapter.ts, cache.adapter.ts)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "$VIOLATIONS adapter naming violation(s) found."
  exit 1
fi

echo "Adapter naming check passed."
exit 0
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/check-adapter-names.sh
```

- [ ] **Step 3: Run it to verify it passes**

```bash
./scripts/check-adapter-names.sh
```

Expected: "Adapter naming check passed." (the earlier exploration found no technology-named adapter files).

- [ ] **Step 4: Verify it catches violations**

```bash
touch protocol/src/adapters/drizzle.test-adapter.ts
./scripts/check-adapter-names.sh
echo "Exit code: $?"
rm protocol/src/adapters/drizzle.test-adapter.ts
```

Expected: Error message about technology-named adapter, exit code 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-adapter-names.sh
git commit -m "feat: add adapter filename convention check script

Flags adapter files named after technology (drizzle, redis, etc.)
instead of concept (database, cache, etc.)."
```

---

## Task 8: Set Up lint-staged and Pre-Commit Hook

**Files:**
- Modify: `package.json` (root)
- Modify: `scripts/hooks/pre-commit`

- [ ] **Step 1: Install lint-staged**

```bash
bun add -d lint-staged
```

- [ ] **Step 2: Add lint-staged config to root `package.json`**

Add a `"lint-staged"` key to the root `package.json`:

```json
{
  "lint-staged": {
    "protocol/src/**/*.ts": "eslint --no-warn-ignored",
    "frontend/src/**/*.{ts,tsx}": "eslint --no-warn-ignored"
  }
}
```

- [ ] **Step 3: Extend the pre-commit hook**

Modify `scripts/hooks/pre-commit` to add lint-staged after the existing llms.txt logic. The full file should be:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── llms.txt context generation ──────────────────────────────────────
changed_llms=$(git diff --cached --name-only | grep -E '^(llms\.txt|llms-full\.txt)$' || true)
if [[ -n "${changed_llms}" ]]; then
  echo "[pre-commit] Detected llms.txt changes; generating ctx files..."
  scripts/generate-ctx.sh || {
    echo "[pre-commit] Warning: ctx generation failed; proceeding without blocking commit" >&2
  }
  git add llms-ctx.txt llms-ctx-full.txt frontend/public/llms-ctx.txt frontend/public/llms-ctx-full.txt || true
fi

# ── Lint staged files ────────────────────────────────────────────────
echo "[pre-commit] Running lint-staged..."
bunx lint-staged || {
  echo "[pre-commit] Lint-staged failed. Fix lint errors before committing."
  exit 1
}

# ── Adapter naming check (only if adapter files are staged) ─────────
changed_adapters=$(git diff --cached --name-only | grep -E '^protocol/src/adapters/.*\.ts$' || true)
if [[ -n "${changed_adapters}" ]]; then
  echo "[pre-commit] Checking adapter naming conventions..."
  scripts/check-adapter-names.sh || exit 1
fi

exit 0
```

- [ ] **Step 4: Ensure the hook is installed**

Check that the git hooks path points to `scripts/hooks/`:

```bash
git config core.hooksPath
```

If it doesn't output `scripts/hooks`, set it:

```bash
git config core.hooksPath scripts/hooks
```

- [ ] **Step 5: Test the pre-commit hook**

Stage a file and verify the hook runs:

```bash
# Make a trivial change
echo "" >> protocol/src/types/index.ts
git add protocol/src/types/index.ts

# Dry-run commit (will run hook)
git commit --dry-run

# Revert
git checkout protocol/src/types/index.ts
```

Expected: "[pre-commit] Running lint-staged..." appears in output.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock scripts/hooks/pre-commit
git commit -m "feat: add lint-staged pre-commit hook for architectural enforcement

Runs ESLint on staged files before commit. Also checks adapter
naming conventions when adapter files are staged."
```

---

## Task 9: Add GitHub Actions CI Lint Workflow

**Files:**
- Create: `.github/workflows/lint.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/lint.yml`:

```yaml
# Run ESLint and architectural checks on PRs to dev.
#
# Enforces protocol layering rules (eslint-plugin-boundaries),
# TypeScript lint rules, and adapter naming conventions.
name: Lint

on:
  pull_request:
    branches: [dev]

concurrency:
  group: lint-${{ github.head_ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.2.20"

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint protocol
        run: cd protocol && bun run lint

      - name: Lint frontend
        run: cd frontend && bun run lint

      - name: Check adapter naming conventions
        run: ./scripts/check-adapter-names.sh
```

- [ ] **Step 2: Verify YAML is valid**

```bash
cat .github/workflows/lint.yml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin)" && echo "Valid YAML"
```

Expected: "Valid YAML"

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/lint.yml
git commit -m "ci: add lint workflow for PRs to dev

Runs ESLint (with architectural boundary checks) and adapter
naming validation on all pull requests targeting dev."
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full lint from root**

```bash
bun run lint
```

Expected: Zero errors across protocol and frontend.

- [ ] **Step 2: Run adapter naming check**

```bash
./scripts/check-adapter-names.sh
```

Expected: Passed.

- [ ] **Step 3: Run protocol tests**

```bash
cd protocol
bun test tests/
```

Expected: All tests pass. The refactoring in Tasks 3-4 should not break functionality.

- [ ] **Step 4: Verify boundary rules catch each violation type**

Test each rule by temporarily adding a bad import, running lint, confirming the error, and reverting:

```bash
cd protocol

# Test: controller → adapter (should fail)
echo 'import { x } from "../adapters/database.adapter";' >> src/controllers/chat.controller.ts
bun run lint 2>&1 | grep -q "boundaries" && echo "PASS: controller→adapter blocked" || echo "FAIL"
git checkout src/controllers/chat.controller.ts

# Test: service → service (should fail)
echo 'import { x } from "./chat.service";' >> src/services/intent.service.ts
bun run lint 2>&1 | grep -q "boundaries" && echo "PASS: service→service blocked" || echo "FAIL"
git checkout src/services/intent.service.ts

# Test: protocol → adapter (should fail)
echo 'import { x } from "../../../adapters/database.adapter";' >> src/lib/protocol/agents/chat.agent.ts
bun run lint 2>&1 | grep -q "boundaries" && echo "PASS: protocol→adapter blocked" || echo "FAIL"
git checkout src/lib/protocol/agents/chat.agent.ts

# Test: adapter → protocol (should fail)
echo 'import { x } from "../lib/protocol/interfaces/database.interface";' >> src/adapters/cache.adapter.ts
bun run lint 2>&1 | grep -q "boundaries" && echo "PASS: adapter→protocol blocked" || echo "FAIL"
git checkout src/adapters/cache.adapter.ts
```

Expected: All four tests print "PASS".

- [ ] **Step 5: Final commit (if any fixes were needed)**

If any adjustments were required during verification:

```bash
git add -A
git commit -m "fix: address remaining lint violations from architectural enforcement"
```
