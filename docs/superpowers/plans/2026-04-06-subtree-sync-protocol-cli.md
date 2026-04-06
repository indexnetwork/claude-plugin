# Subtree Sync: protocol and cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `packages/protocol/` and `packages/cli/` as git subtrees tracking `indexnetwork/protocol` and `indexnetwork/cli`, with automatic push on `upstream/dev` push.

**Architecture:** Rename the existing `indexnetwork/protocol` repo (old backend app) to `indexnetwork/backend-legacy`, create fresh repos, seed them via `git subtree split`, then extend the pre-push hook with a reusable `sync_subtree` function. Two-way: auto-push via hook, manual pull via `git subtree pull --squash`.

**Tech Stack:** git subtree, GitHub CLI (`gh`), bash

---

## Files

- Modify: `scripts/hooks/pre-push` — add `sync_subtree` helper + two new sync calls
- Modify: `CLAUDE.md` — document new subtrees under Plugin (subtree) section

---

### Task 1: Rename indexnetwork/protocol to indexnetwork/backend-legacy

**Files:**
- No file changes — GitHub API operation only

- [ ] **Step 1: Rename the repo**

```bash
gh api repos/indexnetwork/protocol \
  --method PATCH \
  -f name=backend-legacy
```

Expected output: JSON with `"name": "backend-legacy"` and `"full_name": "indexnetwork/backend-legacy"`.

- [ ] **Step 2: Verify rename succeeded**

```bash
gh repo view indexnetwork/backend-legacy --json name,fullName -q '{name: .name, fullName: .fullName}'
```

Expected: `{"name":"backend-legacy","fullName":"indexnetwork/backend-legacy"}`

- [ ] **Step 3: Verify original name is gone**

```bash
gh repo view indexnetwork/protocol 2>&1 | head -3
```

Expected: error like `Could not resolve to a Repository with the name 'indexnetwork/protocol'` (404).

---

### Task 2: Create indexnetwork/protocol and indexnetwork/cli repos

**Files:**
- No file changes — GitHub API operations only

- [ ] **Step 1: Create indexnetwork/protocol**

```bash
gh repo create indexnetwork/protocol --public --description "@indexnetwork/protocol — agent graphs and interfaces"
```

Expected: `✓ Created repository indexnetwork/protocol on GitHub`

- [ ] **Step 2: Create indexnetwork/cli**

```bash
gh repo create indexnetwork/cli --public --description "@indexnetwork/cli — command-line interface for Index Network"
```

Expected: `✓ Created repository indexnetwork/cli on GitHub`

- [ ] **Step 3: Verify both repos exist and are empty**

```bash
gh api repos/indexnetwork/protocol/contents/ 2>&1 | head -3
gh api repos/indexnetwork/cli/contents/ 2>&1 | head -3
```

Expected: both return 404 `"This repository is empty."` or similar. (Empty repos return 404 on contents.)

---

### Task 3: Seed indexnetwork/protocol with packages/protocol/ history

**Files:**
- No file changes — git operations only

- [ ] **Step 1: Split packages/protocol/ history into temp branch**

This may take 30–60 seconds — git is rewriting commits.

```bash
git subtree split --prefix=packages/protocol -b temp/protocol-split
```

Expected: outputs a SHA like `a1b2c3d...` — the tip of the extracted history.

- [ ] **Step 2: Push to indexnetwork/protocol**

```bash
git push https://github.com/indexnetwork/protocol.git temp/protocol-split:main
```

Expected: `Branch 'temp/protocol-split' set up to track remote branch 'main'` and `* [new branch] temp/protocol-split -> main`.

- [ ] **Step 3: Delete temp branch**

```bash
git branch -d temp/protocol-split
```

Expected: `Deleted branch temp/protocol-split`.

- [ ] **Step 4: Verify remote repo has content**

```bash
gh api repos/indexnetwork/protocol/contents/ --jq '.[].name' | head -10
```

Expected: lists files from `packages/protocol/` root (e.g. `package.json`, `src`, `tsconfig.json`).

---

### Task 4: Seed indexnetwork/cli with packages/cli/ history

**Files:**
- No file changes — git operations only

- [ ] **Step 1: Split packages/cli/ history into temp branch**

```bash
git subtree split --prefix=packages/cli -b temp/cli-split
```

Expected: outputs a SHA — the tip of the extracted `packages/cli/` history.

- [ ] **Step 2: Push to indexnetwork/cli**

```bash
git push https://github.com/indexnetwork/cli.git temp/cli-split:main
```

Expected: `* [new branch] temp/cli-split -> main`.

- [ ] **Step 3: Delete temp branch**

```bash
git branch -d temp/cli-split
```

Expected: `Deleted branch temp/cli-split`.

- [ ] **Step 4: Verify remote repo has content**

```bash
gh api repos/indexnetwork/cli/contents/ --jq '.[].name' | head -10
```

Expected: lists files from `packages/cli/` root (e.g. `package.json`, `src`, `bin`, `scripts`, `npm`).

---

### Task 5: Extend pre-push hook with protocol and cli sync

**Files:**
- Modify: `scripts/hooks/pre-push`

The current hook has one sync block inlined for claude-plugin. Refactor to a `sync_subtree` function and add two new calls.

- [ ] **Step 1: Replace pre-push hook content**

Replace the entire content of `scripts/hooks/pre-push` with:

