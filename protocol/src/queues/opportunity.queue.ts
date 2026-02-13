import { Job } from 'bullmq';
import { QueueFactory } from '../lib/bullmq/bullmq';
import { log } from '../lib/log';
import { handleDiscoverOpportunities } from '../jobs/opportunity.job';

/**
 * Queue Name Constant
 */
export const QUEUE_NAME = 'opportunity-discovery-queue';

/**
 * Job payload for discover_opportunities.
 */
export interface OpportunityJobData {
  /** ID of the intent to discover opportunities for */
  intentId: string;
  /** ID of the user */
  userId: string;
  /** Optional index IDs to scope discovery */
  indexIds?: string[];
}

const logger = log.queue.from('OpportunityQueue');

/**
 * Opportunity Queue.
 *
 * RESPONSIBILITIES:
 * 1. discover_opportunities: After intent HyDE is generated, run opportunity discovery and persist latent opportunities.
 */
export const opportunityQueue = QueueFactory.createQueue<OpportunityJobData>(QUEUE_NAME);

async function opportunityProcessor(job: Job<OpportunityJobData>) {
  logger.info(`[OpportunityProcessor] Processing job ${job.id} (${job.name})`);
  switch (job.name) {
    case 'discover_opportunities':
      await handleDiscoverOpportunities(job.data);
      break;
    default:
      logger.warn(`[OpportunityProcessor] Unknown job name: ${job.name}`);
  }
}

export const opportunityWorker = QueueFactory.createWorker<OpportunityJobData>(
  QUEUE_NAME,
  opportunityProcessor
);
export const queueEvents = QueueFactory.createQueueEvents(QUEUE_NAME);

/**
 * Add a discovery job (e.g. after HyDE generation for an intent).
 *
 * @param data - intentId, userId, optional indexIds
 * @param options - Optional jobId for idempotency (e.g. opp-discovery:${intentId}:${updatedAt}), optional priority
 * @returns The created Job instance
 */
export async function addJob(
  data: OpportunityJobData,
  options?: { jobId?: string; priority?: number }
): Promise<Job<OpportunityJobData>> {
  const initialDelayMs = 1000;
  return opportunityQueue.add('discover_opportunities', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: initialDelayMs },
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 24 * 60 * 60 },
    jobId: options?.jobId,
    priority: options?.priority,
  });
}
