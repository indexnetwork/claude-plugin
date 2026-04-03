# Protocol Library Extraction Readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `protocol/src/lib/protocol/` fully self-contained — zero imports from parent `services/`, `adapters/`, `queues/`, `schemas/`, or sibling `lib/` directories — so it can be extracted to a standalone NPM package with no code changes.

**Architecture:** Define new interfaces for the 3 services currently imported directly (contact, chat-session, integration-import). Add a profile enrichment interface. Move `tools/index.ts` composition logic to a new file in `src/` that lives *outside* the protocol lib. Internalize small utilities (performance, request-context, log, streaming types) that the protocol lib uses from sibling directories.

**Tech Stack:** TypeScript, LangChain/LangGraph, Zod, Bun

---

## File Structure

### New files (inside protocol lib)

| File | Purpose |
|------|---------|
| `src/lib/protocol/interfaces/contact.interface.ts` | Interface for contact operations used by `contact.tools.ts` |
| `src/lib/protocol/interfaces/chat-session.interface.ts` | Interface for chat session message retrieval used by `chat.graph.ts` |
| `src/lib/protocol/interfaces/enrichment.interface.ts` | Interface for profile enrichment (Parallel API) used by `profile.graph.ts` and `profile.tools.ts` |
| `src/lib/protocol/support/performance.ts` | Internalized `timed()` wrapper and `Timed` decorator (copy from `src/lib/performance/`) |
| `src/lib/protocol/support/request-context.ts` | Internalized `requestContext` AsyncLocalStorage + `TraceEmitter` type |
| `src/lib/protocol/support/log.ts` | Thin logger interface + factory; concrete impl injected at init |
| `src/lib/protocol/types/chat-streaming.types.ts` | Move streaming types into protocol lib |

### New files (outside protocol lib — composition root)

| File | Purpose |
|------|---------|
| `src/protocol-init.ts` | New composition root — replaces the wiring currently in `tools/index.ts` |

### Modified files

| File | Change |
|------|--------|
| `src/lib/protocol/tools/index.ts` | Remove all imports from `adapters/`, `queues/`. Accept all deps via new `ProtocolDeps` parameter. |
| `src/lib/protocol/tools/tool.helpers.ts` | Add `contactService`, `integrationImporter`, `enricher` to `ToolDeps` |
| `src/lib/protocol/tools/contact.tools.ts` | Use `deps.contactService` instead of importing singleton |
| `src/lib/protocol/tools/integration.tools.ts` | Use `deps.integrationImporter` instead of importing `IntegrationService` |
| `src/lib/protocol/tools/profile.tools.ts` | Use `deps.enricher` instead of importing `enrichUserProfile` |
| `src/lib/protocol/graphs/chat.graph.ts` | Accept `ChatSessionReader` via constructor instead of importing `chatSessionService` |
| `src/lib/protocol/graphs/profile.graph.ts` | Accept `ProfileEnricher` via constructor instead of importing `enrichUserProfile` |
| `src/lib/protocol/interfaces/database.interface.ts` | Inline the few types currently imported from `schemas/database.schema` |
| All agents/graphs/tools using `../../performance` | Update imports to `../support/performance` |
| All agents/graphs/tools using `../../request-context` | Update imports to `../support/request-context` |
| All files using `../../../types/chat-streaming.types` | Update imports to `../types/chat-streaming.types` |
| All files using `../../log` or `../../../lib/log` | Update imports to `../support/log` |

---

## Task 1: Define Contact Service Interface

**Files:**
- Create: `protocol/src/lib/protocol/interfaces/contact.interface.ts`

This interface captures exactly the 4 methods `contact.tools.ts` calls on `contactService`.

- [ ] **Step 1: Create the interface file**

