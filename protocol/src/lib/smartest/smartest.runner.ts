/**
 * Smartest runner: resolve fixtures, invoke SUT, run verification.
 */

import type {
  RunScenarioResult,
  RunScenarioOptions,
  SmartestScenario,
} from './smartest.types';
import { resolveFixtures, resolveInputRefs } from './smartest.fixtures';
import { mergeGeneratorRegistry } from './smartest.generators';
import { runSchemaCheck, runLlmVerifier } from './smartest.verifier';

/**
 * Run a single scenario: generate fixtures, resolve input refs, invoke SUT, verify.
 * All data is in-memory; nothing is persisted.
 * Pass options.generators to override or extend the default generator registry.
 */
export async function runScenario(
  scenario: SmartestScenario,
  options?: RunScenarioOptions
): Promise<RunScenarioResult> {
  const log = (phase: string, ms: number) =>
    console.log(`[smartest] ${scenario.name} | ${phase}: ${ms}ms`);
  const startTotal = Date.now();

  const registry = mergeGeneratorRegistry(options?.generators);

  let t0 = Date.now();
  const resolved = await resolveFixtures(scenario, registry);
  const resolvedInput = resolveInputRefs(scenario.sut.input, resolved);
  log('resolveFixtures', Date.now() - t0);

  t0 = Date.now();
  const instance = scenario.sut.factory();
  const output = await scenario.sut.invoke(instance, resolvedInput);
  log('invoke (SUT)', Date.now() - t0);

  const { verification: config } = scenario;
  const llmVerify = config.llmVerify !== false;

  if (config.schema) {
    t0 = Date.now();
    const schemaResult = runSchemaCheck(output, config.schema);
    log('schemaCheck', Date.now() - t0);
    if (!schemaResult.ok) {
      console.log(`[smartest] ${scenario.name} | total: ${Date.now() - startTotal}ms (fail: schema)`);
      return {
        pass: false,
        output,
        schemaError: schemaResult.error,
      };
    }
  }

  if (!llmVerify) {
    console.log(`[smartest] ${scenario.name} | total: ${Date.now() - startTotal}ms (pass, no LLM)`);
    return {
      pass: true,
      output,
    };
  }

  t0 = Date.now();
  const verification = await runLlmVerifier(
    scenario.description,
    resolvedInput,
    output,
    config.criteria
  );
  log('llmVerifier', Date.now() - t0);

  console.log(`[smartest] ${scenario.name} | total: ${Date.now() - startTotal}ms (pass=${verification.pass})`);
  return {
    pass: verification.pass,
    output,
    verification,
  };
}
