import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}

/**
 * Registers utility tools (scrape URL, sync context) with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerUtilityTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'scrape_url',
    {
      description: 'Scrape a URL and optionally extract content based on an objective.',
      inputSchema: z.object({
        url: z.string().describe('URL to scrape'),
        objective: z.string().optional().describe('Objective to guide content extraction'),
      }),
    },
    async ({ url, objective }) => {
      const args: string[] = ['scrape', url];
      if (objective) args.push('--objective', objective);
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'sync_context',
    {
      description: 'Sync the local context cache with the Index Network server.',
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['sync'], auth));
    }
  );
}
