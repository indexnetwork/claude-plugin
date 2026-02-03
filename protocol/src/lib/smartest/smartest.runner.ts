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
  const registry = mergeGeneratorRegistry(options?.generators);
  const resolved = await resolveFixtures(scenario, registry);
  const resolvedInput = resolveInputRefs(scenario.sut.input, resolved);

  const instance = scenario.sut.factory();
  const output = await scenario.sut.invoke(instance, resolvedInput);

  const { verification: config } = scenario;
  const llmVerify = config.llmVerify !== false;

  if (config.schema) {
    const schemaResult = runSchemaCheck(output, config.schema);
    if (!schemaResult.ok) {
      return {
        pass: false,
        output,
        schemaError: schemaResult.error,
      };
    }
  }

  if (!llmVerify) {
    return {
      pass: true,
      output,
    };
  }

  const verification = await runLlmVerifier(
    scenario.description,
    resolvedInput,
    output,
    config.criteria
  );

  return {
    pass: verification.pass,
    output,
    verification,
  };
}
