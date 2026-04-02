/**
 * MCP HTTP Handler — wires the MCP server factory to the Streamable HTTP transport.
 * Lazily compiles graphs, creates infrastructure singletons, and implements auth resolution.
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';

import {
  chatDatabaseAdapter,
  createUserDatabase,
  createSystemDatabase,
  conversationDatabaseAdapter,
} from '../adapters/database.adapter';
import { EmbedderAdapter } from '../adapters/embedder.adapter';
import { ScraperAdapter } from '../adapters/scraper.adapter';
import { RedisCacheAdapter } from '../adapters/cache.adapter';
import { ComposioIntegrationAdapter } from '../adapters/integration.adapter';

import { IntentGraphFactory } from '../lib/protocol/graphs/intent.graph';
import { ProfileGraphFactory } from '../lib/protocol/graphs/profile.graph';
import { OpportunityGraphFactory } from '../lib/protocol/graphs/opportunity.graph';
import { HydeGraphFactory } from '../lib/protocol/graphs/hyde.graph';
import { IndexGraphFactory } from '../lib/protocol/graphs/index.graph';
import { IndexMembershipGraphFactory } from '../lib/protocol/graphs/index_membership.graph';
import { IntentIndexGraphFactory } from '../lib/protocol/graphs/intent_index.graph';
import { NegotiationGraphFactory } from '../lib/protocol/graphs/negotiation.graph';
import { HydeGenerator } from '../lib/protocol/agents/hyde.generator';
import { LensInferrer } from '../lib/protocol/agents/lens.inferrer';
import { NegotiationProposer } from '../lib/protocol/agents/negotiation.proposer';
import { NegotiationResponder } from '../lib/protocol/agents/negotiation.responder';
import type { HydeGraphDatabase } from '../lib/protocol/interfaces/database.interface';
import { intentQueue } from '../queues/intent.queue';

import type { ToolDeps } from '../lib/protocol/tools/tool.helpers';
import type { McpAuthResolver } from '../lib/protocol/interfaces/auth.interface';
import { createMcpServer } from '../lib/protocol/mcp/mcp.server';
import type { ScopedDepsFactory } from '../lib/protocol/mcp/mcp.server';
import { log } from '../lib/log';

const logger = log.server.from('mcp');

// ═══════════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE SINGLETONS
// ═══════════════════════════════════════════════════════════════════════════════

const embedder = new EmbedderAdapter();
const scraper = new ScraperAdapter();
const cache = new RedisCacheAdapter();
const integration = new ComposioIntegrationAdapter();

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY GRAPH COMPILATION (same pattern as tool.service.ts)
// ═══════════════════════════════════════════════════════════════════════════════

let compiledGraphs: ToolDeps['graphs'] | null = null;

/**
 * Compile all protocol graphs once and cache them.
 * Graphs are stateless — user context is passed at invoke() time.
 */
