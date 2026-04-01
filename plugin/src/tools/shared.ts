import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CliResult } from '../cli-runner.js';

/**
 * Converts a CLI result to an MCP CallToolResult.
 *
 * @param cli - The result from the CLI runner.
 * @returns MCP-compatible tool result with JSON-serialized content.
 */
export function toResult(cli: CliResult): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(cli) }] };
}
