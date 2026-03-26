---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Present options → Execute choice → Clean up → Evaluate CLAUDE.md.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3: Present Options

Present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 4: Execute Choice

#### Option 1: Merge Locally

```bash
# Switch to base branch
git checkout <base-branch>

# Pull latest — ALWAYS use --merge (never --rebase) to preserve commit SHAs
# Rebase rewrites SHAs, which prevents GitHub from auto-closing open PRs
git pull --merge

# Merge feature branch
git merge <feature-branch>

# Verify tests on merged result
<test command>

# If tests pass
git branch -d <feature-branch>
```

**If a Linear issue is tracked:** Use tracking-linear-issues Step 3 — set Done manually (no PR = no auto-Done).

Then: Cleanup worktree (Step 5)

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**If a Linear issue is tracked:** Use tracking-linear-issues Step 2 — attach PR link and set In Review.

Then: Cleanup worktree (Step 5)

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

Then: Cleanup worktree (Step 5)

### Step 5: Cleanup Worktree

**For Options 1, 2, 4:**

Check if in worktree:
```bash
git worktree list | grep $(git branch --show-current)
```

If yes:
```bash
git worktree remove <worktree-path>
```

**For Option 3:** Keep worktree.

### Step 6: Evaluate CLAUDE.md

**After executing the chosen option (except Option 4: Discard), evaluate whether the project's CLAUDE.md should be updated.**

Review the branch diff against base:
```bash
git diff <base-branch>...<feature-branch> --stat
git diff <base-branch>...<feature-branch>
```

**Look for changes that indicate new project conventions:**
- New tooling, scripts, or dev commands added
- New architectural patterns or directory structures introduced
- Non-obvious conventions the team should follow
- Dependencies with specific configuration requirements
- Testing patterns or setup that future work should know about

**If updates are warranted, present them:**
```
Based on the changes in this branch, I recommend updating CLAUDE.md:

- [Specific addition/change and why]
- [Specific addition/change and why]

Should I apply these updates?
```

**If no updates needed:** Say nothing — don't announce that CLAUDE.md is fine.

**Skip this step for Option 4** (work was discarded, nothing to learn from).

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch | Evaluate CLAUDE.md |
|--------|-------|------|---------------|----------------|-------------------|
| 1. Merge locally | ✓ | - | - | ✓ | ✓ |
| 2. Create PR | - | ✓ | ✓ | - | ✓ |
| 3. Keep as-is | - | - | ✓ | - | ✓ |
| 4. Discard | - | - | - | ✓ (force) | - |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 4 structured options

**Automatic worktree cleanup**
- **Problem:** Remove worktree when might need it (Option 2, 3)
- **Fix:** Only cleanup for Options 1 and 4

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

**Using `--rebase` when pulling upstream changes**
- **Problem:** Rebase rewrites commit SHAs — GitHub can't match them to the PR branch, so open PRs are not auto-closed after push
- **Fix:** Always use `git pull --merge` (never `--rebase`) when integrating upstream changes during Option 1

**Skipping CLAUDE.md evaluation**
- **Problem:** Learned conventions lost, next session repeats mistakes
- **Fix:** Always review diff for new patterns worth documenting

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only
- Evaluate CLAUDE.md after Options 1, 2, 3

## Integration

**Called by:**
- **subagent-driven-development** (Step 7) - After all tasks complete
- **executing-plans** (Step 5) - After all batches complete

**Pairs with:**
- **using-git-worktrees** - Cleans up worktree created by that skill
- **tracking-linear-issues** - Updates Linear issue status on PR creation (In Review) or local merge (Done)
