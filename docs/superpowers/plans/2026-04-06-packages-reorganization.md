# Packages Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `cli/` to `packages/cli/` and `plugin/` to `packages/claude-plugin/` so all distributable units live under one consistent location.

**Architecture:** CLI is moved with `git mv` (git rename detection preserves history). Plugin is re-grafted as a git subtree: split the old `plugin/` prefix into a temp branch, remove the directory, re-add under `packages/claude-plugin/`. CI workflows, the pre-push hook, and CLAUDE.md are updated to reflect new paths.

**Tech Stack:** git subtree, Bun workspaces, GitHub Actions

---

## File Map

| File | Action |
|------|--------|
| `cli/` → `packages/cli/` | Move (git mv) |
| `plugin/` → `packages/claude-plugin/` | Re-graft (git subtree split + add) |
| `packages/claude-plugin/package.json` | Create |
| `.github/workflows/publish-cli.yml` | Modify — update all `working-directory` and artifact paths |
| `scripts/hooks/pre-push` | Modify — update prefix references |
| `CLAUDE.md` | Modify — update structure diagram, CLI section, Plugin section |

---

### Task 1: Move cli/ to packages/cli/

**Files:**
- Move: `cli/` → `packages/cli/`

- [ ] **Step 1: Move the directory**

Run from repo root:
```bash
git mv cli packages/cli
```

- [ ] **Step 2: Verify the move**

Run:
```bash
ls packages/
```
Expected output includes: `cli  protocol`

```bash
cat packages/cli/package.json | grep '"name"'
```
Expected: `"name": "@indexnetwork/cli",`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "chore: move cli/ to packages/cli"
```

---

### Task 2: Update publish-cli.yml for new path

**Files:**
- Modify: `.github/workflows/publish-cli.yml`

- [ ] **Step 1: Replace the entire file with updated content**

The only changes are: all `working-directory: cli` → `working-directory: packages/cli`, `path: cli/dist/...` → `path: packages/cli/dist/...`, and `path: cli/artifacts` → `path: packages/cli/artifacts`.

Write `.github/workflows/publish-cli.yml`:

```yaml
# Publish the @indexnetwork/cli package to npm when a cli-v* tag is pushed.
#
# Creates platform-specific binaries on native runners, then publishes
# all packages (platform packages first, main package last).
#
# Requires: GitHub repo secret NPM_TOKEN (npm automation token with publish
# access to the @index-network scope).
#
# Usage:
#   git tag cli-v0.6.0
#   git push upstream cli-v0.6.0
name: Publish CLI

on:
  push:
    tags:
      - "cli-v*"

# Prevent concurrent publishes for the same tag.
concurrency:
  group: publish-cli-${{ github.ref }}
  cancel-in-progress: false

jobs:
  # ── Build platform binaries ──────────────────────────────────────────
  build:
    strategy:
      fail-fast: true
      matrix:
        include:
          - os: ubuntu-latest
            target: bun-linux-x64
            npm-dir: linux-x64
            binary-name: index-linux-x64
          - os: ubuntu-24.04-arm
            target: bun-linux-arm64
            npm-dir: linux-arm64
            binary-name: index-linux-arm64
          - os: macos-latest
            target: bun-darwin-x64
            npm-dir: darwin-x64
            binary-name: index-darwin-x64
          - os: macos-latest
            target: bun-darwin-arm64
            npm-dir: darwin-arm64
            binary-name: index-darwin-arm64

    runs-on: ${{ matrix.os }}
    name: Build ${{ matrix.npm-dir }}

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile
        working-directory: packages/cli

      - name: Compile binary
        working-directory: packages/cli
        run: |
          mkdir -p dist
          bun build src/main.ts --compile --target=${{ matrix.target }} --outfile dist/${{ matrix.binary-name }}

      - name: Upload binary artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.npm-dir }}
          path: packages/cli/dist/${{ matrix.binary-name }}
          retention-days: 1

  # ── Publish all packages to npm ──────────────────────────────────────
  publish:
    needs: build
    runs-on: ubuntu-latest
    name: Publish to npm

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: bun install --frozen-lockfile
        working-directory: packages/cli

      - name: Extract version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF_NAME#cli-v}" >> "$GITHUB_OUTPUT"

      - name: Sync version across all package.json files
        working-directory: packages/cli
        run: |
          VERSION="${{ steps.version.outputs.VERSION }}"

          # Update main package.json
          jq --arg v "$VERSION" '.version = $v
            | .optionalDependencies = (.optionalDependencies | to_entries | map(.value = $v) | from_entries)' \
            package.json > package.json.tmp && mv package.json.tmp package.json

          # Update each platform package.json
          for dir in linux-x64 linux-arm64 darwin-x64 darwin-arm64; do
            jq --arg v "$VERSION" '.version = $v' \
              "npm/$dir/package.json" > "npm/$dir/package.json.tmp" \
              && mv "npm/$dir/package.json.tmp" "npm/$dir/package.json"
          done

      - name: Build JS fallback bundle
        working-directory: packages/cli
        run: |
          mkdir -p dist
          bun build src/main.ts --outdir dist --target node --format esm --entry-naming index.js

      - name: Download all platform binaries
        uses: actions/download-artifact@v4
        with:
          path: packages/cli/artifacts

      - name: Place binaries into platform packages
        working-directory: packages/cli
        run: |
          for dir in linux-x64 linux-arm64 darwin-x64 darwin-arm64; do
            mkdir -p "npm/$dir/bin"
            cp "artifacts/$dir/index-$dir" "npm/$dir/bin/index"
            chmod +x "npm/$dir/bin/index"
          done

      - name: Publish platform packages
        working-directory: packages/cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for dir in linux-x64 linux-arm64 darwin-x64 darwin-arm64; do
            echo "Publishing @indexnetwork/cli-$dir..."
            npm publish --access public "./npm/$dir"
          done

      - name: Publish main package
        working-directory: packages/cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --access public
