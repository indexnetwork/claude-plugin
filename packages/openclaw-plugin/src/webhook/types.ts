/**
 * Types for Index Network webhook payloads the plugin catches.
 * Keep these minimal — only the fields the plugin actually reads.
 */

export interface NegotiationTurnReceivedPayload {
  negotiationId: string;
  turnNumber: number;
  counterpartyAction: string;
  counterpartyMessage?: string | null;
  deadline: string;
}

export type NegotiationOutcomeReason = 'turn_cap' | 'timeout';

export interface NegotiationOutcome {
  hasOpportunity: boolean;
  agreedRoles?: { ownUser?: string; otherUser?: string };
  reasoning?: string;
  reason?: NegotiationOutcomeReason;
}

export interface NegotiationCompletedPayload {
  negotiationId: string;
  outcome: NegotiationOutcome;
  turnCount: number;
}
