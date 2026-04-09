/**
 * Registry of all webhook event types that external consumers can subscribe to.
 * Used for validation when creating/updating webhooks.
 */
export const WEBHOOK_EVENTS = [
  'opportunity.created',
  'opportunity.accepted',
  'opportunity.rejected',
  'negotiation.started',
  'negotiation.turn_received',
  'negotiation.completed',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
