import type {
  OpportunityGraphDatabase,
  HydeGraphDatabase,
} from '../lib/protocol/interfaces/database.interface';
import type { Embedder } from '../lib/protocol/interfaces/embedder.interface';
import { OpportunityGraph } from '../lib/protocol/graphs/opportunity/opportunity.graph';
import { HydeGraphFactory } from '../lib/protocol/graphs/hyde/hyde.graph';
import { HydeGenerator } from '../lib/protocol/agents/hyde/hyde.generator';
import type { HydeCache } from '../lib/protocol/interfaces/cache.interface';
import { ChatDatabaseAdapter } from '../adapters/database.adapter';
import { EmbedderAdapter } from '../adapters/embedder.adapter';
import { RedisCacheAdapter } from '../adapters/cache.adapter';

import { Controller, Post, UseGuards } from '../lib/router/router.decorators';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedUser } from '../guards/auth.guard';

/** DB type for opportunity controller: graph needs + getIndexMemberships for indexScope. */
type OpportunityControllerDb = OpportunityGraphDatabase & {
  getIndexMemberships(userId: string): Promise<{ indexId: string }[]>;
};

/**
 * OpportunityController handles opportunity discovery for users.
 * Uses the OpportunityGraph with HyDE subgraph to find matching candidates.
 */
@Controller('/opportunities')
export class OpportunityController {
  private db: OpportunityControllerDb;
  private embedder: Embedder;
  private graph: ReturnType<OpportunityGraph['compile']>;

  constructor() {
    const chatDb = new ChatDatabaseAdapter();
    this.db = chatDb as OpportunityControllerDb;
    this.embedder = new EmbedderAdapter();
    const cache: HydeCache = new RedisCacheAdapter();
    const generator = new HydeGenerator();
    const compiledHydeGraph = new HydeGraphFactory(
      chatDb as unknown as HydeGraphDatabase,
      this.embedder,
      cache,
      generator
    ).createGraph();
    const opportunityGraph = new OpportunityGraph(
      this.db,
      this.embedder,
      cache,
      compiledHydeGraph
    );
    this.graph = opportunityGraph.compile();
  }

  /**
   * Discover opportunities for the authenticated user based on a query.
   * Uses HyDE graph to generate hypothetical documents, then searches profiles/intents
   * scoped to the user's index memberships.
   *
   * @param req - The HTTP request object (body contains query and optional limit)
   * @param user - The authenticated user from AuthGuard
   * @returns JSON response with discovered opportunities
   *
   * @example
   * POST /opportunities/discover
   * Body: { "query": "Looking for AI/ML engineers", "limit": 5 }
   */
  @Post('/discover')
  @UseGuards(AuthGuard)
  async discover(req: Request, user: AuthenticatedUser) {
    const body = (await req.json()) as { query: string; limit?: number };
    const { query, limit = 5 } = body;

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "query" field in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const memberships = await this.db.getIndexMemberships(user.id);
    const indexScope = memberships.map((m) => m.indexId);
    if (indexScope.length === 0) {
      return Response.json({
        sourceUserId: user.id,
        options: { hydeDescription: query, limit },
        indexScope: [],
        candidates: [],
        opportunities: [],
      });
    }

    const result = await this.graph.invoke({
      sourceUserId: user.id,
      sourceText: query,
      indexScope,
      options: {
        hydeDescription: query,
        limit,
      },
    });

    return Response.json(result);
  }
}
