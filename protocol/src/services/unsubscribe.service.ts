import { log } from '../lib/log';

import { ChatDatabaseAdapter } from '../adapters/database.adapter';

const logger = log.service.from('UnsubscribeService');

/**
 * UnsubscribeService
 *
 * Handles ghost user opt-out (unsubscribe) logic.
 * Delegates to the database adapter for soft-deletion.
 */
export class UnsubscribeService {
  constructor(private db = new ChatDatabaseAdapter()) {}

  /**
   * Soft-delete a ghost user so they stop receiving emails.
   * @param userId - The ghost user's ID (used as unsubscribe token)
   * @returns true if the user was soft-deleted, false if not found or ineligible
   */
  async softDeleteGhostUser(userId: string): Promise<boolean> {
    logger.verbose('Soft-deleting ghost user', { userId });
    const result = await this.db.softDeleteGhostUser(userId);
    if (result) {
      logger.info('Ghost user unsubscribed', { userId });
    } else {
      logger.verbose('Ghost user not found or already deleted', { userId });
    }
    return result;
  }
}
