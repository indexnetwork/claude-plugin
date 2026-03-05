import { z } from 'zod';
import type { DefineTool, ToolDeps } from './tool.helpers';
import { success, error } from './tool.helpers';
import { IntegrationAdapter } from '../../../adapters/integration.adapter';

const adapter = new IntegrationAdapter();

/**
 * Creates integration tools for the chat agent.
 * Exposes execute_integration tool for dynamic Composio operations.
 * Bulk data (contacts, etc.) is automatically imported via file upload pattern.
 */
export function createIntegrationTools(defineTool: DefineTool, _deps: ToolDeps) {
  const execute_integration = defineTool({
    name: 'execute_integration',
    description: `Execute a dynamic task using the user's connected integrations (Gmail, Calendar, Slack, etc.).
The sub-agent will use available tools based on what's connected.
For bulk operations (contacts, emails), data is uploaded as a file and imported automatically.

Examples:
- "Import my Gmail contacts to my network"
- "Fetch my recent calendar events"
- "Get emails from the last week"

Returns summary of what was processed/imported.`,
    querySchema: z.object({
      prompt: z.string().describe('Natural language instruction for the integration task'),
    }),
    handler: async ({ context, query }) => {
      try {
        const result = await adapter.execute(context.userId, query.prompt);
        return success({ result });
      } catch (err) {
        return error(`Integration failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  return [execute_integration];
}
