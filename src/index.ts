#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveAuth } from './auth.js';
import { runCli } from './cli-runner.js';
import { registerProfileTools } from './tools/profile.tools.js';
import { registerIntentTools } from './tools/intent.tools.js';
import { registerOpportunityTools } from './tools/opportunity.tools.js';
import { registerNetworkTools } from './tools/network.tools.js';
import { registerContactTools } from './tools/contact.tools.js';
import { registerUtilityTools } from './tools/utility.tools.js';
import { registerConversationTools } from './tools/conversation.tools.js';
import { registerContextResources } from './resources/context.resources.js';

async function main(): Promise<void> {
  // 1. Resolve auth — exit with helpful message if unavailable
  let auth;
  try {
    auth = resolveAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[index-network-mcp] Authentication error: ${message}\n`);
    process.exit(1);
  }

  // 2. Create MCP server
  const server = new McpServer({ name: 'index-network', version: '0.1.0' });

  // 3. Register all tools
  registerProfileTools(server, auth);
  registerIntentTools(server, auth);
  registerOpportunityTools(server, auth);
  registerNetworkTools(server, auth);
  registerContactTools(server, auth);
  registerUtilityTools(server, auth);
  registerConversationTools(server, auth);

  // 4. Register resources
  registerContextResources(server);

  // 5. Non-blocking context sync on startup
  runCli(['sync'], auth).catch(() => {
    // Silently ignore sync errors on startup
  });

  // 6. Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[index-network-mcp] Fatal error: ${message}\n`);
  process.exit(1);
});
