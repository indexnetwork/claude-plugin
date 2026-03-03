# Elysia Migration — Phase 1: Protocol Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the protocol's `Bun.serve()` + custom decorator routing with Elysia, exporting `type App` for Eden Treaty.

**Architecture:** Each controller class keeps its methods as handler logic. The `@Controller`/`@Get`/`@Post` decorators and `RouteRegistry` are replaced by Elysia plugin instances that chain `.get()`/`.post()` calls with typed schemas. `main.ts` composes all plugins into a root Elysia app and exports `type App`.

**Tech Stack:** Elysia, `@elysiajs/cors`, TypeBox (Elysia's built-in `t`), Bun

**Existing tests:** 68 test files. Controller tests use direct method invocation (`controller.method(req, user)`), so they'll continue working. No HTTP-level routing tests exist — the decorator system is tested indirectly.

---

## Task 1: Setup — Add Elysia Dependencies

**Files:**
- Modify: `protocol/package.json`

**Step 1: Install Elysia and plugins**

Run:
```bash
cd protocol && bun add elysia @elysiajs/cors @elysiajs/static
```

**Step 2: Verify installation**

Run:
```bash
cd protocol && bun run build
```
Expected: No errors (new deps don't conflict with existing code)

**Step 3: Commit**

```bash
git add protocol/package.json protocol/bun.lock
git commit -m "feat(protocol): add elysia, @elysiajs/cors, @elysiajs/static deps"
```

---

## Task 2: Create Auth Plugin

**Files:**
- Create: `protocol/src/plugins/auth.plugin.ts`

The auth plugin replaces `AuthGuard`. It uses Elysia's `.derive()` to verify JWT and inject `user` into context.

**Step 1: Create the auth plugin**

```typescript
// protocol/src/plugins/auth.plugin.ts
import { Elysia } from "elysia";
import { jwtVerify, createRemoteJWKSet } from "jose";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string;
}

const JWKS = createRemoteJWKSet(
  new URL(`http://localhost:${process.env.PORT || 3001}/api/auth/jwks`)
);

/**
 * Elysia plugin that verifies JWT and adds `user` to the request context.
 * Replaces the old `AuthGuard` decorator.
 */
export const authPlugin = new Elysia({ name: "auth" }).derive(
  async ({ request }): Promise<{ user: AuthenticatedUser }> => {
    let token: string | null = null;

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else {
      const url = new URL(request.url, "http://localhost");
      token = url.searchParams.get("token");
    }

    if (!token) {
      throw new Error("Access token required");
    }

    try {
      const { payload } = await jwtVerify(token, JWKS);
      return {
        user: {
          id: payload.id as string,
          email: (payload.email as string) ?? null,
          name: payload.name as string,
        },
      };
    } catch {
      throw new Error("Invalid or expired access token");
    }
  }
);
```

**Step 2: Verify it compiles**

Run:
```bash
cd protocol && bun run build
```
Expected: No errors

**Step 3: Commit**

```bash
git add protocol/src/plugins/auth.plugin.ts
git commit -m "feat(protocol): add elysia auth plugin replacing AuthGuard"
```

---

## Task 3: Create Error Handler Plugin

**Files:**
- Create: `protocol/src/plugins/error.plugin.ts`

Maps known error messages to HTTP status codes, matching current behavior in `main.ts` lines 245-260.

**Step 1: Create the error handler plugin**

```typescript
// protocol/src/plugins/error.plugin.ts
import { Elysia } from "elysia";

/**
 * Global error handler mapping known error messages to HTTP status codes.
 * Matches the existing error handling in main.ts.
 */
export const errorPlugin = new Elysia({ name: "error-handler" }).onError(
  ({ error, set }) => {
    const message =
      error instanceof Error ? error.message : String(error);

    if (
      message === "Access token required" ||
      message === "Invalid or expired access token"
    ) {
      set.status = 401;
      return { error: message };
    }

    if (
      message === "User not found" ||
      message === "Account deactivated"
    ) {
      set.status = 403;
      return { error: message };
    }

    console.error("Unhandled error:", error);
    set.status = 500;
    return { error: "Internal server error" };
  }
);
```

**Step 2: Verify it compiles**

Run:
```bash
cd protocol && bun run build
```
Expected: No errors

**Step 3: Commit**

```bash
git add protocol/src/plugins/error.plugin.ts
git commit -m "feat(protocol): add elysia error handler plugin"
```

---

## Task 4: Migrate main.ts to Elysia (Skeleton)

**Files:**
- Modify: `protocol/src/main.ts`

Replace `Bun.serve()` with Elysia. Initially mount only health check, CORS, Better Auth, Bull Board, and error handling. Controllers will be migrated one at a time in subsequent tasks.

**Step 1: Rewrite main.ts**

Keep all existing imports for services, adapters, queues, cron jobs, events, etc. Replace only the HTTP server portion.

The new `main.ts` should:
1. Keep all initialization code (DB, queues, cron, events, adapter wiring) — this is unchanged
2. Replace `Bun.serve({ fetch(req) { ... } })` with an Elysia app
3. Mount Better Auth via `.mount()`
4. Mount Bull Board (Hono) via `.mount()`
5. Use `@elysiajs/cors` for CORS
6. Use `errorPlugin` for error handling
7. Keep existing controller imports but temporarily wrap them with the old `RouteRegistry` dispatch until each is migrated

Key structure of new main.ts:

```typescript
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { errorPlugin } from "./plugins/error.plugin";
// ... keep all existing imports ...

// ... keep all existing initialization code (DB, queues, cron, events) ...

const app = new Elysia({ prefix: "/api" })
  .use(
    cors({
      origin: true, // reflect origin (matches current getCorsHeaders behavior)
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
      exposeHeaders: ["X-Session-Id", "set-auth-jwt"],
      maxAge: 86400,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  )
  .use(errorPlugin);

// Health check (outside /api prefix)
const root = new Elysia()
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .use(app);

// Mount Better Auth
root.mount("/api/auth", (req) => auth.handler(req));

// Mount Bull Board (Hono sub-app, dev only)
if (!IS_PRODUCTION) {
  root.mount("/dev/queues", adminQueuesApp.fetch);
}

// TODO: Migrate controllers one-by-one (Tasks 5-16)
// For now, keep the old RouteRegistry dispatch as a fallback
// This will be removed once all controllers are migrated

root.listen(PORT);
console.log(`Server running on port ${PORT}`);

export type App = typeof root;
```

**Important:** During migration, we need a compatibility layer. The old `RouteRegistry` dispatcher will be kept as a catch-all route on Elysia until all controllers are migrated to Elysia plugins. This way the server works at every commit.

Add a catch-all that delegates to the old dispatcher:

```typescript
// Compatibility: forward unmatched routes to old RouteRegistry dispatcher
root.all("/*", async ({ request }) => {
  // ... copy the existing RouteRegistry matching logic from current main.ts ...
  // This will be removed entirely once all controllers are migrated
});
```

**Step 2: Start the server and verify**

Run the dev server and test:
- `GET /health` returns `{ status: "ok" }`
- `GET /api/auth/providers` returns auth providers (Better Auth)
- `GET /dev/queues/` shows Bull Board UI
- Existing API routes still work via the compatibility layer

Ask the user to verify by running:
```bash
cd protocol && bun run dev
```
Then test with:
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/auth/providers
```

**Step 3: Commit**

```bash
git add protocol/src/main.ts
git commit -m "feat(protocol): replace Bun.serve with Elysia, add compatibility layer"
```

---

## Task 5: Migrate AuthController

**Files:**
- Modify: `protocol/src/controllers/auth.controller.ts`
- Modify: `protocol/src/main.ts` (add `.use(authRoutes)`)

**Step 1: Convert AuthController to Elysia plugin**

Keep the class with its method implementations. Add an Elysia route chain at the bottom.

```typescript
// At the bottom of auth.controller.ts, add:
import { Elysia } from "elysia";
import { authPlugin } from "../plugins/auth.plugin";

const ctrl = new AuthController();

export const authRoutes = new Elysia({ prefix: "/auth" })
  .get("/providers", () => ctrl.providers())
  .use(authPlugin)
  .get("/me", ({ user, request }) => ctrl.me(request, user))
  .patch("/profile/update", ({ user, request }) =>
    ctrl.updateProfile(request, user)
  );
```

Remove the `@Controller`, `@Get`, `@Patch`, `@UseGuards` decorators from the class.

**Step 2: Register in main.ts**

```typescript
import { authRoutes } from "./controllers/auth.controller";
// In the app Elysia instance:
app.use(authRoutes);
```

**Step 3: Verify**

Ask user to run the dev server and test:
```bash
curl http://localhost:3001/api/auth/providers
```

**Step 4: Commit**

```bash
git add protocol/src/controllers/auth.controller.ts protocol/src/main.ts
git commit -m "feat(protocol): migrate AuthController to Elysia plugin"
```

---

## Task 6: Migrate UserController

**Files:**
- Modify: `protocol/src/controllers/user.controller.ts`
- Modify: `protocol/src/main.ts`

Smallest controller (2 routes, 62 lines). Good for establishing the pattern.

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new UserController();

export const userRoutes = new Elysia({ prefix: "/users" })
  .use(authPlugin)
  .get("/batch", ({ user, request }) => ctrl.getBatch(request, user))
  .get("/:userId", ({ user, request, params }) =>
    ctrl.getUser(request, user, params)
  );
```

Remove decorators from the class.

**Step 2: Register in main.ts**

**Step 3: Verify and commit**

```bash
git commit -m "feat(protocol): migrate UserController to Elysia plugin"
```

---

## Task 7: Migrate ProfileController

**Files:**
- Modify: `protocol/src/controllers/profile.controller.ts`
- Modify: `protocol/src/main.ts`

Smallest controller (1 route, 23 lines).

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new ProfileController();

export const profileRoutes = new Elysia({ prefix: "/profiles" })
  .use(authPlugin)
  .post("/sync", ({ user, request }) => ctrl.sync(request, user));
```

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate ProfileController to Elysia plugin"
```

---

## Task 8: Migrate LinkController

**Files:**
- Modify: `protocol/src/controllers/link.controller.ts`
- Modify: `protocol/src/main.ts`

4 routes, 85 lines.

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new LinkController();

export const linkRoutes = new Elysia({ prefix: "/links" })
  .use(authPlugin)
  .get("", ({ user, request }) => ctrl.list(request, user))
  .post("", ({ user, request }) => ctrl.create(request, user))
  .delete("/:id", ({ user, request, params }) =>
    ctrl.delete(request, user, params)
  )
  .get("/:id/content", ({ user, request, params }) =>
    ctrl.getContent(request, user, params)
  );
```

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate LinkController to Elysia plugin"
```

---

## Task 9: Migrate FileController

**Files:**
- Modify: `protocol/src/controllers/file.controller.ts`
- Modify: `protocol/src/main.ts`

3 routes. Note: File upload uses multipart/form-data via Busboy.

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new FileController();

export const fileRoutes = new Elysia({ prefix: "/files" })
  .use(authPlugin)
  .post("", ({ user, request }) => ctrl.upload(request, user))
  .get("", ({ user, request }) => ctrl.list(request, user))
  .delete("/:id", ({ user, request, params }) =>
    ctrl.delete(request, user, params)
  );
```

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate FileController to Elysia plugin"
```

---

## Task 10: Migrate IntentController

**Files:**
- Modify: `protocol/src/controllers/intent.controller.ts`
- Modify: `protocol/src/main.ts`

6 routes, 202 lines.

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new IntentController();

export const intentRoutes = new Elysia({ prefix: "/intents" })
  .use(authPlugin)
  .post("/list", ({ user, request }) => ctrl.list(request, user))
  .post("/confirm", ({ user, request }) => ctrl.confirm(request, user))
  .post("/reject", ({ user, request }) => ctrl.reject(request, user))
  .post("/proposals/status", ({ user, request }) =>
    ctrl.proposalStatuses(request, user)
  )
  .get("/:id", ({ user, request, params }) =>
    ctrl.getById(request, user, params)
  )
  .patch("/:id/archive", ({ user, request, params }) =>
    ctrl.archive(request, user, params)
  )
  .post("/process", ({ user, request }) => ctrl.process(request, user));
```

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate IntentController to Elysia plugin"
```

---

## Task 11: Migrate UploadController

**Files:**
- Modify: `protocol/src/controllers/upload.controller.ts`
- Modify: `protocol/src/main.ts`

3 routes, 233 lines. Has constructor DI: `constructor(storage: StorageAdapter)`.

**Step 1: Convert to Elysia plugin**

The controller needs `StorageAdapter` injected. Create the instance with the adapter (same as current `main.ts` does).

```typescript
// In upload.controller.ts — create instance with DI
// The StorageAdapter is instantiated in main.ts and passed here

export const createUploadRoutes = (storage: StorageAdapter) => {
  const ctrl = new UploadController(storage);

  return new Elysia({ prefix: "/uploads" })
    .use(authPlugin)
    .post("", ({ user, request }) => ctrl.upload(request, user))
    .get("", ({ user, request }) => ctrl.list(request, user))
    .post("/avatar", ({ user, request }) =>
      ctrl.uploadAvatar(request, user)
    );
};
```

In `main.ts`:
```typescript
import { createUploadRoutes } from "./controllers/upload.controller";
app.use(createUploadRoutes(storageAdapter));
```

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate UploadController to Elysia plugin"
```

---

## Task 12: Migrate OpportunityController + IndexOpportunityController

**Files:**
- Modify: `protocol/src/controllers/opportunity.controller.ts`
- Modify: `protocol/src/main.ts`

8 routes total (6 opportunity + 2 index-opportunity).

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new OpportunityController();

export const opportunityRoutes = new Elysia({ prefix: "/opportunities" })
  .use(authPlugin)
  .get("", ({ user, request }) => ctrl.listOpportunities(request, user))
  .get("/chat-context", ({ user, request }) =>
    ctrl.getChatContext(request, user)
  )
  .get("/home", ({ user, request }) => ctrl.getHome(request, user))
  .get("/:id", ({ user, request, params }) =>
    ctrl.getOpportunity(request, user, params)
  )
  .patch("/:id/status", ({ user, request, params }) =>
    ctrl.updateStatus(request, user, params)
  )
  .post("/discover", ({ user, request }) => ctrl.discover(request, user));
```

For `IndexOpportunityController` (routes under `/indexes/:indexId/opportunities`):

```typescript
const indexOppCtrl = new IndexOpportunityController();

export const indexOpportunityRoutes = new Elysia({ prefix: "/indexes" })
  .use(authPlugin)
  .get("/:indexId/opportunities", ({ user, request, params }) =>
    indexOppCtrl.listForIndex(request, user, params)
  )
  .post("/:indexId/opportunities", ({ user, request, params }) =>
    indexOppCtrl.createManual(request, user, params)
  );
```

**Important:** `indexOpportunityRoutes` must be registered BEFORE `indexRoutes` in main.ts to avoid route conflicts with IndexController's `/:id` catch-all.

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate OpportunityController and IndexOpportunityController to Elysia plugins"
```

---

## Task 13: Migrate IndexController

**Files:**
- Modify: `protocol/src/controllers/index.controller.ts`
- Modify: `protocol/src/main.ts`

Largest controller: 13+ routes, 401 lines. Route ordering is critical — specific paths must come before `/:id` catch-all.

**Step 1: Convert to Elysia plugin**

Elysia matches routes in registration order, same as the current system.

```typescript
const ctrl = new IndexController();

export const indexRoutes = new Elysia({ prefix: "/indexes" })
  // Public route (no auth)
  .get("/public/:id", ({ request, params }) =>
    ctrl.getPublicIndex(request, undefined, params)
  )
  // Auth-required routes
  .use(authPlugin)
  .get("", ({ user, request }) => ctrl.list(request, user))
  .post("", ({ user, request }) => ctrl.create(request, user))
  .get("/search-users", ({ user, request }) =>
    ctrl.searchPersonalIndexMembers(request, user)
  )
  .get("/my-members", ({ user, request }) =>
    ctrl.getMyMembers(request, user)
  )
  .get("/discovery/public", ({ user, request }) =>
    ctrl.getPublicIndexes(request, user)
  )
  // Routes with :id param — specific sub-paths first
  .get("/:id/members", ({ user, request, params }) =>
    ctrl.getMembers(request, user, params)
  )
  .post("/:id/members", ({ user, request, params }) =>
    ctrl.addMember(request, user, params)
  )
  .delete("/:id/members/:memberId", ({ user, request, params }) =>
    ctrl.removeMember(request, user, params)
  )
  .put("/:id", ({ user, request, params }) =>
    ctrl.update(request, user, params)
  )
  .patch("/:id/permissions", ({ user, request, params }) =>
    ctrl.updatePermissions(request, user, params)
  )
  .post("/:id/join", ({ user, request, params }) =>
    ctrl.joinPublicIndex(request, user, params)
  )
  .get("/:id/member-settings", ({ user, request, params }) =>
    ctrl.getMemberSettings(request, user, params)
  )
  .get("/:id/my-intents", ({ user, request, params }) =>
    ctrl.getMyIntents(request, user, params)
  )
  .post("/:id/leave", ({ user, request, params }) =>
    ctrl.leaveIndex(request, user, params)
  )
  .delete("/:id", ({ user, request, params }) =>
    ctrl.delete(request, user, params)
  )
  // Catch-all /:id MUST be last
  .get("/:id", ({ user, request, params }) =>
    ctrl.get(request, user, params)
  );
```

**Step 2: Register in main.ts**

Register `indexRoutes` AFTER `indexOpportunityRoutes` to avoid `/indexes/:indexId/opportunities` being caught by IndexController's `/:id`.

**Step 3: Verify and commit**

```bash
git commit -m "feat(protocol): migrate IndexController to Elysia plugin"
```

---

## Task 14: Migrate ChatController

**Files:**
- Modify: `protocol/src/controllers/chat.controller.ts`
- Modify: `protocol/src/main.ts`

9 routes, 551 lines. Includes SSE streaming endpoints.

**Step 1: Convert to Elysia plugin**

```typescript
const ctrl = new ChatController();

export const chatRoutes = new Elysia({ prefix: "/chat" })
  // Public route (no auth) — shared session viewing
  .get("/shared/:token", ({ request, params }) =>
    ctrl.getSharedSession(request, undefined, params)
  )
  // Auth-required routes
  .use(authPlugin)
  .post("/message", ({ user, request }) => ctrl.message(request, user))
  .post("/stream", ({ user, request }) => ctrl.messageStream(request, user))
  .get("/sessions", ({ user, request }) => ctrl.getSessions(request, user))
  .post("/session", ({ user, request }) => ctrl.getSession(request, user))
  .post("/session/delete", ({ user, request }) =>
    ctrl.deleteSession(request, user)
  )
  .post("/session/title", ({ user, request }) =>
    ctrl.updateSessionTitle(request, user)
  )
  .post("/session/share", ({ user, request }) =>
    ctrl.shareSession(request, user)
  )
  .post("/session/unshare", ({ user, request }) =>
    ctrl.unshareSession(request, user)
  );
```

**Note:** The SSE streaming endpoints (`/stream`, `/xmtp/stream`) return `Response` objects with `Content-Type: text/event-stream`. Elysia supports returning raw `Response` objects from handlers, so this should work as-is.

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate ChatController to Elysia plugin"
```

---

## Task 15: Migrate MessagingController

**Files:**
- Modify: `protocol/src/controllers/messaging.controller.ts`
- Modify: `protocol/src/main.ts`

6 routes, 253 lines. Has constructor DI: `constructor(messagingService: MessagingService)`. Includes SSE streaming.

**Step 1: Convert to Elysia plugin**

```typescript
export const createMessagingRoutes = (messagingService: MessagingService) => {
  const ctrl = new MessagingController(messagingService);

  return new Elysia({ prefix: "/xmtp" })
    .use(authPlugin)
    .get("/conversations", ({ user, request }) =>
      ctrl.listConversations(request, user)
    )
    .post("/messages", ({ user, request }) =>
      ctrl.getMessages(request, user)
    )
    .post("/send", ({ user, request }) =>
      ctrl.sendMessage(request, user)
    )
    .post("/conversations/delete", ({ user, request }) =>
      ctrl.deleteConversation(request, user)
    )
    .post("/find-dm", ({ user, request }) =>
      ctrl.findDm(request, user)
    )
    .post("/peer-info", ({ user, request }) =>
      ctrl.peerInfo(request, user)
    )
    .get("/stream", ({ user, request }) =>
      ctrl.streamMessages(request, user)
    );
};
```

In `main.ts`:
```typescript
app.use(createMessagingRoutes(messagingService));
```

**Step 2: Register, verify, commit**

```bash
git commit -m "feat(protocol): migrate MessagingController to Elysia plugin"
```

---

## Task 16: Remove Old Routing Infrastructure

**Files:**
- Delete: `protocol/src/lib/router/router.decorators.ts`
- Delete: `protocol/src/guards/auth.guard.ts` (replaced by `plugins/auth.plugin.ts`)
- Modify: `protocol/src/main.ts` (remove compatibility layer)
- Modify: All controllers (remove any remaining decorator imports)

**Step 1: Remove the compatibility catch-all route from main.ts**

Remove the `root.all("/*", ...)` fallback that delegates to old `RouteRegistry`.

**Step 2: Remove RouteRegistry and old imports**

Delete `router.decorators.ts`. Remove all imports of `Controller`, `Get`, `Post`, `Put`, `Delete`, `Patch`, `UseGuards` from controller files.

**Step 3: Remove old AuthGuard**

Delete `auth.guard.ts`. All controllers now use `authPlugin` via Elysia's `.use()`.

**Step 4: Remove old CORS handling**

The `getCorsHeaders()` function in `src/lib/cors.ts` is no longer needed for route handling (Elysia's `@elysiajs/cors` handles it). Keep `getTrustedOrigins()` since Better Auth still uses it.

**Step 5: Verify everything still works**

Ask user to run:
```bash
cd protocol && bun run dev
```

Test:
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/auth/providers
# Test an authenticated endpoint
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(protocol): remove old decorator routing system, RouteRegistry, and AuthGuard"
```

---

## Task 17: Export Type App for Eden Treaty

**Files:**
- Modify: `protocol/src/main.ts`

**Step 1: Verify the type export**

The `export type App = typeof root;` line added in Task 4 should already be in place. Verify that the type includes all registered routes by creating a quick type check:

```typescript
// Temporary type check (remove after verifying):
// import type { App } from "./main";
// type Routes = App["_routes"]; // Should show all route definitions
```

**Step 2: Verify the app type is importable**

Create a temporary test file:
```typescript
// protocol/src/_type-check.ts (temporary, delete after)
import type { App } from "./main";
type _Check = App extends { listen: Function } ? true : never;
const _: _Check = true;
```

Run:
```bash
cd protocol && bunx tsc --noEmit src/_type-check.ts
```
Expected: No type errors

Delete the temporary file.

**Step 3: Commit**

```bash
git commit -m "feat(protocol): verify Elysia type App export for Eden Treaty"
```

---

## Task 18: Final Verification

**Step 1: Run the full test suite**

Ask the user to run:
```bash
cd protocol && bun test
```

All 68 test files should pass. Controller tests call methods directly, so they're unaffected by the routing change.

**Step 2: Manual smoke test**

Ask user to start the dev server and verify:
1. `GET /health` → `{ status: "ok" }`
2. `GET /api/auth/providers` → Better Auth providers
3. `GET /dev/queues/` → Bull Board UI
4. Auth flow: login → get JWT → use JWT on protected endpoints
5. SSE streaming: `/api/chat/stream` returns event stream
6. File upload: `/api/uploads` accepts multipart
7. CORS: Cross-origin requests with credentials work

**Step 3: Final commit if any adjustments needed**

```bash
git commit -m "fix(protocol): address issues from final verification"
```

---

## Summary

| Task | Description | Files Changed | Routes Migrated |
|------|-------------|---------------|-----------------|
| 1 | Add Elysia deps | package.json | — |
| 2 | Auth plugin | +auth.plugin.ts | — |
| 3 | Error handler plugin | +error.plugin.ts | — |
| 4 | Elysia skeleton + compat layer | main.ts | /health, Better Auth, Bull Board |
| 5 | AuthController | auth.controller.ts | 3 routes |
| 6 | UserController | user.controller.ts | 2 routes |
| 7 | ProfileController | profile.controller.ts | 1 route |
| 8 | LinkController | link.controller.ts | 4 routes |
| 9 | FileController | file.controller.ts | 3 routes |
| 10 | IntentController | intent.controller.ts | 7 routes |
| 11 | UploadController | upload.controller.ts | 3 routes |
| 12 | OpportunityController | opportunity.controller.ts | 8 routes |
| 13 | IndexController | index.controller.ts | 17 routes |
| 14 | ChatController | chat.controller.ts | 9 routes |
| 15 | MessagingController | messaging.controller.ts | 7 routes |
| 16 | Remove old routing | -decorators, -guard, main.ts | — |
| 17 | Verify type export | main.ts | — |
| 18 | Final verification | — | — |
| **Total** | | | **64 routes** |

## Notes for Implementation

- **Route ordering matters**: Elysia matches routes in registration order. Specific paths (e.g., `/discovery/public`) must be registered before generic patterns (e.g., `/:id`).
- **Response compatibility**: Current handlers return either `Response` objects or plain objects. Elysia handles both: `Response` objects are passed through, plain objects are JSON-serialized.
- **SSE streaming**: Handlers that return `new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })` work as-is with Elysia.
- **Multipart uploads**: Handlers that use `Busboy` to parse `req` will work since `request` is the native `Request` object.
- **Controller tests**: Since tests call `controller.method(req, user)` directly, they're unaffected by the routing change. No test modifications needed.
- **Gradual migration**: The compatibility layer (Task 4) means the server works at every commit. Each controller can be migrated independently.
