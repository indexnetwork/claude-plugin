import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}

/**
 * Registers network (index) management tools with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerNetworkTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'read_indexes',
    {
      description: "List all the current user's networks/indexes.",
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['network', 'list'], auth));
    }
  );

  server.registerTool(
    'create_index',
    {
      description: 'Create a new network/index.',
      inputSchema: z.object({
        title: z.string().describe('Name of the network/index'),
        prompt: z.string().optional().describe('Optional prompt to guide intent matching'),
      }),
    },
    async ({ title, prompt }) => {
      const args: string[] = ['network', 'create', title];
      if (prompt) args.push('--prompt', prompt);
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'update_index',
    {
      description: 'Update the title or prompt of an existing network/index.',
      inputSchema: z.object({
        indexId: z.string().describe('ID of the network/index to update'),
        title: z.string().optional().describe('New title for the network/index'),
        prompt: z.string().optional().describe('New prompt for the network/index'),
      }),
    },
    async ({ indexId, title, prompt }) => {
      const args: string[] = ['network', 'update', indexId];
      if (title) args.push('--title', title);
      if (prompt) args.push('--prompt', prompt);
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'delete_index',
    {
      description: 'Delete a network/index.',
      inputSchema: z.object({
        indexId: z.string().describe('ID of the network/index to delete'),
      }),
    },
    async ({ indexId }) => {
      return toResult(await runCli(['network', 'delete', indexId], auth));
    }
  );

  server.registerTool(
    'read_index_memberships',
    {
      description: 'List members of a network/index.',
      inputSchema: z.object({
        indexId: z.string().describe('ID of the network/index'),
      }),
    },
    async ({ indexId }) => {
      return toResult(await runCli(['network', 'show', indexId], auth));
    }
  );

  server.registerTool(
    'create_index_membership',
    {
      description: 'Invite a user (by email) to a network/index.',
      inputSchema: z.object({
        indexId: z.string().describe('ID of the network/index'),
        email: z.string().describe('Email address of the user to invite'),
      }),
    },
    async ({ indexId, email }) => {
      return toResult(await runCli(['network', 'invite', indexId, email], auth));
    }
  );

  server.registerTool(
    'delete_index_membership',
    {
      description: 'Leave a network/index.',
      inputSchema: z.object({
        indexId: z.string().describe('ID of the network/index to leave'),
      }),
    },
    async ({ indexId }) => {
      return toResult(await runCli(['network', 'leave', indexId], auth));
    }
  );
}
