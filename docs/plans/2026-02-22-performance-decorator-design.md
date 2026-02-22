# Performance Decorator Library

## Overview

A decorator-based performance tracking library for `protocol/src/lib/protocol/`. Tracks execution duration of agent methods, graph nodes, and full graph executions. Stores stats in-memory and exposes them via a dev-only API endpoint.

## File Structure

```
protocol/src/lib/performance/
├── index.ts                    # Barrel exports
├── performance.aggregator.ts   # recordTiming, getStats, resetStats
├── performance.decorator.ts    # Timed() method decorator
├── performance.wrapper.ts      # timed() function wrapper
└── performance.spec.ts         # Tests
```

## Core API

### Aggregator (`performance.aggregator.ts`)

Module-level `Map<string, number[]>` store, capped at 500 samples per name (oldest evicted).

- `recordTiming(name: string, durationMs: number): void` — Push a timing sample.
- `getStats(): Record<string, { count: number; p50: number; p95: number }>` — Snapshot of all tracked names with percentiles.
- `resetStats(): void` — Clear all data (test use only).

### Wrapper (`performance.wrapper.ts`)

`timed<T>(name: string, fn: () => Promise<T>): Promise<T>` — Wraps any async function, records duration via `recordTiming`, rethrows errors after recording.

Usage for graph nodes and graph execution:

```typescript
const inferenceNode = await timed("IntentGraph.inference", () => originalFn(state));
const result = await timed("IntentGraph", () => compiledGraph.invoke(initialState));
```

### Decorator (`performance.decorator.ts`)

`Timed(): MethodDecorator` — Auto-derives `ClassName.methodName` as the tracking key. Replaces `descriptor.value` with a wrapper that delegates to `timed()`.

Usage on agent classes:

```typescript
class ExplicitIntentInferrer {
  @Timed()
  async invoke(content: string, profileContext: string): Promise<InferredIntents> { ... }
}
// Recorded as "ExplicitIntentInferrer.invoke"
```

## API Endpoint

`GET /dev/performance` — Dev-only (not mounted when `NODE_ENV === 'production'`). Registered in `main.ts` alongside Bull Board. Returns `getStats()` as JSON.

```json
{
  "ExplicitIntentInferrer.invoke": { "count": 42, "p50": 1200, "p95": 3400 },
  "IntentGraph.inference": { "count": 38, "p50": 2100, "p95": 5600 },
  "IntentGraph": { "count": 12, "p50": 8400, "p95": 14200 }
}
```

## Testing (`performance.spec.ts`)

1. **Aggregator** — recordTiming stores values, getStats returns correct count/p50/p95, max samples cap, resetStats clears.
2. **Wrapper** — timed() records duration, returns result, records on error then rethrows.
3. **Decorator** — @Timed() records as ClassName.methodName, works with async methods, preserves return value and `this` context.

## Decisions

- **Singleton module over class-based tracker** — Dev-only in-memory metrics don't need instantiation or isolation. Tests use `resetStats()`.
- **Auto-derived names** — `ClassName.methodName` from `target.constructor.name` avoids manual labeling.
- **Decorator + wrapper** — Decorator for class methods (agents), wrapper for closures (graph nodes). Both backed by the same `recordTiming`.
- **Dev-only endpoint** — No auth needed since it's gated on `NODE_ENV`.
