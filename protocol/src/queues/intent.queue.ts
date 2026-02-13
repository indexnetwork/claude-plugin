import { Job } from 'bullmq';
import { QueueFactory } from '../lib/bullmq/bullmq';
import { log } from '../lib/log';
import { handleGenerateHyde, handleDeleteHyde } from '../jobs/intent.job';

/**
 * Queue Name Constant
 */
export const QUEUE_NAME = 'intent-hyde-queue';

/**
 * Job payload for generate_hyde.
 */
export interface IntentJobData {
  /** ID of the intent */
  intentId: string;
  /** ID of the user who owns the intent */
  userId: string;
}

/**
 * Job payload for delete_hyde (intentId only).
 */
export interface IntentDeleteData {
  intentId: string;
}

export type IntentJobPayload = IntentJobData | IntentDeleteData;

const logger = log.queue.from('IntentQueue');

/**
 * Intent Queue.
 *
 * RESPONSIBILITIES:
 * 1. generate_hyde: On intent create/update, generate HyDE documents (mirror + reciprocal) and persist to hyde_documents.
 * 2. delete_hyde: On intent archive, delete HyDE documents for that intent.
 */
export const intentQueue = QueueFactory.createQueue<IntentJobPayload>(QUEUE_NAME);

async function intentProcessor(job: Job<IntentJobPayload>) {
  logger.info(`[IntentProcessor] Processing job ${job.id} (${job.name})`);
  switch (job.name) {
    case 'generate_hyde':
      await handleGenerateHyde(job.data as IntentJobData);
      break;
    case 'delete_hyde':
      await handleDeleteHyde(job.data as IntentDeleteData);
      break;
    default:
      logger.warn(`[IntentProcessor] Unknown job name: ${job.name}`);
  }
}

export const intentWorker = QueueFactory.createWorker<IntentJobPayload>(QUEUE_NAME, intentProcessor);
export const queueEvents = QueueFactory.createQueueEvents(QUEUE_NAME);

/**
 * Add a job to the Intent queue.
 *
 * @param name - 'generate_hyde' | 'delete_hyde'
 * @param data - Payload (intentId, userId for generate; intentId for delete)
 * @param options - Optional jobId for idempotency (e.g. intent-hyde:${intentId}:${updatedAt}), optional priority
 * @returns The created Job instance
 */
export async function addJob(
  name: 'generate_hyde' | 'delete_hyde',
  data: IntentJobData | IntentDeleteData,
  options?: { jobId?: string; priority?: number }
): Promise<Job<IntentJobPayload>> {
  return intentQueue.add(name, data as IntentJobPayload, {
    jobId: options?.jobId,
    priority: options?.priority,
  });
}
