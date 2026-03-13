# Onboarding Network Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the text-only communities step in onboarding with an interactive network card panel matching the in-app Networks/Discover UI, showing both joinable and already-joined networks.

**Architecture:** A new `OnboardingNetworkPanel` component is injected inline into the message list when `onboardingStep === "communities"`. It fetches public networks independently and reads joined networks from context. Join clicks send chat messages to the agent. The system prompt is updated to stop listing communities as text.

**Tech Stack:** React, TypeScript, Radix UI primitives, IndexAvatar, Lucide icons, `useIndexesState` context, `indexesService.discoverPublicIndexes()`

---

### Task 1: Create `OnboardingNetworkPanel` component

**Files:**
- Create: `frontend/src/components/onboarding/OnboardingNetworkPanel.tsx`

**Step 1: Create the file**

```tsx
import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import IndexAvatar from "@/components/IndexAvatar";
import { Button } from "@/components/ui/button";
import { useIndexes } from "@/contexts/APIContext";
import { useIndexesState } from "@/contexts/IndexesContext";
import type { Index } from "@/lib/types";

interface OnboardingNetworkPanelProps {
  onJoin: (networkId: string, networkTitle: string) => void;
  pendingJoinIds: Set<string>;
}

export default function OnboardingNetworkPanel({
  onJoin,
  pendingJoinIds,
}: OnboardingNetworkPanelProps) {
  const indexesService = useIndexes();
  const { indexes: joinedIndexes } = useIndexesState();

  const [publicNetworks, setPublicNetworks] = useState<(Index & { isMember?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    indexesService
      .discoverPublicIndexes(1, 50)
      .then((res) => setPublicNetworks(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [indexesService]);

  const joinedIds = new Set(joinedIndexes.filter((i) => !i.isPersonal).map((i) => i.id));

  const joinable = publicNetworks.filter((n) => !joinedIds.has(n.id));
  const joined = publicNetworks.filter((n) => joinedIds.has(n.id));

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (publicNetworks.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-gray-400">No public networks available</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#E8E8E8] bg-[#FAFAFA] overflow-hidden">
      {joined.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-medium">
            Joined
          </p>
          <div className="divide-y divide-gray-100">
            {joined.map((network) => (
              <div key={network.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
                  <IndexAvatar id={network.id} title={network.title} imageUrl={network.imageUrl} size={36} rounded="full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-black truncate">{network.title}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3" />
                    {network._count?.members ?? 0} members
                  </p>
                </div>
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-sm font-medium flex-shrink-0">
                  Joined
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {joinable.length > 0 && (
        <div>
          {joined.length > 0 && <div className="border-t border-gray-100" />}
          <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-medium">
            Discover
          </p>
          <div className="divide-y divide-gray-100">
            {joinable.map((network) => {
              const isPending = pendingJoinIds.has(network.id);
              return (
                <div key={network.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
                    <IndexAvatar id={network.id} title={network.title} imageUrl={network.imageUrl} size={36} rounded="full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-black truncate">{network.title}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Users className="w-3 h-3" />
                      {network._count?.members ?? 0} members
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onJoin(network.id, network.title)}
                    disabled={isPending}
                    className="text-xs h-7 flex-shrink-0"
                  >
                    {isPending ? "Joining…" : "Join"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/onboarding/OnboardingNetworkPanel.tsx
git commit -m "feat(onboarding): add OnboardingNetworkPanel component"
```

---

### Task 2: Inject panel into `OnboardingPage` message list

**Files:**
- Modify: `frontend/src/app/onboarding/page.tsx`

**Step 1: Add `pendingJoinIds` state and `handleJoin` callback**

At the top of `OnboardingPage`, after the existing state declarations, add:

```tsx
const [pendingJoinIds, setPendingJoinIds] = useState<Set<string>>(new Set());

const handleNetworkJoin = useCallback(
  (networkId: string, networkTitle: string) => {
    setPendingJoinIds((prev) => new Set([...prev, networkId]));
    sendOnboardingMessage(`I'd like to join ${networkTitle}`);
  },
  [sendOnboardingMessage],
);
```

**Step 2: Add import for `OnboardingNetworkPanel`**

At the top of the file, add:

```tsx
import OnboardingNetworkPanel from "@/components/onboarding/OnboardingNetworkPanel";
```

**Step 3: Inject the panel after the last assistant message**

In the JSX, find the message list render (the `allMessages.map(...)` block). After the closing `</div>` of that block and before `<div ref={scrollRef} />`, add:

```tsx
{onboardingStep === "communities" && !isLoading && (
  <div className="pl-0 pr-4 max-w-[90%]">
    <OnboardingNetworkPanel
      onJoin={handleNetworkJoin}
      pendingJoinIds={pendingJoinIds}
    />
  </div>
)}
```

**Step 4: Update `ONBOARDING_STEP_SUGGESTIONS` for the communities step**

Find the `communities` key in `ONBOARDING_STEP_SUGGESTIONS` and replace it:

```tsx
communities: [
  { label: "Continue", type: "direct", followupText: "I'll skip joining networks for now, let's continue" },
],
```

**Step 5: Verify the page renders without errors**

Run the dev server (`bun run dev` from repo root, select the active branch) and navigate to `/onboarding`. Confirm the panel appears when the communities message is shown.

**Step 6: Commit**

```bash
git add frontend/src/app/onboarding/page.tsx
git commit -m "feat(onboarding): inject network panel at communities step"
```

---

### Task 3: Update system prompt to stop listing communities as text

**Files:**
- Modify: `protocol/src/lib/protocol/agents/chat.prompt.ts` (lines ~132–142)

**Step 1: Update step 6 instruction**

Find this block in the onboarding flow (around line 132):

```
6. **Discover communities**
   - Call \`read_indexes()\` to get available public indexes (returned in \`publicIndexes\` array)
   - If public indexes exist, present them with brief relevance notes based on the user's profile
   - Example: "Here are some communities you might find interesting:
     - **AI Builders** — matches your work in ML infrastructure
     - **Founders Network** — aligns with your startup experience
     - **Open Source** — connects with your GitHub activity"
   - Ask: "Want to join any of these? You can always explore more later."
   - When presenting, you may use the index title; avoid being vocal about 'indexes' unless the user asks.
   - For each index the user wants to join → call \`create_index_membership(indexId=X)\` (omit userId to self-join)
   - After handling the user's response (joins processed, question answered, or user skips) → ALWAYS proceed to step 7 (intent capture). Do NOT end the conversation at communities.
```

Replace with:

```
6. **Discover communities**
   - Call \`read_indexes()\` to get available public indexes (returned in \`publicIndexes\` array)
   - **Do NOT list communities in text** — the UI displays them as interactive cards.
   - Say exactly: "Here are some communities you might find relevant — pick any you'd like to join, or skip and we'll continue."
   - When presenting, avoid being vocal about 'indexes' unless the user asks.
   - For each index the user wants to join → call \`create_index_membership(indexId=X)\` (omit userId to self-join)
   - After handling the user's response (joins processed, question answered, or user skips) → ALWAYS proceed to step 7 (intent capture). Do NOT end the conversation at communities.
```

**Step 2: Commit**

```bash
git add protocol/src/lib/protocol/agents/chat.prompt.ts
git commit -m "feat(onboarding): update communities prompt to defer list to UI"
```

---

### Task 4: Smoke test end-to-end

**Step 1: Reset onboarding for your test user**

```bash
cd protocol && bun run maintenance:reset-onboarding
```

(Or use the `reset-onboarding.ts` CLI directly: `bun src/cli/reset-onboarding.ts`)

**Step 2: Run dev and go through onboarding**

Start the dev server and navigate to `/onboarding`. Advance through the flow until the communities step appears. Confirm:
- [ ] The agent message is short ("Here are some communities…") — no bulleted text list
- [ ] The `OnboardingNetworkPanel` appears inline below the agent message
- [ ] "Joined" section shows any already-joined networks with badge
- [ ] "Discover" section shows joinable networks with Join button
- [ ] Clicking "Join" shows "Joining…" spinner and sends a message in the chat
- [ ] After agent processes the join, the panel updates (joined network moves to Joined section on next render)
- [ ] "Continue" chip skips the step and agent proceeds to intent capture

**Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(onboarding): network panel smoke test fixes"
```