```

- [ ] **Step 2: Verify the diff — only path changes**

Run:
```bash
git diff .github/workflows/publish-cli.yml | grep "^[+-]" | grep -v "^---\|^+++"
```
Expected: every changed line is either a `working-directory` value or an artifact `path` value. No logic changes.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-cli.yml
git commit --no-gpg-sign -m "ci: update publish-cli workflow paths to packages/cli"
```

---

### Task 3: Re-graft plugin/ as packages/claude-plugin/ subtree

**Files:**
- Remove: `plugin/`
- Create: `packages/claude-plugin/` (via git subtree add)

> **Note:** `git subtree split` traverses the full repo history to extract commits touching `plugin/`. This may take 30–60 seconds on a large repo — that is normal.

- [ ] **Step 1: Split plugin/ history into a temporary branch**

Run from repo root:
```bash
git subtree split --prefix=plugin -b temp/plugin-split
```
Expected: prints a commit SHA and exits without error. The branch `temp/plugin-split` now contains only the plugin history.

- [ ] **Step 2: Remove the old plugin/ directory and commit**

```bash
git rm -r plugin/
git commit --no-gpg-sign -m "chore: remove plugin/ before re-grafting as packages/claude-plugin"
```

- [ ] **Step 3: Add the subtree back at the new prefix**

```bash
git subtree add --prefix=packages/claude-plugin temp/plugin-split
```
Expected: prints "Added dir 'packages/claude-plugin'" and creates a merge commit.

- [ ] **Step 4: Delete the temporary branch**

```bash
git branch -d temp/plugin-split
```

- [ ] **Step 5: Verify**

```bash
ls packages/claude-plugin/
```
Expected: `README.md  skills`

```bash
ls packages/claude-plugin/skills/
```
Expected: the skill directories (e.g. `index-network  index-network-connect  ...`)

---

### Task 4: Add packages/claude-plugin/package.json

**Files:**
- Create: `packages/claude-plugin/package.json`

- [ ] **Step 1: Create the file**

Write `packages/claude-plugin/package.json`:
```json
{
  "name": "claude-plugin",
  "version": "1.0.0",
  "private": true
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/claude-plugin/package.json
git commit --no-gpg-sign -m "chore: add package.json to packages/claude-plugin"
```

---

### Task 5: Update pre-push hook for new subtree prefix

**Files:**
- Modify: `scripts/hooks/pre-push`

- [ ] **Step 1: Update the hook**

Write `scripts/hooks/pre-push`:
```bash
#!/usr/bin/env bash
# Syncs packages/claude-plugin/ subtree to indexnetwork/claude-plugin when pushing dev to upstream.
# Runs automatically — no manual subtree push needed.

PLUGIN_REMOTE="https://github.com/indexnetwork/claude-plugin.git"

while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
  # Only sync on upstream pushes to dev
  [[ "$1" != "upstream" ]] && continue
  [[ "$remote_ref" != "refs/heads/dev" ]] && continue

  # Determine commit range
  if [[ "$remote_sha" == "0000000000000000000000000000000000000000" ]]; then
    range="$local_sha"
  else
    range="${remote_sha}..${local_sha}"
  fi

  # Skip if no commits in range touch packages/claude-plugin/
  if ! git log --oneline "$range" -- packages/claude-plugin/ 2>/dev/null | grep -q .; then
    continue
  fi

  echo "[pre-push] packages/claude-plugin/ changed — syncing to indexnetwork/claude-plugin..."
  if git subtree push --prefix=packages/claude-plugin "$PLUGIN_REMOTE" main 2>&1; then
    echo "[pre-push] ✓ synced to indexnetwork/claude-plugin"
  else
    echo "[pre-push] ✗ plugin sync failed — run manually: git subtree push --prefix=packages/claude-plugin $PLUGIN_REMOTE main" >&2
    # Warn but don't block the main push
  fi
done

exit 0
```

- [ ] **Step 2: Verify it is executable**

