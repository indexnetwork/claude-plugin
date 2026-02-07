# Index Network Protocol: Business Logic and Behaviour

This document describes **what the protocol does** from a business-logic perspective: core concepts, flows, constraints, and how the main pieces fit together. It is derived from the codebase, existing docs, and the architecture described in HOWITWORKS.md and README.md.

---

## 1. What the Protocol Is

**Index Network** is a **private, intent-driven discovery protocol**. Its purpose is to help people connect based on *what they want* (intents) rather than only *who they are* (profiles). Connections are surfaced as **opportunities**—legible coordination points where aligned intents, trust, timing, and expected value make it rational for both parties to act.

- **Intent-driven**: Users express goals and needs (e.g. “find a React co-founder”, “get help with fundraising”). These are first-class entities with lifecycle, quality checks, and semantic embeddings.
- **Privacy by design**: Content is organised into **indexes** (communities/contexts) with granular permissions. A single intent can live in multiple indexes; discovery is **index-scoped** so users control where their intents are visible.
- **Agent-mediated**: AI agents (LangGraph workflows) handle intent extraction, verification, profile generation, opportunity discovery, and indexing. The chat interface is an agent that orchestrates these workflows via tools.

Within a **shared index**, members can see each other's intents (those shared in that index). When the system suggests a **connection** (opportunity), you see **agent-synthesised descriptions** (why it might be relevant to you), not the other party's intent text in that suggestion—that separation applies to opportunity presentation only.

---

## 2. Core Concepts

| Concept | Meaning |
|--------|--------|
| **User** | Identity (Privy auth). Has at most one **user profile** and many **intents**. Member of zero or more **indexes**. |
| **Intent** | An expression of what someone is seeking or offering (e.g. “looking for ML collaborators”). Stored as payload + optional summary, with embedding, semantic governance fields (entropy, felicity, speech-act type), and status (ACTIVE, PAUSED, FULFILLED, EXPIRED). Can be linked to many indexes via **intent_indexes**. |
| **Index** | A context/community (e.g. “AI Research Network”). Has title, optional prompt (what belongs here), join policy, and members with roles (owner/admin/member). **Discovery is only between intents that share an index.** |
| **Profile** | User’s constitutive context: identity (name, bio, location), narrative, attributes (skills, interests), plus vector embedding and optional HyDE description/embedding. Used for verification (does this user have “authority” for this intent?) and for opportunity search. |
| **Opportunity** | A suggested connection between two parties in a given index. Contains detection metadata, actors (source + candidate with roles), interpretation (summary, confidence, signals), context (indexId, triggeringIntentId), and **status**: latent → pending → viewed | accepted | rejected | expired. |
| **HyDE** | Hypothetical Document Embeddings: generated “ideal match” text per strategy (mirror, reciprocal, mentor, etc.), then embedded for semantic search. Used so discovery can match *intent* or *query* to *intents* (or profiles) in a richer way than raw embedding similarity. |

---

## 3. Business Logic Flows

### 3.1 Intent Lifecycle

**Create / Update / Delete** intents are handled by the **Intent Graph** (see `graphs/intent/README.md`).

- **Create**: prep (load active intents for user/index) → **inference** (ExplicitIntentInferrer extracts intents from input) → **verification** (SemanticVerifier: felicity conditions; low-quality intents dropped) → **reconciler** (IntentReconciler: create/update/expire) → **executor** (DB: createIntent, updateIntent, archiveIntent).
- **Update**: same pipeline with operation mode `update` and optional `targetIntentIds`; verification only if new intents are inferred.
- **Delete**: prep → reconciler → executor (no inference/verification).

Inputs include `userId`, `userProfile` (for verification), `inputContent`, `operationMode`, optional `indexId` (scope), and optional `conversationContext` (for anaphora). Outputs include `actions`, `executionResults`, `inferredIntents`, `verifiedIntents`.

**Index assignment** (which intents appear in which index) is separate:

- Intent–index assignment is **not** event-driven. There are no intent lifecycle events (onCreated/onUpdated) that trigger queue jobs. Instead, the **Index Graph** is run when the user acts in chat: **create_intent_index** (add this intent to an index) and **delete_intent_index** (remove it). The graph does prep → evaluate (IntentIndexer or auto-assign) → execute (assign or unassign).

