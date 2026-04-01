import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { runCli } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';
import { toResult } from './shared.js';

/**
 * Registers contact management tools with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerContactTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'list_contacts',
    {
      description: "List all the current user's contacts.",
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['contact', 'list'], auth));
    }
  );

  server.registerTool(
    'add_contact',
    {
      description: 'Add a contact by email address.',
      inputSchema: z.object({
        email: z.string().describe('Email address of the contact to add'),
      }),
    },
    async ({ email }) => {
      return toResult(await runCli(['contact', 'add', email], auth));
    }
  );

  server.registerTool(
    'remove_contact',
    {
      description: 'Remove a contact by email address.',
      inputSchema: z.object({
        email: z.string().describe('Email address of the contact to remove'),
      }),
    },
    async ({ email }) => {
      return toResult(await runCli(['contact', 'remove', email], auth));
    }
  );

  server.registerTool(
    'import_contacts',
    {
      description: 'Import contacts from the default source.',
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['contact', 'import'], auth));
    }
  );

  server.registerTool(
    'import_gmail_contacts',
    {
      description: 'Import contacts from Gmail.',
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['contact', 'import', '--gmail'], auth));
    }
  );
}
