/**
 * Index Network — OpenClaw plugin entry point.
 *
 * Polls the Index Network backend for pending negotiation turns via:
 *
 *   POST /agents/:agentId/negotiations/pickup
 *
 * Because `api.runtime.subagent.run()` is request-scoped in OpenClaw (only
 * available inside an HTTP route handler), the plugin registers a route at
 * `POST /index-network/poll` and the background interval triggers it via a
 * local fetch. This gives each poll cycle a proper request scope.
 *
 * When a turn is found, dispatches a silent subagent that calls
 * `get_negotiation` + `respond_to_negotiation` on the parent's Index Network
 * MCP pool to decide and submit the response.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { OpenClawPluginApi } from './plugin-api.js';
import { turnPrompt } from './prompts/turn.prompt.js';

/** Polling interval: 30 seconds. */
const POLL_INTERVAL_MS = 30_000;

const POLL_PATH = '/index-network/poll';

/**
 * OpenClaw plugin entry point. Registers an internal HTTP route for polling
 * and starts a background interval that triggers it.
 *
 * @param api - The OpenClaw plugin API provided by the host.
 */
export default function register(api: OpenClawPluginApi): void {
  const agentId = readConfig(api, 'agentId');
  const apiKey = readConfig(api, 'apiKey');

  if (!agentId || !apiKey) {
    api.logger.warn(
      'Index Network polling requires agentId and apiKey in plugin config. Polling will not start.',
    );
    return;
  }

  const baseUrl = readConfig(api, 'protocolUrl') || 'http://localhost:3001';
  const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT || '18789';
  const gatewayToken = readGatewayToken();

  // Register the poll route — this gives us a request scope for subagent.run
  api.registerHttpRoute({
    path: POLL_PATH,
    auth: 'gateway',
    match: 'exact',
    handler: async (req, res) => {
      try {
        await poll(api, baseUrl, agentId, apiKey);
        res.statusCode = 200;
        res.end('ok');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(`Poll handler error: ${msg}`);
        res.statusCode = 500;
        res.end(msg);
      }
      return true;
    },
  });

  api.logger.info('Index Network polling started', {
    plugin: api.id,
    agentId,
    intervalMs: POLL_INTERVAL_MS,
  });

  // Trigger polling via self-POST to the registered route
  const triggerPoll = () => {
    const url = `http://127.0.0.1:${gatewayPort}${POLL_PATH}`;
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
      },
      signal: AbortSignal.timeout(30_000),
    }).catch((err) => {
      api.logger.error(`Poll trigger failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  setInterval(triggerPoll, POLL_INTERVAL_MS);

  // First poll after a short delay to let the gateway fully start
  setTimeout(triggerPoll, 5_000);
}

async function poll(
  api: OpenClawPluginApi,
  baseUrl: string,
  agentId: string,
  apiKey: string,
): Promise<void> {
  const negotiationMode = readConfig(api, 'negotiationMode') || 'enabled';
  if (negotiationMode === 'disabled') return;

  const pickupUrl = `${baseUrl}/api/agents/${agentId}/negotiations/pickup`;

  const res = await fetch(pickupUrl, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 204) return; // nothing pending

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    api.logger.warn(`Pickup request failed: ${res.status} ${body}`);
    return;
  }

  const turn = (await res.json()) as {
    negotiationId: string;
    taskId: string;
    opportunity: { id: string; reasoning: string } | null;
    turn: {
      number: number;
      deadline: string;
      history: Array<{ turnNumber: number; agent: string; action: string; message?: string | null }>;
      counterpartyAction: string;
    };
  };

  api.logger.info(`Negotiation turn picked up: ${turn.taskId} turn ${turn.turn.number}`);

  const lastEntry = turn.turn.history.length > 0
    ? turn.turn.history[turn.turn.history.length - 1]
    : null;

  await api.runtime.subagent.run({
    sessionKey: `index:negotiation:${turn.negotiationId}`,
    idempotencyKey: `index:turn:${turn.taskId}:${turn.turn.number}`,
    message: turnPrompt({
      negotiationId: turn.taskId,
      turnNumber: turn.turn.number,
      counterpartyAction: turn.turn.counterpartyAction,
      counterpartyMessage: lastEntry?.message ?? null,
      deadline: turn.turn.deadline,
    }),
    deliver: false,
  });

  api.logger.info(`Subagent launched for negotiation ${turn.taskId}`);
}

function readConfig(api: OpenClawPluginApi, key: string): string {
  const val = api.pluginConfig[key];
  return typeof val === 'string' ? val : '';
}

function readGatewayToken(): string {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config?.gateway?.auth?.token ?? '';
  } catch {
    return '';
  }
}
