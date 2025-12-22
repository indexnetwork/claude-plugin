import db from '../lib/db';
import { indexes, indexMembers, intents } from '../lib/schema';
import { eq, and, isNull } from 'drizzle-orm';

export class IndexService {
  /**
   * Get eligible indexes for a user where autoAssign is true
   */
  async getEligibleIndexesForUser(userId: string) {
    return await db.select({
      id: indexes.id
    })
      .from(indexes)
      .innerJoin(indexMembers, eq(indexes.id, indexMembers.indexId))
      .where(and(
        eq(indexMembers.userId, userId),
        eq(indexMembers.autoAssign, true),
        isNull(indexes.deletedAt)
      ));
  }

  /**
   * Get intents for all members of an index where autoAssign is true
   */
  async getIntentsForIndexMembers(indexId: string) {
    return await db.select({
      intentId: intents.id,
      userId: intents.userId
    })
      .from(intents)
      .innerJoin(indexMembers, eq(intents.userId, indexMembers.userId))
      .where(and(
        eq(indexMembers.indexId, indexId),
        eq(indexMembers.autoAssign, true),
        isNull(intents.archivedAt)
      ));
  }
}

export const indexService = new IndexService();
