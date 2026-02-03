/**
 * Smartest verifier: schema validation + LLM judge.
 * Uses a thinking model (e.g. Gemini 2.5 Pro) for validation; see smartest.config.ts.
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { getSmartestVerifierModel } from './smartest.config';
import type { VerificationResult } from './smartest.types';
import {
  SMARTEST_VERIFIER_SYSTEM_PROMPT,
  buildVerifierUserMessage,
  smartestVerifierOutputSchema,
} from './smartest.verifier.prompt';

/**
 * Run optional schema validation on the output. Returns error message if invalid.
 */
export function runSchemaCheck(
  output: unknown,
  schema: { parse: (v: unknown) => unknown }
): { ok: true } | { ok: false; error: string } {
  try {
    schema.parse(output);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Call the LLM verifier and return pass + reasoning.
 * Uses a thinking model (default: Gemini 2.5 Pro). Override via SMARTEST_VERIFIER_MODEL.
 */
export async function runLlmVerifier(
  scenarioDescription: string,
  input: unknown,
  output: unknown,
  criteria: string
): Promise<VerificationResult> {
  const modelId = getSmartestVerifierModel();

  const userContent = buildVerifierUserMessage(
    scenarioDescription,
    input,
    output,
    criteria
  );

  const model = new ChatOpenAI({
    model: modelId,
    apiKey: process.env.OPENROUTER_API_KEY!,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    temperature: 0.2,
    maxTokens: 500,
  });

  const structuredModel = model.withStructuredOutput(smartestVerifierOutputSchema, {
    name: 'smartest_verifier',
  });

  const messages = [
    new SystemMessage(SMARTEST_VERIFIER_SYSTEM_PROMPT),
    new HumanMessage(userContent),
  ];

  const parsed = await structuredModel.invoke(messages);

  if (!parsed || typeof parsed.pass !== 'boolean') {
    return {
      pass: false,
      reasoning: 'Verifier did not return a valid { pass, reasoning } object.',
    };
  }

  return {
    pass: parsed.pass,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}
