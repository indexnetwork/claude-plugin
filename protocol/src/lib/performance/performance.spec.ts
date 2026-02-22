import { beforeEach, describe, expect, it } from "bun:test";
import { getStats, recordTiming, resetStats } from "./performance.aggregator";

describe("performance aggregator", () => {
  beforeEach(() => {
    resetStats();
  });

  it("returns empty stats when nothing recorded", () => {
    const stats = getStats();
    expect(Object.keys(stats).length).toBe(0);
  });

  it("records durations and returns count and percentiles", () => {
    recordTiming("foo", 100);
    recordTiming("foo", 200);
    recordTiming("foo", 300);
    recordTiming("bar", 50);

    const stats = getStats();

    expect(stats.foo.count).toBe(3);
    expect(stats.foo.p50).toBe(200);
    expect(stats.foo.p95).toBeGreaterThanOrEqual(200);
    expect(stats.bar.count).toBe(1);
    expect(stats.bar.p50).toBe(50);
  });

  it("evicts oldest samples when exceeding max", () => {
    for (let i = 0; i < 510; i++) {
      recordTiming("capped", i);
    }
    const stats = getStats();
    expect(stats.capped.count).toBe(500);
  });

  it("resetStats clears all data", () => {
    recordTiming("foo", 100);
    resetStats();
    const stats = getStats();
    expect(Object.keys(stats).length).toBe(0);
  });
});