```bash
ls -la scripts/hooks/pre-push
```
Expected: permissions show `-rwxr-xr-x` (executable). If not:
```bash
chmod +x scripts/hooks/pre-push
```

- [ ] **Step 3: Commit**

```bash
git add scripts/hooks/pre-push
git commit --no-gpg-sign -m "chore: update pre-push hook for packages/claude-plugin prefix"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the CLI development commands section**

Find and replace the CLI section (lines ~64–71):

Old:
```markdown
### CLI

```bash
cd cli
bun src/main.ts conversation                # Run CLI directly with Bun (no build)
bun run build                               # Build native binaries for all platforms
bun test                                    # Run CLI tests
```
```

New:
```markdown
### CLI

```bash
cd packages/cli
bun src/main.ts conversation                # Run CLI directly with Bun (no build)
bun run build                               # Build native binaries for all platforms
bun test                                    # Run CLI tests
```
```

- [ ] **Step 2: Update the Plugin subtree section**

Find and replace the Plugin section (lines ~87–99):

Old:
```markdown
### Plugin (subtree)

The `plugin/` directory is a git subtree tracking `indexnetwork/claude-plugin` (`main` branch). It contains **skills only** (markdown files) — no code, no build step. It is checked in as regular files — no special init needed after cloning.

**Syncing is automatic.** The `scripts/hooks/pre-push` hook detects commits touching `plugin/` and runs `git subtree push` to `indexnetwork/claude-plugin` whenever you push `dev` to `upstream`. No manual action needed — edit `plugin/` in this repo and push normally.

```bash
# Manual push if the hook failed
git subtree push --prefix=plugin https://github.com/indexnetwork/claude-plugin.git main

# Pull if claude-plugin was edited directly (avoid this — always edit via this repo)
git subtree pull --squash --prefix=plugin https://github.com/indexnetwork/claude-plugin.git main
```
```

New:
```markdown
### Plugin (subtree)

The `packages/claude-plugin/` directory is a git subtree tracking `indexnetwork/claude-plugin` (`main` branch). It contains **skills only** (markdown files) — no code, no build step. It is checked in as regular files — no special init needed after cloning.

**Syncing is automatic.** The `scripts/hooks/pre-push` hook detects commits touching `packages/claude-plugin/` and runs `git subtree push` to `indexnetwork/claude-plugin` whenever you push `dev` to `upstream`. No manual action needed — edit `packages/claude-plugin/` in this repo and push normally.

```bash
# Manual push if the hook failed
git subtree push --prefix=packages/claude-plugin https://github.com/indexnetwork/claude-plugin.git main

# Pull if claude-plugin was edited directly (avoid this — always edit via this repo)
git subtree pull --squash --prefix=packages/claude-plugin https://github.com/indexnetwork/claude-plugin.git main
```
```

- [ ] **Step 3: Update the Monorepo Structure diagram**

Find and replace these two lines in the diagram:
```
├── cli/               # CLI client (@indexnetwork/cli) — Bun, TypeScript
├── plugin/            # Claude plugin (skills-only, subtree → indexnetwork/claude-plugin)
```

Replace with (move both under `packages/`):
```
│   ├── cli/           # @indexnetwork/cli — Bun, TypeScript
│   └── claude-plugin/ # Claude plugin (skills-only, subtree → indexnetwork/claude-plugin)
```

And remove the old standalone `cli/` and `plugin/` lines from the diagram so the `packages/` block reads:
```
├── packages/
│   ├── protocol/      # @indexnetwork/protocol NPM package (agent graphs, interfaces)
│   ├── cli/           # @indexnetwork/cli — Bun, TypeScript
│   └── claude-plugin/ # Claude plugin (skills-only, subtree → indexnetwork/claude-plugin)
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit --no-gpg-sign -m "docs: update CLAUDE.md for packages/cli and packages/claude-plugin"
```

---

### Task 7: Smoke-test the result

- [ ] **Step 1: Verify workspace structure**

```bash
ls packages/
```
Expected: `cli  claude-plugin  protocol`

- [ ] **Step 2: Verify CLI package is intact**

```bash
cat packages/cli/package.json | grep '"name"\|"version"'
```
Expected:
```
  "name": "@indexnetwork/cli",
  "version": "0.9.2",
```

- [ ] **Step 3: Verify plugin structure**

```bash
ls packages/claude-plugin/
```
Expected: `package.json  README.md  skills`

- [ ] **Step 4: Verify no stale references to old paths**

```bash
grep -r '"working-directory: cli"' .github/ 2>/dev/null || echo "none"
grep -rn 'prefix=plugin' scripts/ 2>/dev/null || echo "none"
grep -n "^├── cli/" CLAUDE.md || echo "none"
grep -n "^├── plugin/" CLAUDE.md || echo "none"
```
Expected: all four print `none`.

- [ ] **Step 5: Verify root workspace picks up new packages**

```bash
bun install
```
Expected: exits cleanly. No errors about unresolved workspaces.
