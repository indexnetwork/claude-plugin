import cron from 'node-cron';
import { generateEmbedding } from '../lib/embeddings';
import { OpportunityFinder } from '../agents/profile/opportunity/opportunity.finder';
import { CandidateProfile } from '../agents/profile/opportunity/opportunity.finder.types';
import { UserMemoryProfile } from '../agents/intent/manager/intent.manager.types';
import { ProfileService } from '../services/profile.service';
import { userProfiles } from '../lib/schema';

// Helper to construct profile text for embedding
function constructProfileText(profile: typeof userProfiles.$inferSelect): string {
  const parts = [
    profile.identity?.bio,
    profile.narrative?.aspirations,
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
  console.log('🔄 Starting Opportunity Finder Cycle...');

  const profileService = injectedProfileService || new ProfileService();

  try {
    // 1. Backfill Missing Embeddings
    console.log('🔍 Checking for missing embeddings...');
    const profilesWithoutEmbeddings = await profileService.getProfilesMissingEmbeddings();

    console.log(`Found ${profilesWithoutEmbeddings.length} profiles needing embeddings.`);

    for (const profile of profilesWithoutEmbeddings) {
      try {
        const textToEmbed = constructProfileText(profile);
        if (!textToEmbed || textToEmbed.length < 10) {
          console.warn(`Skipping profile ${profile.userId} - Insufficient content.`);
          continue;
        }

        console.log(`Generating embedding for user ${profile.userId}...`);
        const embedding = await generateEmbedding(textToEmbed);

        await profileService.updateProfileEmbedding(profile.id, embedding);

        console.log(`✅ Embedding updated for ${profile.userId}`);
      } catch (err) {
        console.error(`❌ Failed to generate embedding for ${profile.userId}:`, err);
      }
    }

    // 2. Run Opportunity Finder for All Users
    console.log('🚀 Running Opportunity Matchmaking...');
    const finder = injectedFinder || new OpportunityFinder();

    // Fetch all valid profiles to act as sources
    const allProfiles = await profileService.getAllProfilesWithEmbeddings();

    for (const sourceProfile of allProfiles) {
      console.log(`\n🔎 Finding opportunities for ${sourceProfile.userId}...`);

      // Construct UserMemoryProfile object expected by Agent
      const memoryProfile: UserMemoryProfile = {
        userId: sourceProfile.userId,
        identity: sourceProfile.identity || {},
        narrative: sourceProfile.narrative || {},
        attributes: sourceProfile.attributes || {}
      } as any;

      if (!sourceProfile.embedding) {
        console.warn(`Skipping ${sourceProfile.userId} - Missing embedding.`);
        continue;
      }

      // VECTOR SEARCH: Find top 20 nearest neighbors (excluding self)
      const candidatesRaw = await profileService.findSimilarProfiles(sourceProfile.userId, sourceProfile.embedding, 20);

      // Map to CandidateProfile type
      const candidates: CandidateProfile[] = candidatesRaw.map(c => ({
        userId: c.profile.userId,
        identity: c.profile.identity || {},
        narrative: c.profile.narrative || {},
        attributes: c.profile.attributes || {}
      }));

      // Run Agent
      const opportunities = await finder.findOpportunities(memoryProfile, candidates);

      if (opportunities.length > 0) {
        console.log(`✨ Found ${opportunities.length} opportunities for ${sourceProfile.userId}:`);
        opportunities.forEach(op => {
          console.log(`   - [${op.score}] ${op.title} (with ${op.candidateId})`);
        });
        // TODO: Store opportunities or notify users
      } else {
        console.log(`   No high-value opportunities found.`);
      }
    }

    console.log('✅ Opportunity Finder Cycle Complete.');
    console.timeEnd('OpportunityFinderCycle');

  } catch (error) {
    console.error('❌ Error in Opportunity Finder Cycle:', error);
    console.timeEnd('OpportunityFinderCycle');
  }
}

// Schedule Job
export const initOpportunityFinderJob = () => {
  // Run every day at 6 AM
  cron.schedule('0 6 * * *', () => {
    runOpportunityFinderCycle();
  });
  console.log('📅 Opportunity Finder job scheduled (Daily at 6:00 AM)');
};
