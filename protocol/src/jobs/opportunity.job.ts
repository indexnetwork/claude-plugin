import { log } from '../lib/log';
import type { Id } from '../types/common.types';
import { ChatDatabaseAdapter } from '../adapters/database.adapter';
import { EmbedderAdapter } from '../adapters/embedder.adapter';
import { RedisCacheAdapter } from '../adapters/cache.adapter';
import type { OpportunityGraphDatabase, HydeGraphDatabase } from '../lib/protocol/interfaces/database.interface';
import type { Embedder } from '../lib/protocol/interfaces/embedder.interface';
import type { HydeCache } from '../lib/protocol/interfaces/cache.interface';
import { OpportunityGraphFactory } from '../lib/protocol/graphs/opportunity.graph';
import { HydeGraphFactory } from '../lib/protocol/graphs/hyde.graph';
import { HydeGenerator } from '../lib/protocol/agents/hyde.generator';
import type { OpportunityJobData } from '../queues/opportunity.queue';

const logger = log.job.from('OpportunityJob');

const database = new ChatDatabaseAdapter();
const graphDb = database as unknown as OpportunityGraphDatabase & HydeGraphDatabase;

/** Minimal database interface for opportunity job (used when deps provided in tests). */
export type OpportunityJobDatabase = Pick<ChatDatabaseAdapter, 'getIntentForIndexing'>;

/** Invoke options for opportunity graph (used when deps provided in tests). */
export interface OpportunityGraphInvokeOptions {
  userId: string;
  searchQuery: string;
  operationMode: 'create';
  indexId?: string;
  options: { initialStatus: 'latent' };
}

/** Optional deps for testing (database, invokeOpportunityGraph). */
export interface OpportunityJobDeps {
  database?: OpportunityJobDatabase;
  invokeOpportunityGraph?: (opts: OpportunityGraphInvokeOptions) => Promise<void>;
}

/**
 * Run opportunity discovery for an intent: load intent, (optionally scope to indexIds), invoke opportunity graph with initialStatus latent.
 * Invoked by opportunity queue worker for job name 'discover_opportunities'.
 *
 * @param data - intentId, userId, optional indexIds (from queue payload).
 * @param deps - Optional; used for testing (mock database, invokeOpportunityGraph).
 */
export async function handleDiscoverOpportunities(
  data: OpportunityJobData,
  deps?: OpportunityJobDeps
): Promise<void> {
  const { intentId, userId, indexIds } = data;
  const db = deps?.database ?? database;
  const intent = await db.getIntentForIndexing(intentId);
  if (!intent) {
    logger.warn('[OpportunityDiscovery] Intent not found, skipping', { intentId });
    return;
  }
  const invokeOpts = {
    userId: userId as Id<'users'>,
    searchQuery: intent.payload,
    operationMode: 'create' as const,
    indexId: indexIds?.[0] as Id<'indexes'> | undefined,
    options: { initialStatus: 'latent' as const },
  };
  if (deps?.invokeOpportunityGraph) {
    await deps.invokeOpportunityGraph(invokeOpts);
  } else {
    const embedder: Embedder = new EmbedderAdapter();
    const cache: HydeCache = new RedisCacheAdapter();
    const generator = new HydeGenerator();
    const hydeGraph = new HydeGraphFactory(
      graphDb as HydeGraphDatabase,
      embedder,
      cache,
      generator
    ).createGraph();
    const opportunityGraph = new OpportunityGraphFactory(
      graphDb as OpportunityGraphDatabase,
      embedder,
      hydeGraph
    ).createGraph();
    await opportunityGraph.invoke(invokeOpts);
  }
  logger.info('[OpportunityDiscovery] Discovery complete for intent', { intentId, userId });
}
