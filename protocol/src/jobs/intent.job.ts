import { log } from '../lib/log';
import { ChatDatabaseAdapter } from '../adapters/database.adapter';
import { EmbedderAdapter } from '../adapters/embedder.adapter';
import { RedisCacheAdapter } from '../adapters/cache.adapter';
import type { HydeGraphDatabase } from '../lib/protocol/interfaces/database.interface';
import { HydeGraphFactory } from '../lib/protocol/graphs/hyde.graph';
import { HydeGenerator } from '../lib/protocol/agents/hyde.generator';
import type { IntentJobData } from '../queues/intent.queue';
import { addJob as addOpportunityJob } from '../queues/opportunity.queue';

const logger = log.job.from('IntentJob');

const database = new ChatDatabaseAdapter();
const graphDb = database as unknown as HydeGraphDatabase;

/** Minimal database interface for intent job (used when deps provided in tests). */
export type IntentJobDatabase = Pick<
  ChatDatabaseAdapter,
  'getIntentForIndexing' | 'getUserIndexIds' | 'assignIntentToIndex' | 'deleteHydeDocumentsForSource'
>;

/** Optional deps for testing (database, invokeHyde, addOpportunityJob). */
export interface IntentJobDeps {
  database?: IntentJobDatabase;
  invokeHyde?: (opts: {
    sourceText: string;
    sourceType: string;
    sourceId: string;
    strategies: ('mirror' | 'reciprocal')[];
    forceRegenerate: boolean;
  }) => Promise<void>;
  addOpportunityJob?: (data: { intentId: string; userId: string }) => Promise<unknown>;
}

/**
 * Generate HyDE documents for an intent (mirror + reciprocal) and persist to hyde_documents.
 * Invoked by intent queue worker for job name 'generate_hyde'.
 *
 * @param data - intentId, userId (from queue payload).
 * @param deps - Optional; used for testing (mock database, invokeHyde, addOpportunityJob).
 */
export async function handleGenerateHyde(data: IntentJobData, deps?: IntentJobDeps): Promise<void> {
  const { intentId, userId } = data;
  const db = deps?.database ?? database;
  const intent = await db.getIntentForIndexing(intentId);
  if (!intent) {
    logger.warn('[IntentHyde] Intent not found, skipping', { intentId });
    return;
  }
  // Assign intent to user's indexes so discovery can find it (searchIntentsForHyde joins intents ↔ intent_indexes).
  try {
    const userIndexIds = await db.getUserIndexIds(userId);
    for (const indexId of userIndexIds) {
      try {
        await db.assignIntentToIndex(intentId, indexId);
      } catch (assignErr) {
        // Ignore duplicate or constraint errors so one failure doesn't break the job
        logger.debug('[IntentHyde] Assign intent to index skipped', { intentId, indexId, error: assignErr });
      }
    }
  } catch (err) {
    logger.warn('[IntentHyde] Failed to assign intent to user indexes', { intentId, userId, error: err });
  }
  if (deps?.invokeHyde) {
    await deps.invokeHyde({
      sourceText: intent.payload,
      sourceType: 'intent',
      sourceId: intentId,
      strategies: ['mirror', 'reciprocal'],
      forceRegenerate: true,
    });
  } else {
    const embedder = new EmbedderAdapter();
    const cache = new RedisCacheAdapter();
    const generator = new HydeGenerator();
    const hydeGraph = new HydeGraphFactory(graphDb, embedder, cache, generator).createGraph();
    await hydeGraph.invoke({
      sourceText: intent.payload,
      sourceType: 'intent',
      sourceId: intentId,
      strategies: ['mirror', 'reciprocal'],
      forceRegenerate: true,
    });
  }
  logger.info('[IntentHyde] Generated HyDE for intent', { intentId, userId });
  const addJob = deps?.addOpportunityJob ?? addOpportunityJob;
  await addJob({ intentId, userId }).catch((err: unknown) =>
    logger.error('[IntentHyde] Failed to enqueue opportunity discovery', { intentId, error: err })
  );
}

/**
 * Delete all HyDE documents for an intent (on archive).
 * Invoked by intent queue worker for job name 'delete_hyde'.
 *
 * @param data - intentId (from queue payload).
 * @param deps - Optional; used for testing (mock database).
 */
export async function handleDeleteHyde(
  data: { intentId: string },
  deps?: IntentJobDeps
): Promise<void> {
  const { intentId } = data;
  const db = deps?.database ?? database;
  await db.deleteHydeDocumentsForSource('intent', intentId);
  logger.info('[IntentHyde] Deleted HyDE documents for intent', { intentId });
}
