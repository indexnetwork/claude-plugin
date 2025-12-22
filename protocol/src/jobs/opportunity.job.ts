import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { generateEmbedding } from '../lib/embeddings';
import { HydeGeneratorAgent } from '../agents/profile/hyde/hyde.generator';
import { OpportunityFinder } from '../agents/opportunity/opportunity.finder';
import { CandidateProfile } from '../agents/opportunity/opportunity.finder.types';
import { UserMemoryProfile } from '../agents/intent/manager/intent.manager.types';
import { ProfileService } from '../services/profile.service';
import { userProfiles } from '../lib/schema';
import { log } from '../lib/log';

// Helper to construct profile text for embedding
function constructProfileText(profile: typeof userProfiles.$inferSelect): string {
  const parts = [
    profile.identity?.bio,
    profile.identity?.location,
    profile.narrative?.aspirations,
    profile.narrative?.context,
    ...(profile.attributes?.interests || []),
    ...(profile.attributes?.skills || [])
  ];
  return parts.filter(Boolean).join(' ');
}

export async function runOpportunityFinderCycle(
  injectedProfileService?: ProfileService,
  injectedFinder?: OpportunityFinder
) {
  console.time('OpportunityFinderCycle');
  log.info('🔄 [OpportunityJob] Starting Opportunity Finder Cycle...');

  const profileService = injectedProfileService || new ProfileService();

  try {
    // 1. Backfill Missing Embeddings
    log.info('🔍 [OpportunityJob] Checking for missing embeddings...');
    const profilesWithoutEmbeddings = await profileService.getProfilesMissingEmbeddings();

    log.info(`[OpportunityJob] Found ${profilesWithoutEmbeddings.length} profiles needing embeddings.`);

    for (const profile of profilesWithoutEmbeddings) {
      try {
        const textToEmbed = constructProfileText(profile);
        if (!textToEmbed || textToEmbed.length < 10) {
          log.warn(`[OpportunityJob] Skipping profile ${profile.userId} - Insufficient content.`);
          continue;
        }

        log.info(`[OpportunityJob] Generating embedding for user ${profile.userId}...`);
        log.debug(`[OpportunityJob] Payload length: ${textToEmbed.length} chars. Preview: "${textToEmbed.substring(0, 100)}..."`);
        const embedding = await generateEmbedding(textToEmbed);

        await profileService.updateProfileEmbedding(profile.id, embedding);

        log.info(`[OpportunityJob] ✅ Embedding updated for ${profile.userId}`);
      } catch (err) {
        log.error(`[OpportunityJob] ❌ Failed to generate embedding for ${profile.userId}:`, { error: err });
      }
    }

    // 2. Run Opportunity Finder for All Users
    log.info('🚀 [OpportunityJob] Running Opportunity Matchmaking...');
    const finder = injectedFinder || new OpportunityFinder();
    const allCycleResults: any[] = [];

    // Fetch all valid profiles to act as sources
    const allProfiles = await profileService.getAllProfilesWithEmbeddings();

    for (const sourceProfile of allProfiles) {
      log.info(`\n🔎 [OpportunityJob] Finding opportunities for ${sourceProfile.userId}...`);

      // Construct UserMemoryProfile object expected by Agent
      const memoryProfile: UserMemoryProfile = {
        userId: sourceProfile.userId,
        identity: sourceProfile.identity || {},
        narrative: sourceProfile.narrative || {},
        attributes: sourceProfile.attributes || {}
      } as any;

      if (!sourceProfile.embedding) {
        log.warn(`[OpportunityJob] Skipping ${sourceProfile.userId} - Missing embedding.`);
        continue;
      }

      // --- BACKFILL HyDE IF MISSING ---
      if (!sourceProfile.hydeEmbedding) {
        log.info(`   [OpportunityJob] Generating missing HyDE for ${sourceProfile.userId}...`);
        try {
          const hydeGenerator = new HydeGeneratorAgent();
          const description = await hydeGenerator.generate(memoryProfile);
          if (description) {
            const embedding = await generateEmbedding(description);

            // Update DB
            await profileService.updateProfileHyde(sourceProfile.id, description, embedding);

            // Update local object so we can use it immediately
            sourceProfile.hydeDescription = description;
            sourceProfile.hydeEmbedding = embedding;
            log.info(`   [OpportunityJob] ✅ HyDE Generated & Backfilled.`);
          }
        } catch (e) {
          log.error(`   [OpportunityJob] ❌ Failed to generate HyDE for ${sourceProfile.userId}`, { error: e });
        }
      }
      // --------------------------------

      // Determine Query Vector: Use HyDE (Desire) if available, otherwise User Profile (Similarity)
      const queryVector = sourceProfile.hydeEmbedding || sourceProfile.embedding;
      if (sourceProfile.hydeEmbedding) {
        log.info(`   [OpportunityJob] Using HyDE embedding for search.`);
      }

      // VECTOR SEARCH: Find top 20 nearest neighbors (excluding self)
      const candidatesRaw = await profileService.findSimilarProfiles(sourceProfile.userId, queryVector, 20);

      // Map to CandidateProfile type
      const candidates: CandidateProfile[] = candidatesRaw.map(c => ({
        userId: c.profile.userId,
        identity: c.profile.identity || {},
        narrative: c.profile.narrative || {},
        attributes: c.profile.attributes || {}
      }));

      // Run Agent
      const opportunities = await finder.findOpportunities(memoryProfile, candidates, {
        hydeDescription: sourceProfile.hydeDescription || undefined
      });

      if (opportunities.length > 0) {
        log.info(`✨ [OpportunityJob] Found ${opportunities.length} opportunities for ${sourceProfile.userId}:`);
        opportunities.forEach(op => {
          log.info(`   - [${op.score}] ${op.title} (with ${op.candidateId})`);
        });

        allCycleResults.push({
          sourceUserId: sourceProfile.userId,
          sourceName: sourceProfile.identity?.name,
          opportunityCount: opportunities.length,
          opportunities: opportunities
        });

      } else {
        log.info(`   [OpportunityJob] No high-value opportunities found.`);
      }
    }

    // Write full debug results
    if (allCycleResults.length > 0) {
      // Use a persistent path in root or tmp
      const debugPath = path.resolve(process.cwd(), 'opportunity-finder-results.json');
      await fs.writeFile(debugPath, JSON.stringify(allCycleResults, null, 2));
      log.info(`\n📝 [OpportunityJob] Debug results written to: ${debugPath}`);
    }

    log.info('✅ [OpportunityJob] Opportunity Finder Cycle Complete.');
    console.timeEnd('OpportunityFinderCycle');

  } catch (error) {
    log.error('❌ [OpportunityJob] Error in Opportunity Finder Cycle:', { error });
    console.timeEnd('OpportunityFinderCycle');
  }

}

// Schedule Job
export const initOpportunityFinderJob = () => {
  // Run every day at 6 AM
  cron.schedule('0 6 * * *', () => {
    runOpportunityFinderCycle();
  });
  log.info('📅 [OpportunityJob] Opportunity Finder job scheduled (Daily at 6:00 AM)');
};
