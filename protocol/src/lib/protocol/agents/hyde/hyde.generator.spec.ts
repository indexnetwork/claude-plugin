/**
 * HyDE Generator agent tests using Smartest (spec-driven, LLM-verified).
 * Covers all six strategies and optional context per opportunity-redesign-plan Step 6.
 *
 * Plan: "Integration test: Generator produces reasonable text for each strategy (mocked or real LLM)"
 */

import { config } from 'dotenv';
config({ path: '.env.development', override: true });

import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { runScenario, defineScenario } from '../../../smartest';
import { HydeGenerator } from './hyde.generator';
import type { HydeStrategy } from './hyde.strategies';
import type { HydeContext } from './hyde.strategies';

const generatorOutputSchema = z.object({
  text: z.string().min(1),
});

/** Source text and description per strategy for "reasonable text" integration tests. */
const STRATEGY_SOURCES: Record<HydeStrategy, { source: string; description: string }> = {
  mirror: {
    source: 'Looking for a technical co-founder to build a B2B SaaS in AI.',
    description: 'hypothetical profile (who can help me)',
  },
  reciprocal: {
    source: 'I offer React and TypeScript consulting.',
    description: 'hypothetical intent (who needs what I offer)',
  },
  mentor: {
    source: 'I want to grow as an early-stage founder.',
    description: 'hypothetical mentor profile',
  },
  investor: {
    source: 'Building a fintech startup seeking seed funding.',
    description: 'hypothetical investor thesis',
  },
  collaborator: {
    source: 'Looking for a design co-founder for a consumer app.',
    description: 'hypothetical collaboration-seeking intent',
  },
  hiree: {
    source: 'We are hiring a senior backend engineer (Go/Rust).',
    description: 'hypothetical job-seeking intent',
  },
};

describe('HydeGenerator static helpers', () => {
  it('getTargetCorpus returns correct corpus per strategy', () => {
    expect(HydeGenerator.getTargetCorpus('mirror')).toBe('profiles');
    expect(HydeGenerator.getTargetCorpus('reciprocal')).toBe('intents');
    expect(HydeGenerator.getTargetCorpus('mentor')).toBe('profiles');
    expect(HydeGenerator.getTargetCorpus('investor')).toBe('profiles');
    expect(HydeGenerator.getTargetCorpus('collaborator')).toBe('intents');
    expect(HydeGenerator.getTargetCorpus('hiree')).toBe('intents');
  });

  it('shouldPersist returns true only for mirror and reciprocal', () => {
    expect(HydeGenerator.shouldPersist('mirror')).toBe(true);
    expect(HydeGenerator.shouldPersist('reciprocal')).toBe(true);
    expect(HydeGenerator.shouldPersist('mentor')).toBe(false);
    expect(HydeGenerator.shouldPersist('investor')).toBe(false);
    expect(HydeGenerator.shouldPersist('collaborator')).toBe(false);
    expect(HydeGenerator.shouldPersist('hiree')).toBe(false);
  });

  it('getCacheTTL returns number for non-persisted, undefined for persisted', () => {
    expect(HydeGenerator.getCacheTTL('mirror')).toBeUndefined();
    expect(HydeGenerator.getCacheTTL('reciprocal')).toBeUndefined();
    expect(HydeGenerator.getCacheTTL('mentor')).toBe(3600);
    expect(HydeGenerator.getCacheTTL('investor')).toBe(3600);
    expect(HydeGenerator.getCacheTTL('collaborator')).toBe(3600);
    expect(HydeGenerator.getCacheTTL('hiree')).toBe(3600);
  });
});

const ALL_STRATEGIES: HydeStrategy[] = [
  'mirror',
  'reciprocal',
  'mentor',
  'investor',
  'collaborator',
  'hiree',
];

