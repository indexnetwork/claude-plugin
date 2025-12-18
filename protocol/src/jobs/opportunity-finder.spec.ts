import * as dotenv from 'dotenv';
import path from 'path';
import { runOpportunityFinderCycle } from './opportunity-finder';
import { ProfileService } from '../services/profile.service';
import { OpportunityFinder } from '../agents/profile/opportunity/opportunity.finder';
import { UserMemoryProfile } from '../agents/intent/manager/intent.manager.types';
import { CandidateProfile, Opportunity } from '../agents/profile/opportunity/opportunity.finder.types';

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
    console.log(`[MockService] getProfilesMissingEmbeddings called (returning ${this.profilesWithMissingEmbeddings.length})`);
    return this.profilesWithMissingEmbeddings;
  }

  async updateProfileEmbedding(profileId: string, embedding: number[]) {
    console.log(`[MockService] updateProfileEmbedding called for ${profileId} with embedding len ${embedding.length}`);
  }

  async getAllProfilesWithEmbeddings() {
    console.log(`[MockService] getAllProfilesWithEmbeddings called (returning ${this.allProfiles.length})`);
    return this.allProfiles;
  }

  async findSimilarProfiles(sourceUserId: string, embedding: number[], limit: number = 20) {
    console.log(`[MockService] findSimilarProfiles called for ${sourceUserId}`);
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
    console.log(`[MockFinder] findOpportunities called for ${sourceProfile.userId} vs ${candidates.length} candidates`);
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
  console.log("🧪 Starting Opportunity Finder Job Tests (Standalone)...\n");

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
    console.log("✅ Cycle completed successfully.");
  } catch (e) {
    console.error("❌ Cycle failed:", e);
    process.exit(1);
  }
}

runTests().catch(console.error);