```typescript
// protocol/src/lib/protocol/interfaces/contact.interface.ts

/** Input for importing a single contact. */
export interface ContactInput {
  name: string;
  email: string;
}

/** Result of adding a single contact. */
export interface ContactResult {
  userId: string;
  isNew: boolean;
  isGhost: boolean;
}

/** Result of importing contacts in bulk. */
export interface ContactImportResult {
  imported: number;
  skipped: number;
  newContacts: number;
  existingContacts: number;
  details: Array<{ email: string; userId: string; isNew: boolean }>;
}

/** Contact with user details, as returned by listContacts. */
export interface ContactEntry {
  userId: string;
  user: { id: string; name: string; email: string; avatar: string | null; isGhost: boolean };
}

/**
 * Contact management operations used by chat tools.
 * Consumers must provide a concrete implementation (e.g. backed by ContactService).
 */
export interface ContactServiceAdapter {
  importContacts(ownerId: string, contacts: ContactInput[]): Promise<ContactImportResult>;
  listContacts(ownerId: string): Promise<ContactEntry[]>;
  addContact(ownerId: string, email: string, options?: { name?: string; restore?: boolean }): Promise<ContactResult>;
  removeContact(ownerId: string, contactUserId: string): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/interfaces/contact.interface.ts
git commit -m "feat(protocol): add ContactServiceAdapter interface for DI"
```

---

## Task 2: Define Chat Session Reader Interface

**Files:**
- Create: `protocol/src/lib/protocol/interfaces/chat-session.interface.ts`

This interface captures the single method `chat.graph.ts` calls on `chatSessionService`.

- [ ] **Step 1: Create the interface file**

```typescript
// protocol/src/lib/protocol/interfaces/chat-session.interface.ts

import type { BaseMessage } from "@langchain/core/messages";

/**
 * Minimal interface for reading chat session messages.
 * Used by ChatGraphFactory to load conversation history.
 */
export interface ChatSessionReader {
  getSessionMessages(sessionId: string, limit?: number): Promise<Array<{
    role: string;
    content: string;
  }>>;
}
```

Note: Check what `chatSessionService.getSessionMessages` actually returns and match the shape. The graph converts them to LangChain messages anyway.

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/interfaces/chat-session.interface.ts
git commit -m "feat(protocol): add ChatSessionReader interface for DI"
```

---

## Task 3: Define Profile Enrichment Interface

**Files:**
- Create: `protocol/src/lib/protocol/interfaces/enrichment.interface.ts`

This interface abstracts the `enrichUserProfile` function from the Parallel API.

- [ ] **Step 1: Create the interface file**

```typescript
// protocol/src/lib/protocol/interfaces/enrichment.interface.ts

/** Request to enrich a user profile from external data sources. */
export interface EnrichmentRequest {
  name?: string;
  email?: string;
  linkedin?: string;
  twitter?: string;
  github?: string;
  websites?: string[];
}

/** Structured profile enrichment result. */
export interface EnrichmentResult {
  identity: {
    name: string;
    bio: string;
    location: string;
  };
  narrative: {
    context: string;
  };
  attributes: {
    skills: string[];
    interests: string[];
  };
  socials: {
    linkedin?: string;
    twitter?: string;
    github?: string;
    websites?: string[];
  };
  confidentMatch: boolean;
  isHuman: boolean;
}

/**
 * Profile enrichment adapter for resolving user identity from external sources.
 * Consumers provide a concrete implementation (e.g. backed by Parallel Chat API).
 */
export interface ProfileEnricher {
  enrichUserProfile(request: EnrichmentRequest): Promise<EnrichmentResult | null>;
}
```

- [ ] **Step 2: Commit**

```bash
git add protocol/src/lib/protocol/interfaces/enrichment.interface.ts
git commit -m "feat(protocol): add ProfileEnricher interface for DI"
```

---

## Task 4: Internalize Utility — Performance

**Files:**
- Create: `protocol/src/lib/protocol/support/performance.ts`
- Modify: All agents/graphs importing `../../performance` (~25 files)

The current `timed()` and `Timed` decorator are simple wrappers around `performance.now()`. Internalize a standalone copy.

- [ ] **Step 1: Create `protocol/src/lib/protocol/support/performance.ts`**

```typescript
// protocol/src/lib/protocol/support/performance.ts

/**
 * Simple performance timing utilities for the protocol library.
 * Standalone — no external dependencies.
 */

type TimingCallback = (name: string, durationMs: number) => void;

let onTiming: TimingCallback | undefined;

/** Set a global callback for timing events (e.g. for aggregation/logging). */
export function setTimingCallback(cb: TimingCallback | undefined) {
  onTiming = cb;
}