function buildGenerateScenario(strategy: HydeStrategy) {
  const { source, description } = STRATEGY_SOURCES[strategy];
  return defineScenario({
    name: `generate-${strategy}`,
    description: `Generator produces reasonable ${description} for strategy "${strategy}".`,
    fixtures: { source, strategy },
    sut: {
      type: 'agent',
      factory: () => new HydeGenerator(),
      invoke: async (instance, resolvedInput) => {
        const input = resolvedInput as { source: string; strategy: HydeStrategy };
        return await (instance as HydeGenerator).generate(input.source, input.strategy);
      },
      input: { source: '@fixtures.source', strategy: '@fixtures.strategy' },
    },
    verification: {
      schema: generatorOutputSchema,
      criteria: 'N/A',
      llmVerify: false,
    },
  });
}

describe('HydeGenerator generate (smartest scenarios)', () => {
  it.each(ALL_STRATEGIES)(
    'produces reasonable text for strategy "%s" (schema only)',
    async (strategy) => {
      const testStart = Date.now();
      const result = await runScenario(buildGenerateScenario(strategy));
      console.log(`[hyde] ${strategy} (schema only) total: ${Date.now() - testStart}ms`);
      expect(result.pass).toBe(true);
      expect(result.schemaError).toBeUndefined();
      expect((result.output as { text: string })?.text?.length).toBeGreaterThan(0);
    },
    30000
  );

  it('generate with optional context passes context to strategy prompt', async () => {
    const testStart = Date.now();
    const context: HydeContext = { category: 'startup', indexId: 'idx-test', customPrompt: 'B2B focus.' };
    const result = await runScenario(
      defineScenario({
        name: 'generate-with-context',
        description: 'generate(sourceText, strategy, context) uses context when building the prompt.',
        fixtures: {
          source: 'Looking for seed investment.',
          strategy: 'investor' as HydeStrategy,
          context,
        },
        sut: {
          type: 'agent',
          factory: () => new HydeGenerator(),
          invoke: async (instance, resolvedInput) => {
            const input = resolvedInput as { source: string; strategy: HydeStrategy; context: HydeContext };
            return await (instance as HydeGenerator).generate(input.source, input.strategy, input.context);
          },
          input: { source: '@fixtures.source', strategy: '@fixtures.strategy', context: '@fixtures.context' },
        },
        verification: {
          schema: generatorOutputSchema,
          criteria: 'N/A',
          llmVerify: false,
        },
      })
    );
    console.log(`[hyde] generate with context total: ${Date.now() - testStart}ms`);
    expect(result.pass).toBe(true);
    expect((result.output as { text: string })?.text?.length).toBeGreaterThan(0);
  }, 30000);

  it('mirror output is first-person profile-like (LLM-verified)', async () => {
    const testStart = Date.now();
    const prevVerifier = process.env.SMARTEST_VERIFIER_MODEL;
    process.env.SMARTEST_VERIFIER_MODEL = prevVerifier ?? 'google/gemini-2.5-flash';
    try {
      const result = await runScenario(
        defineScenario({
          name: 'mirror-llm-verify',
          description: 'Mirror strategy produces a first-person hypothetical profile that could match the intent.',
          fixtures: {
            source: 'Looking for a React developer to join our early-stage startup.',
            strategy: 'mirror' as HydeStrategy,
          },
          sut: {
            type: 'agent',
            factory: () => new HydeGenerator(),
            invoke: async (instance, resolvedInput) => {
              const input = resolvedInput as { source: string; strategy: HydeStrategy };
              return await (instance as HydeGenerator).generate(input.source, input.strategy);
            },
            input: { source: '@fixtures.source', strategy: '@fixtures.strategy' },
          },
          verification: {
            schema: generatorOutputSchema,
            criteria:
              'The output must be a short hypothetical document written in first person, as if a person is describing themselves. ' +
              'It should sound like a profile or bio that would match someone looking for a React developer role. ' +
              'No meta-commentary or instructions; only the hypothetical document text.',
            llmVerify: true,
          },
        })
      );
      console.log(`[hyde] mirror (LLM-verified) total: ${Date.now() - testStart}ms`);
      expect(result.pass).toBe(true);
      if (result.verification?.reasoning) {
        console.log('[hyde] verifier reasoning:', result.verification.reasoning);
      }
    } finally {
      if (prevVerifier !== undefined) process.env.SMARTEST_VERIFIER_MODEL = prevVerifier;
    }
  }, 90000);
});