```bash
#!/usr/bin/env bash
# Syncs subtrees to their upstream repos when pushing dev to upstream.
# Runs automatically — no manual subtree push needed.

PLUGIN_REMOTE="https://github.com/indexnetwork/claude-plugin.git"
PROTOCOL_REMOTE="https://github.com/indexnetwork/protocol.git"
CLI_REMOTE="https://github.com/indexnetwork/cli.git"

sync_subtree() {
  local prefix="$1"
  local remote="$2"
  local range="$3"

  if ! git log --oneline "$range" -- "$prefix/" 2>/dev/null | grep -q .; then
    return
  fi

  echo "[pre-push] $prefix/ changed — syncing to $remote..."
  if git subtree push --prefix="$prefix" "$remote" main 2>&1; then
    echo "[pre-push] ✓ synced to $remote"
  else
    echo "[pre-push] ✗ sync failed — run manually: git subtree push --prefix=$prefix $remote main" >&2
    # Warn but don't block the main push
  fi
}

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

  sync_subtree "packages/claude-plugin" "$PLUGIN_REMOTE" "$range"
  sync_subtree "packages/protocol" "$PROTOCOL_REMOTE" "$range"
  sync_subtree "packages/cli" "$CLI_REMOTE" "$range"
done

exit 0
```

- [ ] **Step 2: Verify the hook is executable**

```bash
ls -la scripts/hooks/pre-push
```

Expected: file permissions include `-rwxr-xr-x` (executable). If not:

```bash
chmod +x scripts/hooks/pre-push
```

- [ ] **Step 3: Smoke-test the hook parses correctly**

```bash
bash -n scripts/hooks/pre-push && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/hooks/pre-push
git commit -m "chore: extend pre-push hook to sync packages/protocol and packages/cli subtrees"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

The existing `### Plugin (subtree)` section covers only `packages/claude-plugin/`. Rename it to `### Subtrees` and add entries for protocol and cli.

- [ ] **Step 1: Replace the Plugin (subtree) section**

Find the `### Plugin (subtree)` section (currently lines ~87–99) in `CLAUDE.md` and replace it with the following (use triple-backtick fences for each bash block):

Section header and intro:
```
### Subtrees

Three packages are git subtrees tracked to external repos. **Syncing is automatic** — the `scripts/hooks/pre-push` hook detects commits touching each prefix and runs `git subtree push` whenever you push `dev` to `upstream`.
```

Then three subsections — `#### packages/claude-plugin/ → indexnetwork/claude-plugin`, `#### packages/protocol/ → indexnetwork/protocol`, `#### packages/cli/ → indexnetwork/cli` — each with a prose line and a bash block containing the manual push and pull commands:

claude-plugin prose: `Contains **skills only** (markdown files) — no code, no build step. Checked in as regular files — no special init needed after cloning.`
claude-plugin commands:
```bash
# Manual push if the hook failed
git subtree push --prefix=packages/claude-plugin https://github.com/indexnetwork/claude-plugin.git main

# Pull if upstream was edited directly (avoid — always edit via this repo)
git subtree pull --squash --prefix=packages/claude-plugin https://github.com/indexnetwork/claude-plugin.git main
```

protocol prose: `The \`@indexnetwork/protocol\` npm package (agent graphs, interfaces, tools). Two-way: edit here or in the external repo.`
protocol commands:
```bash
# Manual push if the hook failed
git subtree push --prefix=packages/protocol https://github.com/indexnetwork/protocol.git main

# Pull if external repo was edited directly
git subtree pull --squash --prefix=packages/protocol https://github.com/indexnetwork/protocol.git main
```

cli prose: `The \`@indexnetwork/cli\` npm package (CLI binary). Two-way: edit here or in the external repo.`
cli commands:
```bash
# Manual push if the hook failed
git subtree push --prefix=packages/cli https://github.com/indexnetwork/cli.git main

# Pull if external repo was edited directly
git subtree pull --squash --prefix=packages/cli https://github.com/indexnetwork/cli.git main
```

- [ ] **Step 2: Verify the section looks correct**

```bash
grep -n "Subtrees\|subtree\|indexnetwork/protocol\|indexnetwork/cli\|indexnetwork/claude-plugin" CLAUDE.md
```

Expected: shows the new section header and all three remotes referenced.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with subtree sync docs for packages/protocol and packages/cli"
```

---

### Task 7: Verify end-to-end

**Files:**
- No changes

- [ ] **Step 1: Confirm both remote repos have the expected root files**

```bash
gh api repos/indexnetwork/protocol/contents/ --jq '[.[].name]'
gh api repos/indexnetwork/cli/contents/ --jq '[.[].name]'
```

Expected for protocol: `["src","package.json","tsconfig.json",...]`
Expected for cli: `["src","bin","scripts","npm","package.json",...]`

- [ ] **Step 2: Confirm backend-legacy is intact**

```bash
gh repo view indexnetwork/backend-legacy --json name,pushedAt -q '{name:.name, pushedAt:.pushedAt}'
```

Expected: `{"name":"backend-legacy","pushedAt":"..."}` (non-empty pushedAt confirms history is preserved).

- [ ] **Step 3: Confirm hook would detect a protocol change**

Simulate what the hook does for a fake range touching packages/protocol/:

```bash
# Check the last commit that touched packages/protocol/
git log --oneline -1 -- packages/protocol/
```

Expected: shows a recent commit SHA and message.

- [ ] **Step 4: Push dev to upstream**

```bash
git push upstream dev
```

Expected: pre-push hook runs, checks all three prefixes against the push range. Since we just added a commit touching CLAUDE.md (not the subtrees), all three sync_subtree calls should skip silently. Output should look like a normal push with no `[pre-push]` lines (or only the skip-silent behavior).

- [ ] **Step 5: Delete the superpowers spec and plan**

```bash
git rm docs/superpowers/specs/2026-04-06-subtree-sync-protocol-cli.md
git rm docs/superpowers/plans/2026-04-06-subtree-sync-protocol-cli.md
git commit -m "chore: remove subtree sync spec and plan after implementation"
```
