import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { runCli } from '../cli-runner.js';
import type { AuthConfig } from '../auth.js';
import { toResult } from './shared.js';

/**
 * Registers profile and onboarding tools with the MCP server.
 *
 * @param server - The McpServer instance
 * @param auth - Authentication config
 */
export function registerProfileTools(server: McpServer, auth: AuthConfig): void {
  server.registerTool(
    'read_user_profiles',
    {
      description: 'Read user profiles. Optionally filter by user ID, index ID, or search query.',
      inputSchema: z.object({
        userId: z.string().optional().describe('User ID to fetch a specific profile'),
        indexId: z.string().optional().describe('Filter profiles by index ID'),
        query: z.string().optional().describe('Search query to filter profiles'),
      }),
    },
    async ({ userId, indexId, query }) => {
      const args: string[] = ['profile'];
      if (userId) {
        args.push('show', userId);
      }
      if (query) {
        args.push('--query', query);
      }
      if (indexId) {
        args.push('--index', indexId);
      }
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'create_user_profile',
    {
      description: 'Create a user profile by importing from social/professional URLs.',
      inputSchema: z.object({
        linkedinUrl: z.string().optional().describe('LinkedIn profile URL'),
        githubUrl: z.string().optional().describe('GitHub profile URL'),
        twitterUrl: z.string().optional().describe('Twitter/X profile URL'),
      }),
    },
    async ({ linkedinUrl, githubUrl, twitterUrl }) => {
      const args: string[] = ['profile', 'create'];
      if (linkedinUrl) args.push('--linkedin', linkedinUrl);
      if (githubUrl) args.push('--github', githubUrl);
      if (twitterUrl) args.push('--twitter', twitterUrl);
      return toResult(await runCli(args, auth));
    }
  );

  server.registerTool(
    'update_user_profile',
    {
      description: 'Update a specific field on the current user profile.',
      inputSchema: z.object({
        field: z.string().describe('Profile field name to update'),
        value: z.string().describe('New value for the field'),
      }),
    },
    async ({ field, value }) => {
      return toResult(await runCli(['profile', 'update', field, value], auth));
    }
  );

  server.registerTool(
    'complete_onboarding',
    {
      description: 'Mark the user onboarding flow as complete.',
      inputSchema: z.object({}),
    },
    async () => {
      return toResult(await runCli(['onboarding', 'complete'], auth));
    }
  );
}
