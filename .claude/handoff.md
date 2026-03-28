---
trigger: "IND-214: Add missing ownership/scope guards in createUserDatabase and createSystemDatabase"
type: fix
branch: fix/adapter-scope-guards
base-branch: dev
created: 2026-03-28
linear-issue: IND-214
---

## Related Files
- protocol/src/adapters/database.adapter.ts (createUserDatabase ~line 4955, createSystemDatabase ~line 5078)
- protocol/src/adapters/tests/user-database.spec.ts
- protocol/src/adapters/tests/system-database.spec.ts

## Relevant Docs
None — knowledge base does not cover this area yet.

## Related Issues
- IND-214 Add missing ownership/scope guards in createUserDatabase and createSystemDatabase (Triage)

## Scope

### createUserDatabase — add ownership guards to 6 methods

Methods that currently forward raw IDs without verifying `intent.userId === authUserId` or equivalent ownership:

1. `getIntentForIndexing(intentId)` — should verify intent ownership before returning
2. `getIndexIdsForIntent(intentId)` — should verify intent ownership
3. `isIntentAssignedToIndex(intentId, indexId)` — should verify intent ownership
4. `softDeleteIndex(indexId)` — should verify caller owns the index before deleting
5. `getOpportunity(id)` — should verify opportunity belongs to authenticated user
6. `updateOpportunityStatus(id, status)` — should verify opportunity belongs to authenticated user

Pattern to follow: fetch entity, compare userId to authUserId, throw on mismatch (same pattern used by getIntent, updateIntent, archiveIntent, etc.)

### createSystemDatabase — review and guard or document 8 methods

Methods bypassing `verifyScope`/`verifySharedIndex`:

1. `getIntent(intentId)` — forward without scope check
2. `isIndexMember(indexId, userId)` — forward without scope check
3. `isIndexOwner(indexId, userId)` — forward without scope check
4. `addMemberToIndex(indexId, userId, role)` — forward without scope check
5. `removeMemberFromIndex(indexId, userId)` — forward without scope check
6. `createOpportunityAndExpireIds(data, expireIds)` — forward without scope check
7. `expireOpportunitiesByIntent(intentId)` — forward without scope check
8. `expireOpportunitiesForRemovedMember(indexId, userId)` — forward without scope check

Some may be intentionally unscoped (e.g., system-level operations called from queues). For each: add verifyScope/verifySharedIndex where appropriate, or add explicit TSDoc documenting why the method is intentionally unscoped.

### Tests
- Update existing tests in user-database.spec.ts and system-database.spec.ts that currently assert pass-through behavior to instead assert guard enforcement
- Add new test cases for the guard paths (access denied scenarios)
