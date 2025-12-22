import { addIndexIntentJob } from '../lib/queue/llm-queue';
import { intentService } from '../services/intent.service';

export interface MemberEvent {
  userId: string;
  indexId: string;
  promptChanged?: boolean;
  autoAssignChanged?: boolean;
}

/**
 * Member-related events  
 */
export class MemberEvents {
  /**
   * Triggered when member settings are updated
   */
  static async onSettingsUpdated(event: MemberEvent): Promise<void> {
    try {
      if (event.promptChanged || event.autoAssignChanged) {
        // Get all user's intents and queue them individually
        const userIntents = await intentService.getIntentsByUserId(event.userId);

        // Priority 6: Member settings updates - MEDIUM priority
        // When a member's auto-assign changes, their intents need re-indexing
        // Less urgent than user intent actions but more important than background tasks
        const queuePromises = userIntents.map(({ id: intentId }) =>
          addIndexIntentJob({
            intentId,
            indexId: event.indexId,
            userId: event.userId!, // Include userId for per-user queuing
          }, 6)
        );

        await Promise.all(queuePromises);
      }
    } catch (error) {
      // Failed to queue member intents
    }
  }
}
