---
name: protocol-architecture
description: Use when writing, editing, or reviewing any TypeScript code in the protocol directory - enforces import boundaries between layers, dependency injection patterns, and file naming conventions
---

# Protocol Architecture Rules

## Overview

The protocol enforces strict layering: **Controllers -> Services -> Adapters -> DB**. Graphs and agents use dependency injection — they never import adapters or `db` directly. Every layer has explicit import boundaries. Violating them causes tight coupling, untestable code, and architectural decay.

**Violating the letter of these rules IS violating the spirit.**

## BEFORE Writing Any Import

Stop and check: does the import you're about to write appear in the "MUST NOT import" column for your layer? If yes, you are violating architecture. Find the correct layer to put the logic in.

## Import Boundary Table

| Layer | MUST import from | MUST NOT import |
|-------|-----------------|-----------------|
| **Controllers** | Services, guards, decorators, logger | `db`, schema, Drizzle ops, adapters, graphs, agents |
| **Services** | Adapters, graph factories, queues, interfaces, logger | Other services, `db` directly, controllers |
| **Adapters** | `db`, Drizzle ops, schema, interfaces, logger | Other adapters, services, controllers, graphs |
| **Graphs** | Injected interfaces, agents, states, LangGraph, logger | `db`, Drizzle ops, schema, adapters, services, controllers |
| **Agents** | LangChain, Zod, injected interfaces, logger | `db`, Drizzle ops, schema, adapters, services, controllers, graphs |
| **Queues** | Adapters, graph factories, agents, services, logger | `db` directly, Drizzle ops, schema, controllers, other queue internals |
| **Lib packages** | Own domain implementation, logger | Services, controllers, adapters, other lib packages outside own domain |

### Quick Decision

```
"Do I need data in a controller?"  →  Call a service method
"Do I need data in a service?"     →  Call an adapter method
"Do I need data in a graph?"       →  Use the injected interface (Pick<Database, ...>)
"Do I need data in an agent?"      →  You don't. Agents are pure LLM wrappers.
"Do I need data across services?"  →  Use events, queues, or shared lib. Never import another service.
```

## Layer Rules (Detail)

### Controllers

Controllers handle HTTP and delegate everything to services.

```typescript
// CORRECT
import { intentService } from '../services/intent.service';
import { Controller, Get, UseGuards } from '../lib/router/router.decorators';
import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';

@Controller('/intents')
export class IntentController {
  @Get('/stats')
  @UseGuards(AuthGuard)
  async getStats(req: Request, user: AuthenticatedUser) {
    const stats = await intentService.getStatsByUser(user.id);
    return Response.json(stats);
  }
}
```

```typescript
// WRONG - controller queries DB directly
import db from '../lib/drizzle/drizzle';           // ❌ NEVER
import { intents } from '../schemas/database.schema'; // ❌ NEVER
import { eq, count } from 'drizzle-orm';           // ❌ NEVER

async getStats(req: Request, user: AuthenticatedUser) {
  const stats = await db.select(...).from(intents); // ❌ This belongs in a service/adapter
}
```

**If you need data in a controller, the method belongs on a service.** Add it to the service, then call it from the controller.

### Services

Services orchestrate business logic using adapters and graph factories. They NEVER import other services.

```typescript
// CORRECT
import { intentDatabaseAdapter } from '../adapters/database.adapter';
import { ProfileGraphFactory } from '../lib/protocol/graphs/profile.graph';
import { EmbedderAdapter } from '../adapters/embedder.adapter';
import { log } from '../lib/log';

export class ProfileService {
  async syncProfile(userId: string) {
    const factory = new ProfileGraphFactory(
      new ProfileDatabaseAdapter(),  // Adapter injected into graph
      new EmbedderAdapter()
    );
    const graph = factory.createGraph();
    return await graph.invoke({ userId });
  }
}
```

```typescript
// WRONG - service imports other services
import { intentService } from './intent.service';       // ❌ NEVER
import { profileService } from './profile.service';     // ❌ NEVER
import { opportunityService } from './opportunity.service'; // ❌ NEVER

export class DigestService {
  async generate(userId: string) {
    const intents = await intentService.getRecent(userId);  // ❌
    const profile = await profileService.getProfile(userId); // ❌
  }
}
```

**Cross-service data?** Use adapters directly (each service can use any adapter), events (`IntentEvents.onCreated()`), queues, or shared lib utilities.

### Adapters

Adapters own database access. They implement protocol interfaces and are the ONLY layer that imports `db`, schema, and Drizzle operators.

```typescript
// CORRECT - adapters own DB access
import { eq, and } from 'drizzle-orm';
import * as schema from '../schemas/database.schema';
import db from '../lib/drizzle/drizzle';
import type { Database } from '../lib/protocol/interfaces/database.interface';

export class IntentDatabaseAdapter implements Partial<Database> {
  async getIntentStats(userId: string) {
    return db.select(...).from(schema.intents).where(eq(schema.intents.userId, userId));
  }
}
```

Adapters must NOT import other adapters, services, or controllers.

### Graphs (LangGraph State Machines)

Graphs receive **narrowed interfaces** via constructor injection. They never know about concrete adapters.

