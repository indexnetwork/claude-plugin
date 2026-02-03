/**
 * Smartest model configuration: separate models per task.
 * - Data creation (e.g. fixture generators): fast model.
 * - Validation (LLM verifier): thinking model for judgment.
 */

/** OpenRouter model for LLM-based data creation (e.g. future fixture generators). */
export const SMARTEST_GENERATOR_MODEL =
  process.env.SMARTEST_GENERATOR_MODEL ?? 'google/gemini-2.5-flash';

/** OpenRouter model for the verifier (test oracle). Use a thinking model for judgment. */
export const SMARTEST_VERIFIER_MODEL =
  process.env.SMARTEST_VERIFIER_MODEL ?? 'google/gemini-2.5-pro';

/** Read at runtime so tests can override via process.env before runScenario. */
export function getSmartestVerifierModel(): string {
  return process.env.SMARTEST_VERIFIER_MODEL ?? 'google/gemini-2.5-pro';
}
