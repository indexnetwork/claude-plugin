import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runCli, type CliResult } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';

function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}

/**
 * Registers conversation tools with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerConversationTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'list_conversations',
    {
      description: "List all the current user's conversations.",
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['conversation', 'list'], auth));
    }
  );

  server.registerTool(
    'send_message',
    {
      description: 'Send a message in a conversation.',
      inputSchema: z.object({
        conversationId: z.string().describe('ID of the conversation'),
        message: z.string().describe('Message content to send'),
      }),
    },
    async ({ conversationId, message }) => {
      return toResult(await runCli(['conversation', 'send', conversationId, message], auth));
    }
  );
}
