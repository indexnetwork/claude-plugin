import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { runCli } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';
import { toResult } from './shared.js';

const DISCOVER_TIMEOUT_MS = 180_000;

/**
 * Registers opportunity discovery and management tools with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerOpportunityTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'create_opportunities',
    {
      description:
        'Discover new opportunities via semantic search. Optionally target a specific user or introduce two users.',
      inputSchema: z.object({
        searchQuery: z.string().optional().describe('Search query to find opportunities'),
        targetUserId: z.string().optional().describe('Target user ID to find opportunities for'),
        mode: z.string().optional().describe('Discovery mode'),
        sourceUserId: z.string().optional().describe('Source user ID when introducing two users'),
      }),
    },
    async ({ searchQuery, targetUserId, sourceUserId }) => {
      const args: string[] = ['opportunity', 'discover'];
      if (searchQuery) args.push(searchQuery);
      if (targetUserId) args.push('--target', targetUserId);
      if (sourceUserId && targetUserId) args.push('--introduce', sourceUserId, targetUserId);
      return toResult(await runCli(args, auth, DISCOVER_TIMEOUT_MS));
    }
  );

  server.registerTool(
    'list_opportunities',
    {
      description: 'List opportunities, optionally filtered by status.',
      inputSchema: z.object({
        status: z.string().optional().describe('Filter by status (e.g. pending, accepted, rejected)'),
      }),
    },
    async ({ status }) => {
      const args: string[] = ['opportunity', 'list'];
      if (status) args.push('--status', status);
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'show_opportunity',
    {
      description: 'Show details of a specific opportunity.',
      inputSchema: z.object({
        opportunityId: z.string().describe('ID of the opportunity'),
      }),
    },
    async ({ opportunityId }) => {
      return toResult(await runCli(['opportunity', 'show', opportunityId], auth));
    }
  );

  server.registerTool(
    'accept_opportunity',
    {
      description: 'Accept an opportunity.',
      inputSchema: z.object({
        opportunityId: z.string().describe('ID of the opportunity to accept'),
      }),
    },
    async ({ opportunityId }) => {
      return toResult(await runCli(['opportunity', 'accept', opportunityId], auth));
    }
  );

  server.registerTool(
    'reject_opportunity',
    {
      description: 'Reject an opportunity.',
      inputSchema: z.object({
        opportunityId: z.string().describe('ID of the opportunity to reject'),
      }),
    },
    async ({ opportunityId }) => {
      return toResult(await runCli(['opportunity', 'reject', opportunityId], auth));
    }
  );
}