/**
 * Wraps an async function with timing measurement.
 * Reports duration to the global timing callback if set.
 */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    onTiming?.(name, performance.now() - start);
    return result;
  } catch (err) {
    onTiming?.(name, performance.now() - start);
    throw err;
  }
}

/**
 * Method decorator that wraps an async method with timing measurement.
 * Uses `ClassName.methodName` as the timing label.
 */
export function Timed(): (target: object, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (_target: object, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = function (this: { constructor: { name: string } }, ...args: unknown[]) {
      const className = this.constructor.name;
      const name = `${className}.${propertyKey}`;
      return timed(name, () => original.apply(this, args));
    };
  };
}
```

- [ ] **Step 2: Update all imports in protocol lib**

Find all files importing from `../../performance` and change to `../support/performance`. Use find-and-replace across:
- All files in `protocol/src/lib/protocol/agents/` (~14 files)
- All files in `protocol/src/lib/protocol/graphs/` (~8 files)
- Any files in `protocol/src/lib/protocol/support/` or `tools/`

The import line changes from:
```typescript
import { timed } from "../../performance";
// or
import { Timed } from "../../performance";
```
to:
```typescript
import { timed } from "../support/performance";
// or
import { Timed } from "../support/performance";
```

Verify no remaining imports with:
```bash
cd protocol && grep -r "from.*\.\./\.\./performance" src/lib/protocol/
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/support/performance.ts
git add -u protocol/src/lib/protocol/
git commit -m "refactor(protocol): internalize performance utilities"
```

---

## Task 5: Internalize Utility — Request Context

**Files:**
- Create: `protocol/src/lib/protocol/support/request-context.ts`
- Modify: All graphs/tools importing `../../request-context` (~13 files)

- [ ] **Step 1: Create `protocol/src/lib/protocol/support/request-context.ts`**

```typescript
// protocol/src/lib/protocol/support/request-context.ts

import { AsyncLocalStorage } from "async_hooks";

/** Callback for streaming graph/agent trace events from deep inside graph nodes. */
export type TraceEmitter = (event: {
  type: "graph_start" | "graph_end" | "agent_start" | "agent_end";
  name: string;
  durationMs?: number;
  summary?: string;
}) => void;

interface RequestContext {
  originUrl?: string;
  traceEmitter?: TraceEmitter;
}

/**
 * AsyncLocalStorage for propagating request-scoped context through the protocol layer.
 * The host application is responsible for calling `requestContext.run()` to set the context.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();
```

- [ ] **Step 2: Update all imports in protocol lib**

Change all files importing from `../../request-context` to `../support/request-context`.

The import patterns are:
```typescript
// Before:
import { requestContext } from "../../request-context";
import { requestContext, type TraceEmitter } from "../../request-context";

// After:
import { requestContext } from "../support/request-context";
import { requestContext, type TraceEmitter } from "../support/request-context";
```

Files to update (verify with grep):
- `graphs/intent.graph.ts`, `intent_index.graph.ts`, `hyde.graph.ts`, `home.graph.ts`, `opportunity.graph.ts`, `profile.graph.ts`, `negotiation.graph.ts`
- `tools/integration.tools.ts`, `intent.tools.ts`, `index.tools.ts`, `opportunity.tools.ts`, `profile.tools.ts`, `contact.tools.ts`

Verify:
```bash
cd protocol && grep -r "from.*\.\./\.\./request-context" src/lib/protocol/
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/support/request-context.ts
git add -u protocol/src/lib/protocol/
git commit -m "refactor(protocol): internalize request-context"
```

---

## Task 6: Internalize Utility — Logger

**Files:**
- Create: `protocol/src/lib/protocol/support/log.ts`
- Modify: Files importing `../../log` or `../../../lib/log` inside protocol lib

The protocol lib currently imports `log` from the parent. Since `protocolLogger` in `support/protocol.logger.ts` already wraps this, we just need to ensure `protocol.logger.ts` is self-contained.

- [ ] **Step 1: Check current `protocol.logger.ts`**

Read `protocol/src/lib/protocol/support/protocol.logger.ts` and verify what it imports.

- [ ] **Step 2: Create `protocol/src/lib/protocol/support/log.ts`**

Create a minimal logger that the protocol lib owns. This should match the shape used by the few files that import `log` directly (not through `protocolLogger`).

```typescript
// protocol/src/lib/protocol/support/log.ts

export type LogMethod = (message: string, meta?: Record<string, unknown>) => void;

export interface Logger {
  verbose: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

/** Default console-based logger. Can be replaced via setLoggerFactory(). */
function createConsoleLogger(context: string, source: string): Logger {
  const prefix = `[${context}:${source}]`;
  return {
    verbose: (msg, meta) => console.debug(prefix, msg, meta ?? ''),
    debug: (msg, meta) => console.debug(prefix, msg, meta ?? ''),
    info: (msg, meta) => console.info(prefix, msg, meta ?? ''),
    warn: (msg, meta) => console.warn(prefix, msg, meta ?? ''),
    error: (msg, meta) => console.error(prefix, msg, meta ?? ''),
  };
}

