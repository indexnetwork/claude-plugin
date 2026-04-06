---
title: "Git subtree sync for packages/protocol/ and packages/cli/"
type: spec
tags: [git, subtree, protocol, cli, sync]
created: 2026-04-06
updated: 2026-04-06
---

## Goal

Add `packages/protocol/` and `packages/cli/` as git subtrees tracking `indexnetwork/protocol` and `indexnetwork/cli` respectively, with automatic push on `upstream/dev` push — matching the existing `packages/claude-plugin/` pattern.

## Architecture

Both packages already exist in the monorepo. The setup extracts their commit history via `git subtree split`, seeds new GitHub repos with that history, then extends the pre-push hook to auto-sync on push. Two-way sync: auto-push via hook, manual pull via `git subtree pull --squash`.

## GitHub Repos

| Action | Repo |
|---|---|
| Rename | `indexnetwork/protocol` → `indexnetwork/backend-legacy` |
| Create | `indexnetwork/protocol` (empty, public) |
| Create | `indexnetwork/cli` (empty, public) |

`indexnetwork/protocol` currently contains the old backend app (Dockerfile, Prisma, etc.) and must be renamed before the new repo is created.

## Initial Subtree Setup

For each package, since the files already live in the monorepo, no `git subtree add` is needed. The one-time setup is:

```bash
# packages/protocol/
git subtree split --prefix=packages/protocol -b temp/protocol-split
git push https://github.com/indexnetwork/protocol.git temp/protocol-split:main
git branch -d temp/protocol-split

# packages/cli/
git subtree split --prefix=packages/cli -b temp/cli-split
git push https://github.com/indexnetwork/cli.git temp/cli-split:main
git branch -d temp/cli-split
```

## Pre-push Hook Changes

`scripts/hooks/pre-push` is extended with two new sync blocks, identical in structure to the existing `claude-plugin` block:

```bash
PROTOCOL_REMOTE="https://github.com/indexnetwork/protocol.git"
CLI_REMOTE="https://github.com/indexnetwork/cli.git"
```

For each remote, on push to `upstream/dev`:
1. Check if any commit in the push range touches the subtree prefix.
2. If yes, run `git subtree push --prefix=<prefix> <remote> main`.
3. Print `✓ synced` or `✗ failed` (non-blocking — failure warns but never blocks the main push).

## CLAUDE.md Changes

Add a subsection for each new subtree under the existing Plugin subtree section. Each entry documents:
- The upstream remote URL
- The auto-sync behavior (pre-push hook)
- Manual push command (fallback if hook failed)
- Manual pull command (two-way sync from external)

```bash
# Manual push if hook failed
git subtree push --prefix=packages/protocol https://github.com/indexnetwork/protocol.git main
git subtree push --prefix=packages/cli https://github.com/indexnetwork/cli.git main

# Pull if external repo was edited directly
git subtree pull --squash --prefix=packages/protocol https://github.com/indexnetwork/protocol.git main
git subtree pull --squash --prefix=packages/cli https://github.com/indexnetwork/cli.git main
```

## Constraints

- `indexnetwork/backend-legacy` rename must happen before creating the new `indexnetwork/protocol` repo.
- Subtree split may be slow on `packages/protocol/` (many commits touching it); this is expected.
- The pre-push hook must not block the main push if subtree sync fails.
- `packages/cli/npm/` platform sub-packages are included in the `packages/cli/` subtree — no exclusions.
- Pull commands use `--squash` to keep monorepo history readable.

## Acceptance Criteria

1. `indexnetwork/protocol` (new) contains the extracted history of `packages/protocol/`.
2. `indexnetwork/cli` contains the extracted history of `packages/cli/`.
3. Pushing `dev` to `upstream` auto-syncs both subtrees if touched.
4. `git subtree pull --squash` works for both subtrees.
5. CLAUDE.md documents pull and manual push commands for both new subtrees.
6. `indexnetwork/backend-legacy` is the renamed old repo (accessible, not deleted).
