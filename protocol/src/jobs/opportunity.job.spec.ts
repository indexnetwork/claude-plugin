import * as dotenv from 'dotenv';
import path from 'path';
import { log } from '../lib/log';
import { runOpportunityFinderCycle } from './opportunity.job';
import { ProfileService } from '../services/profile.service';
import { OpportunityFinder } from '../agents/opportunity/opportunity.finder';
import { UserMemoryProfile } from '../agents/intent/manager/intent.manager.types';
import { CandidateProfile, Opportunity } from '../agents/opportunity/opportunity.finder.types';

// Load env
const envPath = path.resolve(__dirname, '../../../../.env.development');
dotenv.config({ path: envPath });

// --- MOCKS ---

class MockProfileService extends ProfileService {
  profilesWithMissingEmbeddings: any[] = [];
  allProfiles: any[] = [];
  candidatesMap: Record<string, any[]> = {};

  constructor() {
    super();
  }

  async getProfilesMissingEmbeddings() {
    log.info(`[MockService] getProfilesMissingEmbeddings called (returning ${this.profilesWithMissingEmbeddings.length})`);
    return this.profilesWithMissingEmbeddings;
  }

  async updateProfileEmbedding(profileId: string, embedding: number[]) {
    log.info(`[MockService] updateProfileEmbedding called for ${profileId} with embedding len ${embedding.length}`);
  }

  async getAllProfilesWithEmbeddings() {
    log.info(`[MockService] getAllProfilesWithEmbeddings called (returning ${this.allProfiles.length})`);
    return this.allProfiles;
  }

  async findSimilarProfiles(sourceUserId: string, embedding: number[], limit: number = 20) {
    log.info(`[MockService] findSimilarProfiles called for ${sourceUserId}`);
    return this.candidatesMap[sourceUserId] || [];
  }
}

class MockOpportunityFinder extends OpportunityFinder {
  constructor() {
    super();
  }

  async findOpportunities(
    sourceProfile: UserMemoryProfile,
    candidates: CandidateProfile[],
    options: any = {}
  ): Promise<Opportunity[]> {
    log.info(`[MockFinder] findOpportunities called for ${sourceProfile.userId} vs ${candidates.length} candidates`);
    if (candidates.length > 0) {
      return [
        {
          type: 'collaboration',
          title: 'Mock Opportunity',
          description: 'A mock description',
          score: 95,
          candidateId: candidates[0].userId
        }
      ];
    }
    return [];
  }
}

// --- TEST RUNNER ---

async function runTests() {
  log.info("🧪 Starting Opportunity Finder Job Tests (Standalone)...\n");

  const mockService = new MockProfileService();
  const mockFinder = new MockOpportunityFinder();

  // Setup Data
  mockService.profilesWithMissingEmbeddings = [
    { id: 'uuid-1', userId: 'user-no-embed', identity: { bio: 'Content for embedding' }, attributes: {}, narrative: {} }
  ];

  mockService.allProfiles = [
    { id: 'uuid-2', userId: 'source-user', embedding: [0.1], identity: { bio: 'Source' }, attributes: {}, narrative: {} }
  ];

  mockService.candidatesMap = {
    'source-user': [
      { profile: { userId: 'candidate-1', identity: { bio: 'Candidate' }, attributes: {}, narrative: {} } }
    ]
  };

  console.log("1️⃣  Test: Standard Cycle (Backfill + Match)");
  try {
    await runOpportunityFinderCycle(mockService, mockFinder);
    log.info("✅ Cycle completed successfully.");
  } catch (e) {
    log.error("❌ Cycle failed:", { error: e });
    process.exit(1);
  }
}

runTests().catch((e) => log.error('Test runner failed', { error: e }));
