import db from '../lib/db';
import { intents } from '../lib/schema';
import { eq, and, isNull } from 'drizzle-orm';

export class IntentService {
  /**
   * Get all active intents for a user
   */
  async getIntentsByUserId(userId: string) {
    return await db.select({ id: intents.id })
      .from(intents)
      .where(and(
        eq(intents.userId, userId),
        isNull(intents.archivedAt)
      ));
  }
}

export const intentService = new IntentService();
