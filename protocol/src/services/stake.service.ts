import db from '../lib/db';
import { intents, intentStakes, intentStakeItems, intentIndexes } from '../lib/schema';
import { eq, and, sql, isNull, inArray } from 'drizzle-orm';
import { generateEmbedding } from '../lib/embeddings';
import { StakeMatcher } from '../agents/stake/stake.matcher';
import { log } from '../lib/log';

export class StakeService {

  /**
   * Orchestrate the process of finding and creating stakes for an intent
   */
  async processIntent(intentId: string) {
    log.info(`[StakeService] Processing intent ${intentId}`);

    // 1. Get Intent
    const currentIntent = await this.getIntent(intentId);
    if (!currentIntent) throw new Error(`Intent ${intentId} not found`);

    // 2. Find Candidates
    const candidates = await this.findCandidates(intentId, 10);
    log.info(`[StakeService] Found ${candidates.length} candidates`);

    if (candidates.length === 0) return;

    // 3. Run Info Matcher
    const matcher = new StakeMatcher();
    const result = await matcher.run(
      { id: currentIntent.id, payload: currentIntent.payload },
      candidates.map(c => ({ id: c.id, payload: c.payload }))
    );

    log.info(`[StakeService] Matcher found ${result.matches.length} matches`);

    // 4. Save Matches
    for (const match of result.matches) {
      await this.saveMatch(
        match.newIntentId,
        match.targetIntentId,
        match.score,
        match.reasoning,
        '028ef80e-9b1c-434b-9296-bb6130509482'
      );
    }
  }
  /**
   * Get an intent by ID
   */
  async getIntent(intentId: string) {
    const rows = await db.select()
      .from(intents)
      .where(eq(intents.id, intentId));
    return rows[0] || null;
  }

  /**
   * Find semantically related intents using vector similarity search
   * Enforces privacy by checking shared indexes
   */
  async findSimilarIntents(currentIntent: typeof intents.$inferSelect, limit: number = 50) {
    // 1. Get the specific indexes that THIS intent is assigned to
    const currentIntentIndexes = await db
      .select({ indexId: intentIndexes.indexId })
      .from(intentIndexes)
      .where(eq(intentIndexes.intentId, currentIntent.id));

    const indexIds = currentIntentIndexes.map(row => row.indexId);

    if (indexIds.length === 0) {
      return [];
    }

    // 2. Generate embedding if missing
    let queryEmbedding: number[];
    if (currentIntent.embedding) {
      queryEmbedding = currentIntent.embedding;
    } else {
      queryEmbedding = await generateEmbedding(currentIntent.payload);
    }

    // 3. Vector search ONLY in the same indexes
    return db
      .select({
        id: intents.id,
        payload: intents.payload,
        summary: intents.summary,
        userId: intents.userId,
        createdAt: intents.createdAt,
        // Calculate cosine similarity (1 - cosine distance)
        similarity: sql<number>`1 - (${intents.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`
      })
      .from(intents)
      .innerJoin(intentIndexes, eq(intents.id, intentIndexes.intentId))
      .where(
        and(
          sql`${intents.id} != ${currentIntent.id}`,
          sql`${intents.userId} != ${currentIntent.userId}`,
          sql`${intents.embedding} IS NOT NULL`,
          isNull(intents.archivedAt),
          inArray(intentIndexes.indexId, indexIds)
        )
      )
      .orderBy(sql`${intents.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
      .limit(limit);
  }

  /**
   * Save a new stake into the database
   */
  async createStake(params: {
    intents: string[];
    stake: bigint;
    reasoning: string;
    agentId: string;
    userIds: string[];
  }): Promise<string> {
    const sortedIntents = [...params.intents].sort();

    return await db.transaction(async (tx) => {
      // 1. Create the stake entry
      const [newStake] = await tx.insert(intentStakes).values({
        intents: sortedIntents,
        stake: params.stake,
        reasoning: params.reasoning,
        agentId: params.agentId
      }).returning({ id: intentStakes.id });

      // 2. Insert into join table
      await tx.insert(intentStakeItems).values(
        sortedIntents.map((intentId, i) => ({
          stakeId: newStake.id,
          intentId,
          userId: params.userIds[i] // Assumes userIds matches sortedIntents order (caller must ensure)
        }))
      );

      return newStake.id;
    });
  }

  /**
   * Find candidate intents for a given intent.
   * Limits to best match per user, up to `limit` candidates.
   */
  async findCandidates(intentId: string, limit: number = 10) {
    const currentIntent = await this.getIntent(intentId);
    if (!currentIntent) throw new Error(`Intent ${intentId} not found`);

    // Fetch more candidates initially to allow for user diversity filtering
    const rawCandidates = await this.findSimilarIntents(currentIntent, 50);

    // Filter to keep best match per user
    const userBestMatch = new Map<string, typeof rawCandidates[0]>();

    for (const candidate of rawCandidates) {
      const existing = userBestMatch.get(candidate.userId);
      if (!existing || candidate.similarity > existing.similarity) {
        userBestMatch.set(candidate.userId, candidate);
      }
    }

    // Sort by similarity and take top N
    return Array.from(userBestMatch.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Save a confirmed match as a stake
   */
  async saveMatch(
    newIntentId: string,
    targetIntentId: string,
    score: number,
    reasoning: string,
    agentId: string
  ) {
    const newIntentUser = await this.getIntentUser(newIntentId);
    const targetIntentUser = await this.getIntentUser(targetIntentId);

    if (!newIntentUser || !targetIntentUser) {
      log.error(`[StakeService] Missing user for intents ${newIntentId} or ${targetIntentUser}`);
      return;
    }

    const intents = [newIntentId, targetIntentId].sort();
    const userIds = intents.map(id => id === newIntentId ? newIntentUser : targetIntentUser);

    await this.createStake({
      intents,
      userIds,
      stake: BigInt(Math.floor(score)),
      reasoning,
      agentId
    });
  }

  /**
   * Helper to get user ID for an intent
   */
  async getIntentUser(intentId: string): Promise<string | null> {
    const res = await db.select({ userId: intents.userId })
      .from(intents)
      .where(eq(intents.id, intentId));
    return res[0]?.userId || null;
  }
}

export const stakeService = new StakeService();
