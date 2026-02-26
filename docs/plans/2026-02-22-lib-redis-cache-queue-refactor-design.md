# Refactor: lib/redis.ts, Cache Adapter, BullMQ Connections, Email Queue

**Date**: 2026-02-22
**Branch**: refactor/lib-cleanup
**Status**: Approved

## Problem

`protocol/src/lib/redis.ts` mixes two unrelated concerns (general caching and BullMQ connections) in a single loose file. The email queue module (`lib/email/queue/`) has 3 separate files that don't follow the queue template. Dead code (`CacheClient`, `cache` singleton) has zero consumers.

## Design

### 1. Split and delete `lib/redis.ts`

| Export | Destination | Rationale |
|--------|------------|-----------|
| `getRedisClient()` | `adapters/cache.adapter.ts` | Primary consumer is the cache adapter; queues also use it for caching ops |
| `closeRedisConnection()` | `adapters/cache.adapter.ts` | Paired with `getRedisClient()` |
| `getBullMQConnection()` | `lib/bullmq/bullmq.ts` (private) | Only BullMQ needs these options; QueueFactory owns its connections |
| `CacheClient` class | Deleted | Zero external consumers |
| `cache` singleton | Deleted | Zero external consumers |

After this, `lib/redis.ts` is deleted.

### 2. QueueFactory uses `getBullMQConnection()` directly

Currently QueueFactory imports `getRedisClient()`, spreads its `.options`, and patches `maxRetriesPerRequest: null`. After the refactor, `getBullMQConnection()` lives in `lib/bullmq/bullmq.ts` as a private function. QueueFactory calls it directly — no more indirect patch.

### 3. Email queue consolidation

Merge 3 files into a single class-based queue:

- `lib/email/queue/email.queue.ts` → `queues/email.queue.ts`
- `lib/email/queue/email.worker.ts` → merged into class
- `lib/email/queue/email.processor.ts` → merged as handler method

The new `EmailQueue` class:
- Uses `QueueFactory.createQueue()` and `QueueFactory.createWorker()`
- Follows the queue template (class with `startWorker()`, `processJob()`, `addJob()`)
- Worker started from `main.ts` (not at module load)
- Preserves email-specific settings: 5 retries, rate limiter `{ max: 2, duration: 1000 }`

Files deleted from `lib/email/queue/`: `email.queue.ts`, `email.worker.ts`, `email.processor.ts`.
Files kept in `lib/email/`: templates, `transport.helper.ts`, `notification.sender.ts`, `email.module.ts`.

### 4. Import path updates

| Consumer | Old import | New import |
|----------|-----------|------------|
| `notification.queue.ts` | `../lib/redis` → `getRedisClient` | `../adapters/cache.adapter` → `getRedisClient` |
| `cache.adapter.spec.ts` | `../../lib/redis` → `getRedisClient` | `./cache.adapter` or `../cache.adapter` → `getRedisClient` |
| `queues.controller.ts` | `../lib/email/queue/email.queue` → `emailQueue` | `../queues/email.queue` → `emailQueue` |
| `lib/email/transport.helper.ts` | `./queue/email.queue` → `addEmailJob` | `../../queues/email.queue` → `emailQueue.addJob(...)` |
| `main.ts` | (no email worker import) | Add `emailQueue.startWorker()` |

### 5. Scope exclusions

- `adapters/queue.adapter.ts` — untouched (interface/types only)
- Existing queues (intent, notification, opportunity, hyde) — only import paths change
- `lib/email/` templates, transport helper, notification sender — content unchanged (only import paths)