function getOrCompileGraphs(): ToolDeps['graphs'] {
  if (compiledGraphs) return compiledGraphs;

  logger.info('Compiling MCP graphs (first call, will be cached)');

  const database = chatDatabaseAdapter;

  const intentGraph = new IntentGraphFactory(database, embedder, intentQueue).createGraph();
  const profileGraph = new ProfileGraphFactory(database, embedder, scraper).createGraph();
  const hydeCache = new RedisCacheAdapter();
  const compiledHydeGraph = new HydeGraphFactory(
    database as unknown as HydeGraphDatabase,
    embedder,
    hydeCache,
    new LensInferrer(),
    new HydeGenerator(),
  ).createGraph();
  const negotiationGraph = new NegotiationGraphFactory(
    conversationDatabaseAdapter,
    new NegotiationProposer(),
    new NegotiationResponder(),
  ).createGraph();
  const opportunityGraph = new OpportunityGraphFactory(
    database,
    embedder,
    compiledHydeGraph,
    undefined,
    undefined,
    negotiationGraph,
  ).createGraph();
  const indexGraph = new IndexGraphFactory(database).createGraph();
  const indexMembershipGraph = new IndexMembershipGraphFactory(database).createGraph();
  const intentIndexGraph = new IntentIndexGraphFactory(database).createGraph();

  compiledGraphs = {
    profile: profileGraph,
    intent: intentGraph,
    index: indexGraph,
    indexMembership: indexMembershipGraph,
    intentIndex: intentIndexGraph,
    opportunity: opportunityGraph,
  };

  return compiledGraphs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH RESOLVER
// ═══════════════════════════════════════════════════════════════════════════════

const JWKS = createRemoteJWKSet(
  new URL(`http://localhost:${process.env.PORT || 3001}/api/auth/jwks`),
);

/**
 * Resolves user ID from the incoming request.
 * Supports JWT Bearer tokens and Better Auth API keys.
 */
const authResolver: McpAuthResolver = {
  async resolveUserId(request: Request): Promise<string> {
    // Try JWT Bearer token first
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const { payload } = await jwtVerify(token, JWKS);
        if (typeof payload.id === 'string') {
          return payload.id;
        }
        // Also check sub claim as fallback
        if (typeof payload.sub === 'string') {
          return payload.sub;
        }
        throw new Error('JWT payload missing user ID');
      } catch (err) {
        throw new Error(`Invalid or expired access token: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Try API key via Better Auth internal verification
    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
      try {
        const port = process.env.PORT || 3001;
        const verifyRes = await fetch(`http://localhost:${port}/api/auth/api-key/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: apiKey }),
        });
        if (!verifyRes.ok) {
          throw new Error(`API key verification failed: ${verifyRes.status}`);
        }
        const data = await verifyRes.json() as { valid: boolean; userId?: string; error?: string };
        if (data.valid && data.userId) {
          return data.userId;
        }
        throw new Error(data.error || 'Invalid API key');
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('API key verification failed')) {
          throw err;
        }
        throw new Error(`API key authentication failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new Error('Authentication required: provide Bearer token or x-api-key header');
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY MCP SERVER CREATION
// ═══════════════════════════════════════════════════════════════════════════════

let mcpServer: McpServer | null = null;

/**
 * Creates or returns the cached MCP server instance.
 * The server is created once with all tools registered.
 */
function getOrCreateMcpServer(): McpServer {
  if (mcpServer) return mcpServer;

  const database = chatDatabaseAdapter;
  const graphs = getOrCompileGraphs();

  // Create initial ToolDeps with placeholder scoped databases
  // (actual per-request scoped databases are created inside the tool callbacks)
  const userDb = createUserDatabase(database, 'system');
  const systemDb = createSystemDatabase(database, 'system', []);

  const toolDeps: ToolDeps = {
    database,
    userDb,
    systemDb,
    scraper,
    embedder,
    cache,
    integration,
    graphs,
  };

  const scopedDepsFactory: ScopedDepsFactory = {
    create(userId: string, indexScope: string[]) {
      return {
        userDb: createUserDatabase(database, userId),
        systemDb: createSystemDatabase(database, userId, indexScope, embedder),
      };
    },
  };

  mcpServer = createMcpServer(toolDeps, authResolver, scopedDepsFactory);
  logger.info('MCP server initialized');
  return mcpServer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles an incoming MCP HTTP request.
 * Creates a per-request transport, connects it to the shared MCP server,
 * and delegates request handling to the transport.
 *
 * @param req - The incoming HTTP request
 * @param corsHeaders - CORS headers to merge into the response
 * @returns The HTTP response
 */
export async function mcpHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const server = getOrCreateMcpServer();

    // Create a stateless per-request transport
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Connect the MCP server to this transport for request handling
    await server.connect(transport);

    // Handle the request through the transport
    const response = await transport.handleRequest(req);

    // Merge CORS headers into the response
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('MCP handler error', { error: message });
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