type LoggerFactory = (context: string, source: string) => Logger;
let factory: LoggerFactory = createConsoleLogger;

/** Override the logger factory used by all protocol-internal logging. */
export function setLoggerFactory(f: LoggerFactory) {
  factory = f;
}

/** Create a namespaced logger for protocol internals. */
export function createLogger(context: string, source: string): Logger {
  return factory(context, source);
}

/**
 * Convenience: pre-bound logger for the 'protocol' context.
 * Usage: `const logger = log.protocol.from('MyAgent')`
 */
export const log = {
  protocol: { from: (source: string) => createLogger('protocol', source) },
  lib: { from: (source: string) => createLogger('lib', source) },
};
```

- [ ] **Step 3: Update `protocol.logger.ts` to use local log**

```typescript
// Before:
import { log } from "../../log";

// After:
import { log } from "./log";
```

- [ ] **Step 4: Update remaining direct `log` imports**

Find files importing `../../log` or `../../../lib/log` inside the protocol lib and switch to `../support/log` or `./log`.

Verify:
```bash
cd protocol && grep -rE "from.*(\.\.\/\.\.\/log|\.\.\/\.\.\/\.\.\/lib\/log)" src/lib/protocol/ --include="*.ts" | grep -v node_modules | grep -v ".spec."
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add protocol/src/lib/protocol/support/log.ts
git add -u protocol/src/lib/protocol/
git commit -m "refactor(protocol): internalize logger"
```

---

## Task 7: Internalize Streaming Types

**Files:**
- Create: `protocol/src/lib/protocol/types/chat-streaming.types.ts`
- Modify: ~11 files importing `../../../types/chat-streaming.types`

- [ ] **Step 1: Copy the streaming types file**

Copy `protocol/src/types/chat-streaming.types.ts` to `protocol/src/lib/protocol/types/chat-streaming.types.ts`.

Keep the original file in place (other parts of the codebase use it). The original can later re-export from the protocol lib if desired, but that's an extraction concern — not our problem now.

```bash
cp protocol/src/types/chat-streaming.types.ts protocol/src/lib/protocol/types/chat-streaming.types.ts
```

Check if the streaming types file imports anything from outside itself:
```bash
grep "from " protocol/src/types/chat-streaming.types.ts
```

If it has no external imports, the copy is self-contained. If it does, those imports need resolution.

- [ ] **Step 2: Update all imports in protocol lib**

Change imports from `../../../types/chat-streaming.types` to `../types/chat-streaming.types` (relative to the importing file — adjust `../` depth as needed).

Files to update:
- `states/chat.state.ts`, `home.state.ts`, `hyde.state.ts`, `intent.state.ts`, `opportunity.state.ts`, `profile.state.ts`, `intent_index.state.ts`
- `streamers/chat.streamer.ts`, `response.streamer.ts`
- `graphs/opportunity.graph.ts`
- `agents/suggestion.generator.ts`

Verify:
```bash
cd protocol && grep -r "from.*\.\./\.\./\.\./types/chat-streaming" src/lib/protocol/
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add protocol/src/lib/protocol/types/
git add -u protocol/src/lib/protocol/
git commit -m "refactor(protocol): internalize chat streaming types"
```

---

## Task 8: Inline Schema Types into Database Interface

**Files:**
- Modify: `protocol/src/lib/protocol/interfaces/database.interface.ts`

Currently imports `OpportunityDetection`, `OpportunityActor`, `OpportunityInterpretation`, `OpportunityContext`, `UserSocials`, `OnboardingState` from `../../../schemas/database.schema` and `Id` from `../../../types/common.types`.

- [ ] **Step 1: Read the imported types from database.schema**

```bash
cd protocol && grep -A 10 "export.*OpportunityDetection\|export.*OpportunityActor\|export.*OpportunityInterpretation\|export.*OpportunityContext\|export.*UserSocials\|export.*OnboardingState" src/schemas/database.schema.ts
```

- [ ] **Step 2: Inline the types into database.interface.ts**

Replace the import with local type definitions. These are likely Zod-inferred types from the schema. Define them as plain TypeScript interfaces/types in the interface file.

Also replace the `Id` type — it's likely a branded string type. Define it locally:

```typescript
/** Branded string ID for type-safe entity references. */
export type Id<T extends string> = string & { readonly __brand: T };
```

Remove the import lines:
```typescript
// Remove these:
import type { OpportunityDetection, OpportunityActor, ... } from '../../../schemas/database.schema';
import type { Id } from '../../../types/common.types';
```

Replace with local definitions matching the actual shapes.

- [ ] **Step 3: Verify no remaining external imports**

```bash
cd protocol && grep -rE "from.*(\.\.\/){3}" src/lib/protocol/interfaces/ --include="*.ts"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -u protocol/src/lib/protocol/interfaces/database.interface.ts
git commit -m "refactor(protocol): inline schema types into database interface"
```

---

## Task 9: Wire Contact Interface into Tools

**Files:**
- Modify: `protocol/src/lib/protocol/tools/tool.helpers.ts` (add to `ToolDeps`)
- Modify: `protocol/src/lib/protocol/tools/contact.tools.ts` (use `deps.contactService`)

- [ ] **Step 1: Add `contactService` to `ToolDeps`**

In `tool.helpers.ts`, add the import and field:

```typescript
// Add import:
import type { ContactServiceAdapter } from "../interfaces/contact.interface";