```typescript
// CORRECT - interface injection
export type ChatGraphDatabase = Pick<Database, 'getMessages' | 'saveMessage' | 'getNotificationPrefs'>;

export class ChatGraphFactory {
  constructor(
    private db: ChatGraphDatabase,  // Interface, not adapter
    private embedder: Embedder      // Interface, not adapter
  ) {}

  createGraph() {
    const checkPrefsNode = async (state: ChatState) => {
      const prefs = await this.db.getNotificationPrefs(state.userId); // Uses injected interface
      return { notificationsEnabled: prefs?.enabled ?? false };
    };
    // ...
  }
}
```

```typescript
// WRONG - graph imports db/adapter directly
import db from '../../drizzle/drizzle';                          // ❌ NEVER
import { userNotificationSettings } from '../../../schemas/...'; // ❌ NEVER
import { ChatDatabaseAdapter } from '../../../adapters/...';     // ❌ NEVER

async function checkPrefsNode(state: any) {     // ❌ also: untyped state
  const prefs = await db.select().from(userNotificationSettings); // ❌
}
```

**If a graph needs new data:** Add the method to the protocol interface (`database.interface.ts`), implement it in the adapter, add it to the graph's `Pick<Database, ...>` type, then use `this.db.newMethod()`.

### Agents

Agents are pure LLM wrappers. They use LangChain, Zod schemas, and nothing else. If they need external data, it's passed in via the graph that invokes them.

### Queues

Queues instantiate adapters and graph factories in their constructors (or accept them via `Deps` for testing). They do NOT import `db` directly.

### Lib Packages (`src/lib/`)

Reusable packages live in `src/lib/` in their own folder (not as loose files). Each package is self-contained:

- **MUST** be in a directory (e.g., `src/lib/bullmq/`, `src/lib/drizzle/`, `src/lib/router/`)
- **CAN** import: its own implementation files, logger, external npm packages
- **MUST NOT** import: services, controllers, adapters, or other lib packages outside its domain
- **Exception**: Infrastructure-level utilities (`lib/email/`, `lib/integrations/`) may import adapters when they serve as infrastructure glue, not business logic

```typescript
// CORRECT - lib package imports only its own domain
// src/lib/router/router.decorators.ts
import { RouteRegistry } from './router.registry';  // Own domain
import { log } from '../log';                        // Logger (allowed)

// WRONG - lib package importing services
import { intentService } from '../../services/intent.service';  // ❌ NEVER
import { ChatDatabaseAdapter } from '../../adapters/database.adapter'; // ❌ NEVER
```

## File Naming Convention

All files follow `{domain}.{purpose}.ts`:

| Purpose | Examples |
|---------|---------|
| `.controller` | `intent.controller.ts`, `webhook.controller.ts` |
| `.service` | `intent.service.ts`, `digest.service.ts` |
| `.graph` | `chat.graph.ts`, `profile.graph.ts` |
| `.graph.state` | `chat.graph.state.ts` |
| `.agent` | `router.agent.ts` |
| `.generator` | `response.generator.ts`, `hyde.generator.ts` |
| `.evaluator` | `opportunity.evaluator.ts` |
| `.inferrer` | `explicit.inferrer.ts` |
| `.reconciler` | `intent.reconciler.ts` |
| `.verifier` | `semantic.verifier.ts` |
| `.queue` | `intent.queue.ts`, `digest.queue.ts` |
| `.spec` | `router.agent.spec.ts` |
| `.validator` | `confidence.validator.ts` |

**Exempt from convention:** `index.ts`, `schema.ts`, `main.ts`, single-purpose root utilities (`constants.ts`, `types.ts`).

**Wrong:** `chatGraph.ts`, `intentAgent.ts`, `generator.ts` (no domain prefix).

## Red Flags — STOP and Reconsider

If you're about to do any of these, you're violating architecture:

- Importing `db` from `../lib/drizzle/drizzle` anywhere except an adapter
- Importing from `../schemas/database.schema` anywhere except an adapter
- Importing `eq`, `and`, `sql`, `count` or other Drizzle operators outside an adapter
- Importing one service from another service
- Importing an adapter in a controller
- Importing an adapter in a graph or agent
- Using `any` for graph state (use typed `Annotation`)
- Creating a file without `{domain}.{purpose}.ts` naming
- Instantiating `new ChatDatabaseAdapter()` inside a graph (inject via constructor)

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "Direct DB access is faster/more performant" | Add the query to the adapter. The function call overhead is negligible. |
| "Use whatever is most direct" | "Most direct" that violates layering is WRONG. The correct layer is the most direct *valid* path. |
| "It's just a simple query, not worth a service method" | Simple queries become complex. The boundary exists for testability. Add it to the service. |
| "I need data from another service" | Use adapters directly, events, or queues. Services never import services. |
| "The adapter doesn't have this method yet" | Add it. That's the correct fix, not bypassing the layer. |
| "Injecting via constructor is verbose" | Verbosity is the price of testability. Graphs with direct DB access can't be unit tested. |
| "I'll refactor the layering later" | You won't. It gets harder. Do it right now. |
| "This is prototype/throwaway code" | Prototypes become production. Follow the pattern. |
| "The graph just needs one quick query" | Add it to the interface, implement in adapter, inject. Three steps, clean architecture. |

## When a Graph Needs New Data Access

Follow these steps (do NOT shortcut by importing db):

1. Define the method signature in the protocol interface (`src/lib/protocol/interfaces/database.interface.ts`)
2. Implement it in the appropriate adapter (`src/adapters/database.adapter.ts`)
3. Add the method to the graph's narrowed type: `Pick<Database, 'existingMethod' | 'newMethod'>`
4. Use `this.db.newMethod()` in the graph node
5. Service injects the adapter when constructing the graph factory
