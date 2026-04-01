import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { runCli } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';
import { toResult } from './shared.js';

/**
 * Registers intent management tools with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerIntentTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'read_intents',
    {
      description: 'List intents, optionally filtered by index or archived status.',
      inputSchema: z.object({
        indexId: z.string().optional().describe('Filter intents by network/index ID'),
        archived: z.boolean().optional().describe('Include archived intents'),
      }),
    },
    async ({ indexId, archived }) => {
      const args: string[] = ['intent', 'list'];
      if (indexId) args.push('--index', indexId);
      if (archived) args.push('--archived');
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'create_intent',
    {
      description: 'Create a new intent with a description.',
      inputSchema: z.object({
        description: z.string().describe('Description of the intent'),
      }),
    },
    async ({ description }) => {
      return toResult(await runCli(['intent', 'create', description], auth));
    }
  );

  server.registerTool(
    'update_intent',
    {
      description: 'Update the description of an existing intent.',
      inputSchema: z.object({
        intentId: z.string().describe('ID of the intent to update'),
        newDescription: z.string().describe('New description for the intent'),
      }),
    },
    async ({ intentId, newDescription }) => {
      return toResult(await runCli(['intent', 'update', intentId, newDescription], auth));
    }
  );

  server.registerTool(
    'delete_intent',
    {
      description: 'Archive (soft-delete) an intent.',
      inputSchema: z.object({
        intentId: z.string().describe('ID of the intent to archive'),
      }),
    },
    async ({ intentId }) => {
      return toResult(await runCli(['intent', 'archive', intentId], auth));
    }
  );

  server.registerTool(
    'create_intent_index',
    {
      description: 'Link an intent to a network/index.',
      inputSchema: z.object({
        intentId: z.string().describe('ID of the intent'),
        indexId: z.string().describe('ID of the network/index to link to'),
      }),
    },
    async ({ intentId, indexId }) => {
      return toResult(await runCli(['intent', 'link', intentId, indexId], auth));
    }
  );

  server.registerTool(
    'read_intent_indexes',
    {
      description: 'List all networks/indexes linked to an intent.',
      inputSchema: z.object({
        intentId: z.string().describe('ID of the intent'),
      }),
    },
    async ({ intentId }) => {
      return toResult(await runCli(['intent', 'links', intentId], auth));
    }
  );

  server.registerTool(
    'delete_intent_index',
    {
      description: 'Unlink an intent from a network/index.',
      inputSchema: z.object({
        intentId: z.string().describe('ID of the intent'),
        indexId: z.string().describe('ID of the network/index to unlink'),
      }),
    },
    async ({ intentId, indexId }) => {
      return toResult(await runCli(['intent', 'unlink', intentId, indexId], auth));
    }
  );
}