// Add to ToolDeps interface:
export interface ToolDeps {
  // ... existing fields ...
  contactService: ContactServiceAdapter;
}
```

- [ ] **Step 2: Refactor `contact.tools.ts` to use `deps`**

```typescript
// Before:
import { contactService } from '../../../services/contact.service';
export function createContactTools(defineTool: DefineTool, _deps: ToolDeps) {

// After:
export function createContactTools(defineTool: DefineTool, deps: ToolDeps) {
  const { contactService } = deps;
```

Remove the `contactService` import from `../../../services/contact.service`. All 4 call sites (`importContacts`, `listContacts`, `addContact`, `removeContact`) already use `contactService.method()` — they just need the variable to come from `deps` instead of the import.

- [ ] **Step 3: Run tests**

```bash
cd protocol && bun test src/lib/protocol/tools/tests/
```

- [ ] **Step 4: Commit**

```bash
git add -u protocol/src/lib/protocol/tools/
git commit -m "refactor(protocol): inject ContactServiceAdapter via ToolDeps"
```

---

## Task 10: Wire Integration Importer into Tools

**Files:**
- Modify: `protocol/src/lib/protocol/tools/tool.helpers.ts` (add to `ToolDeps`)
- Modify: `protocol/src/lib/protocol/tools/integration.tools.ts`

The current code instantiates `IntegrationService` locally with `new IntegrationService(integration)` and calls `integrationService.importContacts()`. We need an interface for just that operation.

- [ ] **Step 1: Add integration import interface to `ToolDeps`**

In `tool.helpers.ts`:

```typescript
// Add to ToolDeps:
export interface ToolDeps {
  // ... existing fields ...
  integrationImporter: {
    importContacts(userId: string, toolkit: string): Promise<{
      imported: number;
      skipped: number;
      newContacts: number;
      existingContacts: number;
    }>;
  };
}
```

(Or define a named interface in `integration.interface.ts` if preferred — but the existing `IntegrationAdapter` is already about sessions/toolkits. This is a higher-level service concern.)

- [ ] **Step 2: Refactor `integration.tools.ts`**

```typescript
// Before:
import { IntegrationService } from '../../../services/integration.service';
// ...
const integrationService = new IntegrationService(integration);
// ...
const importResult = await integrationService.importContacts(context.userId, 'gmail');

// After:
const importResult = await deps.integrationImporter.importContacts(context.userId, 'gmail');
```

Also remove the `import { log } from '../../../lib/log'` — use `protocolLogger` instead (already internalized in Task 6).

- [ ] **Step 3: Run tests**

```bash
cd protocol && bun test src/lib/protocol/tools/tests/
```

- [ ] **Step 4: Commit**

```bash
git add -u protocol/src/lib/protocol/tools/
git commit -m "refactor(protocol): inject integration importer via ToolDeps"
```

---

## Task 11: Wire Profile Enrichment into Tools and Graphs

**Files:**
- Modify: `protocol/src/lib/protocol/tools/tool.helpers.ts` (add to `ToolDeps`)
- Modify: `protocol/src/lib/protocol/tools/profile.tools.ts`
- Modify: `protocol/src/lib/protocol/graphs/profile.graph.ts` (`ProfileGraphFactory` constructor)

- [ ] **Step 1: Add `enricher` to `ToolDeps`**

In `tool.helpers.ts`:

```typescript
import type { ProfileEnricher } from "../interfaces/enrichment.interface";

export interface ToolDeps {
  // ... existing fields ...
  enricher: ProfileEnricher;
}
```

- [ ] **Step 2: Refactor `profile.tools.ts`**

```typescript
// Before:
import { enrichUserProfile } from "../../../lib/parallel/parallel";
// ...
async function enrichFromUserRecord(user: { ... }) {
  return enrichUserProfile({ ... });
}

// After — use deps.enricher:
// Remove the import. The enrichFromUserRecord function moves inside createProfileTools
// and uses deps.enricher.enrichUserProfile() instead.
```

- [ ] **Step 3: Refactor `profile.graph.ts`**

Add `ProfileEnricher` to `ProfileGraphFactory` constructor:

```typescript
// Before:
import { enrichUserProfile } from "../../../lib/parallel/parallel";
// ...
export class ProfileGraphFactory {
  constructor(
    private database: ProfileGraphDatabase,
    private embedder: Embedder,
    private scraper: Scraper,
  ) {}

// After:
import type { ProfileEnricher } from "../interfaces/enrichment.interface";
// ...
export class ProfileGraphFactory {
  constructor(
    private database: ProfileGraphDatabase,
    private embedder: Embedder,
    private scraper: Scraper,
    private enricher?: ProfileEnricher,
  ) {}
```

Then replace `enrichUserProfile(request)` calls with `this.enricher?.enrichUserProfile(request)` (with graceful fallback if enricher is not provided).

- [ ] **Step 4: Update `tools/index.ts` to pass enricher through**

When constructing `ProfileGraphFactory`:

```typescript
// Before:
const profileGraph = new ProfileGraphFactory(database, embedder, scraper).createGraph();

// After:
const profileGraph = new ProfileGraphFactory(database, embedder, scraper, deps.enricher).createGraph();
```

- [ ] **Step 5: Run tests**

```bash
cd protocol && bun test src/lib/protocol/graphs/tests/profile.graph.generate.spec.ts
cd protocol && bun test src/lib/protocol/tools/tests/
```

- [ ] **Step 6: Commit**

```bash
git add -u protocol/src/lib/protocol/
git commit -m "refactor(protocol): inject ProfileEnricher via constructor and ToolDeps"
```

---

## Task 12: Wire Chat Session Reader into Chat Graph

**Files:**
- Modify: `protocol/src/lib/protocol/graphs/chat.graph.ts`

- [ ] **Step 1: Add `ChatSessionReader` to `ChatGraphFactory` constructor**

```typescript
// Before:
import { chatSessionService } from "../../../services/chat.service";
// ...
export class ChatGraphFactory {
  constructor(
    private database: ChatGraphCompositeDatabase,
    private embedder: Embedder,
    private scraper: Scraper,
  ) {}

// After:
import type { ChatSessionReader } from "../interfaces/chat-session.interface";
// ...
export class ChatGraphFactory {
  constructor(
    private database: ChatGraphCompositeDatabase,
    private embedder: Embedder,
    private scraper: Scraper,
    private chatSession?: ChatSessionReader,
  ) {}
```

Replace usage:
```typescript
// Before:
const messages = await chatSessionService.getSessionMessages(sessionId, maxMessages);

// After:
const messages = this.chatSession
  ? await this.chatSession.getSessionMessages(sessionId, maxMessages)
  : [];
```

- [ ] **Step 2: Update `tools/index.ts` to pass `chatSession` through**

This will happen in Task 13 when we refactor the composition root.

- [ ] **Step 3: Run tests**

```bash
cd protocol && bun test src/lib/protocol/graphs/tests/chat.graph.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add -u protocol/src/lib/protocol/graphs/chat.graph.ts
git commit -m "refactor(protocol): inject ChatSessionReader into ChatGraphFactory"
```

---

## Task 13: Refactor `tools/index.ts` — Remove All External Imports

**Files:**
- Modify: `protocol/src/lib/protocol/tools/index.ts`
- Create: `protocol/src/protocol-init.ts` (new composition root outside protocol lib)

This is the main task. `tools/index.ts` currently imports concrete adapters (`RedisCacheAdapter`, `ComposioIntegrationAdapter`, `chatDatabaseAdapter`, `conversationDatabaseAdapter`, `createUserDatabase`, `createSystemDatabase`) and the `intentQueue`. All of these must be received as parameters.

- [ ] **Step 1: Define `ProtocolDeps` — all external deps needed to initialize the protocol**

Add to `tools/index.ts` (or a new `protocol/src/lib/protocol/protocol.deps.ts`):

```typescript
import type { ChatGraphCompositeDatabase } from "../interfaces/database.interface";
import type { Embedder } from "../interfaces/embedder.interface";
import type { Scraper } from "../interfaces/scraper.interface";
import type { HydeCache } from "../interfaces/cache.interface";
import type { Cache } from "../interfaces/cache.interface";
import type { IntegrationAdapter } from "../interfaces/integration.interface";
import type { IntentGraphQueue } from "../interfaces/queue.interface";
import type { ContactServiceAdapter } from "../interfaces/contact.interface";
import type { ChatSessionReader } from "../interfaces/chat-session.interface";
import type { ProfileEnricher } from "../interfaces/enrichment.interface";
import type { UserDatabase, SystemDatabase, NegotiationDatabase } from "../interfaces/database.interface";

/**
 * All external dependencies needed to initialize the protocol engine.
 * The host application must provide concrete implementations.
 */
export interface ProtocolDeps {
  database: ChatGraphCompositeDatabase;
  embedder: Embedder;
  scraper: Scraper;
  cache: Cache;
  hydeCache: HydeCache;
  integration: IntegrationAdapter;
  intentQueue: IntentGraphQueue;
  contactService: ContactServiceAdapter;
  chatSession: ChatSessionReader;
  enricher: ProfileEnricher;
  negotiationDatabase: NegotiationDatabase;
  /** Factory for user-scoped database access. */
  createUserDatabase: (db: ChatGraphCompositeDatabase, userId: string) => UserDatabase;
  /** Factory for system-scoped database access. */
  createSystemDatabase: (db: ChatGraphCompositeDatabase, userId: string, indexScope: string[], embedder?: Embedder) => SystemDatabase;
}
```

- [ ] **Step 2: Refactor `createChatTools` to accept `ProtocolDeps`**

Change the signature of `createChatTools` so it receives `ProtocolDeps` instead of creating concrete instances internally. The function should:
1. No longer import from `../../../adapters/`
2. No longer import from `../../../queues/`
3. Use `deps.cache` instead of `new RedisCacheAdapter()`
4. Use `deps.integration` instead of `new ComposioIntegrationAdapter()`
5. Use `deps.intentQueue` instead of importing `intentQueue`
6. Use `deps.createUserDatabase()` and `deps.createSystemDatabase()` instead of importing those functions
7. Use `deps.negotiationDatabase` for `NegotiationGraphFactory`
8. Pass `deps.chatSession` to `ChatGraphFactory`
9. Pass `deps.enricher` to `ProfileGraphFactory`
10. Pass `deps.contactService`, `deps.integrationImporter`, `deps.enricher` through `ToolDeps`

- [ ] **Step 3: Create `protocol/src/protocol-init.ts` — the composition root**

This file lives *outside* the protocol lib and provides the concrete wiring:

```typescript
// protocol/src/protocol-init.ts

import { RedisCacheAdapter } from "./adapters/cache.adapter";
import { ComposioIntegrationAdapter } from "./adapters/integration.adapter";
import {
  chatDatabaseAdapter,
  conversationDatabaseAdapter,
  createUserDatabase,
  createSystemDatabase,
} from "./adapters/database.adapter";
import { intentQueue } from "./queues/intent.queue";
import { chatSessionService } from "./services/chat.service";
import { contactService } from "./services/contact.service";
import { IntegrationService } from "./services/integration.service";
import { enrichUserProfile } from "./lib/parallel/parallel";
import type { ProtocolDeps } from "./lib/protocol/tools/index";
import type { IntegrationAdapter } from "./lib/protocol/interfaces/integration.interface";

/** Create the default ProtocolDeps wired to concrete adapters/services. */
export function createDefaultProtocolDeps(overrides?: Partial<ProtocolDeps>): ProtocolDeps {
  const integration: IntegrationAdapter = new ComposioIntegrationAdapter();
  const integrationService = new IntegrationService(integration);

  return {
    database: chatDatabaseAdapter,
    embedder: overrides?.embedder ?? /* imported embedder */,
    scraper: overrides?.scraper ?? /* imported scraper */,
    cache: new RedisCacheAdapter(),
    hydeCache: new RedisCacheAdapter(),
    integration,
    intentQueue,
    contactService,
    chatSession: chatSessionService,
    enricher: { enrichUserProfile },
    negotiationDatabase: conversationDatabaseAdapter,
    createUserDatabase,
    createSystemDatabase,
    ...overrides,
  };
}
```

- [ ] **Step 4: Update callers of `createChatTools`**

Search for all call sites of `createChatTools` outside the protocol lib and pass the new deps:

```bash
cd protocol && grep -r "createChatTools" src/ --include="*.ts" | grep -v "lib/protocol/"
```

Update each call site to use `createDefaultProtocolDeps()` or pass explicit deps.

- [ ] **Step 5: Verify no external imports remain in protocol lib**

```bash
cd protocol && grep -rE "from ['\"].*(adapters|services|queues|schemas|lib/(parallel|log|performance))" src/lib/protocol/ --include="*.ts" | grep -v node_modules | grep -v ".spec." | grep -v ".test."
```
Expected: no output.

- [ ] **Step 6: Run full test suite**

```bash
cd protocol && bun test src/lib/protocol/
```

- [ ] **Step 7: Commit**

```bash
git add protocol/src/protocol-init.ts
git add -u protocol/src/lib/protocol/tools/index.ts
git add -u protocol/src/
git commit -m "refactor(protocol): extract composition root, protocol lib is now self-contained"
```

---

## Task 14: Final Verification — Zero External Imports

- [ ] **Step 1: Verify no imports escape the protocol boundary**

Run a comprehensive check for any remaining imports that reach outside `protocol/src/lib/protocol/`:

```bash
cd protocol && grep -rE "from ['\"](\.\./){2,}" src/lib/protocol/ --include="*.ts" | grep -v node_modules | grep -v ".spec." | grep -v ".test."
```

Every result should be an import within `protocol/src/lib/protocol/` (i.e., `../../` should only go as deep as the protocol lib root, never beyond).

- [ ] **Step 2: Run TypeScript type checking**

```bash
cd protocol && npx tsc --noEmit
```

- [ ] **Step 3: Run all protocol lib tests**

```bash
cd protocol && bun test src/lib/protocol/
```

- [ ] **Step 4: Run full protocol test suite**

```bash
cd protocol && bun test
```

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -u protocol/
git commit -m "refactor(protocol): final cleanup for extraction readiness"
```
