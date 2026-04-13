import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import register from '../index.js';
import type {
  OpenClawPluginApi,
  SubagentRunOptions,
} from '../plugin-api.js';

interface FakeApi {
  api: OpenClawPluginApi;
  subagentCalls: SubagentRunOptions[];
  logger: { warn: ReturnType<typeof mock>; error: ReturnType<typeof mock>; info: ReturnType<typeof mock>; debug: ReturnType<typeof mock> };
}

function buildFakeApi(config: Record<string, unknown>): FakeApi {
  const subagentCalls: SubagentRunOptions[] = [];
  const logger = {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };

  const api: OpenClawPluginApi = {
    id: 'indexnetwork-openclaw-plugin',
    name: 'Index Network',
    pluginConfig: config,
    runtime: {
      subagent: {
        run: async (opts) => {
          subagentCalls.push(opts);
          return { runId: 'fake-run-id' };
        },
      },
    },
    logger,
  };

  return { api, subagentCalls, logger };
}

describe('register(api)', () => {
  let fake: FakeApi;

  test('logs warning and does not start polling without agentId/apiKey', () => {
    fake = buildFakeApi({});
    register(fake.api);

    expect(fake.logger.warn).toHaveBeenCalled();
    expect(fake.logger.info).not.toHaveBeenCalled();
  });

  test('logs info and starts polling with agentId and apiKey', () => {
    fake = buildFakeApi({ agentId: 'agent-1', apiKey: 'key-1' });
    register(fake.api);

    expect(fake.logger.warn).not.toHaveBeenCalled();
    expect(fake.logger.info).toHaveBeenCalled();
  });
});