So: **intent content lifecycle** = Intent Graph; **intent–index membership** = Index Graph, triggered only by user actions in chat (or equivalent API).

### 3.2 Profile Lifecycle

The **Profile Graph** (see `graphs/profile/README.md`) has two modes:

- **Query**: load existing profile only (no generation/embedding).
- **Write**: check_state → optionally scrape (if profile missing and no user input) → generate_profile (ProfileGenerator) when missing or on forceUpdate → embed_save_profile → generate_hyde (HydeGenerator) → embed_save_hyde. Steps are skipped when data already exists.

Profile is used by the Intent Graph (userProfile for verification), by the Opportunity Graph (source/candidate context for evaluation), and by the chat (read_user_profiles, create_user_profile, update_user_profile). Update/delete from chat go through **confirmation** (pending confirmation → user confirms → confirm_action or cancel_action). **Profile updates do not trigger opportunity discovery**; opportunities are only created when users ask for them or create them explicitly in chat.

### 3.3 Index and Intent–Index Assignment

- **Indexes** are created/updated/deleted via API or chat (create_index, update_index, delete_index). Each index has members (index_members) with permissions and optional per-member prompt and autoAssign.
- **Intent–index assignment**: The **Index Graph** takes `intentId` and `indexId`, loads intent and index/member context, runs **IntentIndexer** (or skips evaluation if no prompts), then assigns or unassigns the intent to the index. It is invoked from chat tools (create_intent_index, delete_intent_index) when the user asks to add or remove an intent from an index.

So: **index membership** is managed by index/API; **which intents show up in which index** is decided by the Index Graph when the user acts in chat.

### 3.4 Opportunity Lifecycle and Discovery

**Lifecycle** (see `docs/Latent Opportunity Lifecycle.md`):

- **latent**: Agent created the opportunity; only the source (or introducer) sees it. No notification to the candidate.
- **pending**: Source “sends” the opportunity → notification to candidate.
- **viewed**: Candidate opened it.
- **accepted** / **rejected** / **expired**: Resolution.

Rules: opportunities are created in **latent** by the agent; the user explicitly **sends** to move to pending. Discovery is **index-scoped**: only intents that share an index can participate. **When do opportunities get created?** Only when users ask for them (e.g. “find me opportunities” → create_opportunities) or create them explicitly in chat (e.g. “introduce Alice and Bob” → create_opportunity_between_members). There is no background or event-driven opportunity discovery (e.g. no trigger on profile update or intent create).

**Discovery flow** (Opportunity Graph, see `graphs/opportunity/README.md`):

1. **Prep**: User’s index memberships and active intents. If none → early exit.
2. **Scope**: Which indexes to search (single indexId or all user indexes).
3. **Discovery**: HyDE from search query (or intent/profile) → vector search within target indexes → candidate intent matches.
4. **Evaluation**: OpportunityEvaluator scores and summarizes each candidate (dual synthesis for source and candidate).
5. **Ranking**: Sort by score, limit, dedupe by (sourceUser, candidateUser, index).
6. **Persist**: Create opportunity records with `initialStatus` (e.g. `latent` for drafts).

Chat tools: **create_opportunities** invokes this graph (optionally with indexId); **list_my_opportunities** lists the user’s opportunities; **send_opportunity** promotes latent → pending and triggers notifications. Notifications are handled by the notification job (e.g. WebSocket or email by priority).

### 3.5 Chat as Orchestration

The **Chat Graph** is a ReAct-style loop (see `graphs/chat/README.md`): one **agent_loop** node where the LLM repeatedly decides to call tools or to respond. Tools are the bridge to the rest of the protocol:

- **Profile**: read_user_profiles, create_user_profile, update_user_profile (→ Profile Graph).
- **Intent**: read_intents, create_intent, update_intent, delete_intent (→ Intent Graph). create_intent_index, read_intent_indexes, delete_intent_index (→ Index Graph for assignment).
- **Index**: read_indexes, create_index, update_index, delete_index, create_index_membership, read_users.
- **Discovery**: create_opportunities (→ Opportunity Graph), list_my_opportunities, create_opportunity_between_members (curator flow: “introduce Alice and Bob” in chat). Manual/curator opportunities are created through AI chat only; the `POST /indexes/:indexId/opportunities` API exists for testing, not as the main product flow.
- **Safety**: confirm_action, cancel_action for pending update/delete.
- **Utility**: scrape_url (e.g. for profile or intent from a link).

When the chat is **index-scoped** (session has indexId), index-aware tools default to that index. Update/delete tools do not execute immediately; they set a pending confirmation and return needsConfirmation; the agent asks the user, then calls confirm_action or cancel_action.

---

## 4. Key Constraints and Invariants

- **Index-scoped discovery**: Opportunities are only created between intents that share at least one index. Non-indexed intents do not participate in opportunity discovery.
- **Dual synthesis**: Each opportunity carries an interpretation *for the source* and *for the candidate*. In the opportunity card, each side sees an agent-generated summary (why this connection might be valuable to them), not the other's raw intent. Within a shared index, members can still see one another's intents (those shared in that index).
- **Agent creates, user sends**: Opportunities are created in latent state; the user (or introducer) explicitly sends to move to pending and trigger notifications.
- **Destructive actions require confirmation**: In chat, update_intent, delete_intent, update_user_profile, update_index, delete_index only run after the user confirms via confirm_action.
- **Intent quality**: Intents are verified (SemanticVerifier) against felicity conditions; vague or invalid intents can be dropped or trigger elaboration flows (see Semantic Governance docs).
- **Opportunity status is sufficient**: There is no separate “connection” state machine or user_connection_events flow. Opportunity status (latent → pending → viewed → accepted | rejected | expired) carries the full lifecycle; no additional connection primitive is needed.

---

## 5. Data Model (Summary)

- **users**: Identity (Privy), email, name, intro, avatar, location, socials, onboarding, etc.
- **user_profiles**: userId (unique), identity, narrative, attributes, embedding, hydeDescription, hydeEmbedding, implicitIntents.
- **intents**: payload, summary, status, userId, sourceId/sourceType, embedding, semanticEntropy, referentialAnchor, intentMode, speechActType, felicityAuthority, felicitySincerity, archivedAt.
- **indexes**: title, prompt, isPersonal, permissions (joinPolicy, invitationLink, etc.).
- **index_members**: indexId, userId, permissions, prompt, autoAssign, metadata.
- **intent_indexes**: intentId, indexId (many-to-many).
- **opportunities**: detection, actors, interpretation, context (indexId, etc.), confidence, status (latent | pending | viewed | accepted | rejected | expired), expiresAt.
- **hyde_documents**: sourceType, sourceId, sourceText, strategy, targetCorpus, hydeText, hydeEmbedding, expiresAt.
- **chat_sessions** / **chat_messages**: Persisted conversation for the chat graph; session can store indexId for scope.

(Full schema: `protocol/src/schemas/database.schema.ts`.)

---

## 6. Related Documentation

- **HOWITWORKS.md** (repo root): Technical architecture, opportunity model, HyDE strategies, API, future TEE/XMTP.
- **README.md** (repo root): Product overview, getting started, high-level architecture.
- **CLAUDE.md**: Development commands, architecture overview, conventions.
- **graphs/README.md**: Table of all graphs (Chat, HyDE, Index, Intent, Opportunity, Profile) with links to each graph’s README.
- **Latent Opportunity Lifecycle.md**: Opportunity states, index-scoped discovery, chat tools behaviour.
- **The Semantic Intersection of Profile, Intent and Opportunity.md**: Conceptual link between profile (authority), intent (commissive/directive), and opportunity (satisfaction).
- **Semantic Governance Database Schemas for Active Intent Architecture.md**: Conceptual schema and governance (entropy, felicity, referential anchoring).
- **INDEX-MANAGEMENT-AGENTIC-ARCHITECTURE.md**: Index Graph, processIntentForIndex; note that intent events and intent queue described there are no longer used—index assignment is chat-driven only.
