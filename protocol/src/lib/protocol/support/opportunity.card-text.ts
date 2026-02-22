/**
 * Viewer-centric text for opportunity cards.
 * The card is shown to the viewer (logged-in user) and should introduce the
 * counterpart, not describe the viewer to themselves.
 */

import { MINIMAL_MAIN_TEXT_MAX_CHARS } from "./opportunity.constants";
import { stripUuids } from "./opportunity.sanitize";

/**
 * Splits text into sentences using (?<=[.!?])\s+ (period/exclamation/question followed by whitespace).
 * Note: splits after any such punctuation, including abbreviations like "Dr." or "e.g.".
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns viewer-centric main text for an opportunity card.
 * Prefers the part of the reasoning that describes the counterpart (the person
 * on the card), so the viewer sees an introduction to the counterpart rather
 * than a description of themselves.
 *
 * @param reasoning - Raw interpretation.reasoning (may describe both parties).
 * @param counterpartName - Display name of the suggested connection (e.g. "Alex Chen").
 * @param maxChars - Max length of returned string (default MINIMAL_MAIN_TEXT_MAX_CHARS).
 * @param viewerName - Optional display name of the viewer (signed-in user). When provided, sentences or prefixes describing the viewer are skipped so the card introduces the counterpart, not the viewer.
 * @returns Viewer-centric snippet mentioning the counterpart when possible; if counterpartName is empty, returns reasoning truncated to maxChars. Never null; may be "A suggested connection." when reasoning is empty.
 */
export function viewerCentricCardSummary(
  reasoning: string,
  counterpartName: string,
  maxChars: number = MINIMAL_MAIN_TEXT_MAX_CHARS,
  viewerName?: string,
): string {
  const raw = stripUuids(reasoning);
  if (!raw) return "A suggested connection.";

  const name = counterpartName.trim();
  if (!name) {
    return raw.length <= maxChars ? raw : raw.slice(0, maxChars) + "...";
  }

  const sentences = splitSentences(raw);
  const nameLower = name.toLowerCase();
  const firstWordOfName = name.split(/\s+/)[0]?.toLowerCase();
  const hasCounterpartName = (s: string) =>
    s.toLowerCase().includes(nameLower) ||
    (firstWordOfName && firstWordOfName.length > 1 && s.toLowerCase().includes(firstWordOfName));

  const viewer = viewerName?.trim().toLowerCase();
  const viewerFirstWord = viewerName?.trim().split(/\s+/)[0]?.toLowerCase();
  const startsWithViewer = (s: string) => {
    if (!viewer) return false;
    const sl = s.toLowerCase();
    return sl.startsWith(viewer) ||
      (viewerFirstWord && viewerFirstWord.length > 1 && sl.startsWith(viewerFirstWord));
  };

  // When viewerName is provided, prefer sentences that mention the counterpart
  // but do NOT start with the viewer's name.
  if (viewer) {
    // First pass: find a sentence that mentions counterpart and doesn't start with viewer
    const cleanIdx = sentences.findIndex(
      (s) => hasCounterpartName(s) && !startsWithViewer(s),
    );
    if (cleanIdx !== -1) {
      const result = sentences.slice(cleanIdx).join(" ").trim();
      if (result.length <= maxChars) return result;
      return result.slice(0, maxChars) + "...";
    }

    // Second pass: sentence mentions counterpart but starts with viewer (compound sentence).
    // Try to extract the counterpart portion after the counterpart's name.
    const compoundIdx = sentences.findIndex(
      (s) => hasCounterpartName(s) && startsWithViewer(s),
    );
    if (compoundIdx !== -1) {
      const sentence = sentences[compoundIdx];
      // Find where the counterpart name appears and extract from there
      const cpIdx = sentence.toLowerCase().indexOf(nameLower);
      if (cpIdx > 0) {
        const extracted = sentence.slice(cpIdx).trim();
        const rest = sentences.slice(compoundIdx + 1).join(" ").trim();
        const result = rest ? `${extracted} ${rest}` : extracted;
        if (result.length <= maxChars) return result;
        return result.slice(0, maxChars) + "...";
      }
    }
  }

  // Fallback: original logic without viewer awareness
  const idx = sentences.findIndex(hasCounterpartName);
  if (idx === -1) {
    return raw.length <= maxChars ? raw : raw.slice(0, maxChars) + "...";
  }

  const fromCounterpart = sentences.slice(idx).join(" ").trim();
  if (fromCounterpart.length <= maxChars) return fromCounterpart;
  return fromCounterpart.slice(0, maxChars) + "...";
}
