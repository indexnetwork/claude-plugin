import { describe, expect, it } from "bun:test";

import { viewerCentricCardSummary } from "../opportunity.card-text";

describe("viewerCentricCardSummary", () => {
  // ── Existing behavior (should remain unchanged) ──

  it("returns fallback when reasoning is empty", () => {
    expect(viewerCentricCardSummary("", "Alex Chen")).toBe(
      "A suggested connection.",
    );
  });

  it("returns full reasoning when counterpartName is empty", () => {
    const reasoning = "Two developers with complementary skills.";
    expect(viewerCentricCardSummary(reasoning, "")).toBe(reasoning);
  });

  it("returns sentences starting from counterpart mention", () => {
    const reasoning =
      "The source user needs a React developer. Alex Chen is a full-stack engineer focused on React and Node.";
    expect(viewerCentricCardSummary(reasoning, "Alex Chen")).toBe(
      "Alex Chen is a full-stack engineer focused on React and Node.",
    );
  });

  it("returns full reasoning when counterpart name not found", () => {
    const reasoning = "Both users have complementary skills in web development.";
    expect(viewerCentricCardSummary(reasoning, "Unknown Person")).toBe(
      reasoning,
    );
  });

  // ── Bug 2: Viewer self-referencing text ──

  it("strips viewer-describing prefix from compound sentence mentioning both names", () => {
    const reasoning =
      "Yankı Ekin Yüksel is interested in AI in software development and could potentially collaborate with Elena Petrova, an applied AI researcher building an AI operations toolkit and looking for technical collaborators.";
    const result = viewerCentricCardSummary(
      reasoning,
      "Elena Petrova",
      500,
      "Yankı Ekin Yüksel",
    );
    // Should NOT start with the viewer's name
    expect(result).not.toMatch(/^Yankı/);
    // Should mention Elena Petrova
    expect(result).toContain("Elena Petrova");
  });

  it("strips viewer-describing prefix when sentence starts with viewer first name", () => {
    const reasoning =
      "Yankı is looking to recruit designers for a game development studio. Yuki Tanaka is a visual artist and illustrator with a focus on character design.";
    const result = viewerCentricCardSummary(
      reasoning,
      "Yuki Tanaka",
      500,
      "Yankı Ekin Yüksel",
    );
    // Should start with Yuki's sentence, not the viewer's
    expect(result).toMatch(/^Yuki Tanaka/);
  });

  it("works without viewerName (backwards compatible)", () => {
    const reasoning =
      "Alex Chen is a full-stack engineer focused on React and Node.";
    // No viewerName param — should work the same as before
    expect(viewerCentricCardSummary(reasoning, "Alex Chen")).toBe(reasoning);
  });

  it("prefers sentences that start with counterpart name over compound sentences", () => {
    const reasoning =
      "The viewer is interested in AI and could work with Elena Petrova. Elena Petrova is an applied AI researcher building an AI operations toolkit.";
    const result = viewerCentricCardSummary(
      reasoning,
      "Elena Petrova",
      500,
      "The viewer",
    );
    // Should prefer the sentence that starts with Elena
    expect(result).toMatch(/^Elena Petrova is an applied AI researcher/);
  });

  it("handles single compound sentence with both names by extracting counterpart part", () => {
    const reasoning =
      "Yankı Ekin Yüksel is interested in AI in software development and could potentially collaborate with Elena Petrova, an applied AI researcher building an AI operations toolkit.";
    const result = viewerCentricCardSummary(
      reasoning,
      "Elena Petrova",
      500,
      "Yankı Ekin Yüksel",
    );
    // Should extract the counterpart portion
    expect(result).toContain("Elena Petrova");
    expect(result).not.toMatch(/^Yankı/);
  });
});
