import { describe, expect, it } from "bun:test";

import { shouldEnrichGhostDisplayNameFromParallel } from "../profile.enrichment-display-name";

describe("shouldEnrichGhostDisplayNameFromParallel", () => {
  it("returns true for ghost with email-local placeholder and enriched full name", () => {
    expect(
      shouldEnrichGhostDisplayNameFromParallel(
        { name: "jane", email: "jane@company.com", isGhost: true },
        "Jane Q. Public",
      ),
    ).toBe(true);
  });

  it("returns false for non-ghost", () => {
    expect(
      shouldEnrichGhostDisplayNameFromParallel(
        { name: "jane", email: "jane@company.com", isGhost: false },
        "Jane Public",
      ),
    ).toBe(false);
  });

  it("returns false when enriched name is single word", () => {
    expect(
      shouldEnrichGhostDisplayNameFromParallel(
        { name: "jane", email: "jane@company.com", isGhost: true },
        "Jane",
      ),
    ).toBe(false);
  });

  it("returns false when ghost already has a non-placeholder name", () => {
    expect(
      shouldEnrichGhostDisplayNameFromParallel(
        { name: "Jane Doe", email: "jane@company.com", isGhost: true },
        "Jane Public",
      ),
    ).toBe(false);
  });

  it("returns false when enriched name matches current display name", () => {
    expect(
      shouldEnrichGhostDisplayNameFromParallel(
        { name: "Jane Public", email: "jane@company.com", isGhost: true },
        "Jane Public",
      ),
    ).toBe(false);
  });
});
