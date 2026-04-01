import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONTEXT_PATH = join(homedir(), '.index', 'context.json');

interface IndexContext {
  profile?: unknown;
  networks?: unknown;
  intents?: unknown;
  contacts?: unknown;
  [key: string]: unknown;
}

function readContext(): IndexContext {
  try {
    const raw = readFileSync(CONTEXT_PATH, 'utf-8');
    return JSON.parse(raw) as IndexContext;
  } catch {
    return {};
  }
}

/**
 * Registers static context resources that read from `~/.index/context.json`.
 *
 * @param server - The McpServer instance
 */
export function registerContextResources(server: McpServer): void {
  server.registerResource(
    'index-profile',
    'index://profile',
    {
      title: 'User Profile',
      description: 'Current user profile data from local context cache',
      mimeType: 'application/json',
    },
    async (uri) => {
      const ctx = readContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx.profile ?? {}),
        }],
      };
    }
  );

  server.registerResource(
    'index-networks',
    'index://networks',
    {
      title: 'Networks',
      description: 'List of networks/indexes from local context cache',
      mimeType: 'application/json',
    },
    async (uri) => {
      const ctx = readContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx.networks ?? []),
        }],
      };
    }
  );

  server.registerResource(
    'index-intents',
    'index://intents',
    {
      title: 'Intents',
      description: 'List of intents from local context cache',
      mimeType: 'application/json',
    },
    async (uri) => {
      const ctx = readContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx.intents ?? []),
        }],
      };
    }
  );

  server.registerResource(
    'index-contacts',
    'index://contacts',
    {
      title: 'Contacts',
      description: 'List of contacts from local context cache',
      mimeType: 'application/json',
    },
    async (uri) => {
      const ctx = readContext();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(ctx.contacts ?? []),
        }],
      };
    }
  );
}
