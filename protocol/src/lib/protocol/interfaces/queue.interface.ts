/**
 * Queue types for protocol layer.
 * Re-exports from adapter so protocol stays decoupled from BullMQ; adapter owns the contract.
 */

/**
 * Operations the Intent Graph needs to enqueue follow-up work (e.g. HyDE generation/deletion).
 * Implemented by the intent queue; protocol layer depends only on this interface.
 */
export interface IntentGraphQueue {
  addGenerateHydeJob(data: { intentId: string; userId: string }): Promise<unknown>;
  addDeleteHydeJob(data: { intentId: string }): Promise<unknown>;
}

export type {
  AddJobResult,
  IndexIntentJobData,
  GenerateIntentsJobData,
  IntentJobName,
  IntentJobData,
  IntentQueue,
  NewsletterCandidate,
  NewsletterJobData,
  WeeklyCycleJobData,
  NewsletterJobName,
  NewsletterJobDataUnion,
  NewsletterQueue,
  OpportunityJobData,
  OpportunityQueue,
  ProfileUpdateJobData,
  ProfileQueue,
  QueueAdapter,
  QueueAdapterDeps,
  AddJobOptionsFn,
} from '../../../adapters/queue.adapter';
