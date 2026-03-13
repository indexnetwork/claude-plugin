/**
 * Hook called when an intent is archived.
 * Set by main.ts to trigger cascade cleanup via queues/brokers.
 */
export const IntentEvents = {
  onArchived: (_intentId: string, _userId: string): void => {},
};
