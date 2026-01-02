
import { OpportunityEvaluator } from './opportunity.evaluator';
import { memorySearcher } from '../../lib/embedder/searchers/memory.searcher';
import { Embedder, VectorSearchResult, VectorStoreOption } from '../common/types';
import { CandidateProfile } from './opportunity.evaluator.types';
import { UserMemoryProfile } from '../intent/manager/intent.manager.types';
import { log } from '../../lib/log';
import { json2md } from '../../lib/json2md/json2md';

// Mock Embedder that uses MemorySearcher
class MockMemoryEmbedder implements Embedder {
  async generate(text: string | string[], dimensions?: number): Promise<number[] | number[][]> {
    // Return a fixed dummy vector for testing
    // In real memory search, we'd need meaningful vectors, but for unit testing the flow:
    // We will manually assign vectors to candidates to ensure "match" logic works in the searcher.
    // If we want "A" to match "A", we give them same vector.
    return [1, 0, 0];
  }

  async search<T>(queryVector: number[], collection: string, options?: VectorStoreOption<T>): Promise<VectorSearchResult<T>[]> {
    return memorySearcher(queryVector, collection, options);
  }
}

// Mock Data
const sourceProfile: UserMemoryProfile = {
  identity: { name: "Alice", bio: "AI Researcher", location: "NYC" },
  narrative: { context: "Building AGI", aspirations: "Find a co-founder" },
  attributes: { interests: ["AI", "Crypto"], skills: ["Python", "TS"] }
} as any;

const candidateA: CandidateProfile & { embedding: number[] } = {
  userId: "user-a",
  identity: { name: "Bob", bio: "Crypto Dev" },
  narrative: {},
  attributes: {},
  embedding: [0, 1, 0] // Orthogonal to query [1,0,0] -> Similarity 0
};

const candidateB: CandidateProfile & { embedding: number[] } = {
  userId: "user-b",
  identity: { name: "Charlie", bio: "AI Engineer" },
  narrative: {},
  attributes: {},
  embedding: [1, 0, 0] // Identical to query [1,0,0] -> Similarity 1
};



async function setupEvaluator() {
  const embedder = new MockMemoryEmbedder();
  const evaluator = new OpportunityEvaluator(embedder);

  // Mock the LLM evaluateOpportunities call
  evaluator.evaluateOpportunities = async (source, candidates) => {
    // Simple mock logic: Return a match for every candidate passed to it
    // The filtering happens upstream in findCandidates (memorySearcher)
    return candidates.map(c => ({
      type: 'collaboration',
      title: `Match with ${c.identity.name}`,
      description: 'Good match',
      score: 90,
      candidateId: c.userId
    }));
  };
  return evaluator;
}

const sourceProfileContext = json2md.keyValue({
  bio: sourceProfile.identity.bio,
  location: sourceProfile.identity.location,
  interests: sourceProfile.attributes.interests,
  skills: sourceProfile.attributes.skills,
  aspirations: sourceProfile.narrative?.aspirations || '',
  context: sourceProfile.narrative?.context || ''
});

async function testBasicFlow() {
  log.info("--- Test: Basic Flow & Filtering (MinScore 0.5) ---");
  const evaluator = await setupEvaluator();

  const opportunities = await evaluator.runDiscovery(sourceProfileContext, {
    candidates: [candidateA, candidateB],
    hydeDescription: "Looking for a co-founder",
    limit: 5,
    minScore: 0.5
  });

  if (opportunities.length !== 1) throw new Error(`Expected 1 opportunity, found ${opportunities.length}`);
  if (opportunities[0].candidateId !== 'user-b') throw new Error(`Expected Charlie (user-b), found ${opportunities[0].candidateId}`);
  log.info("PASSED\n");
}

async function testEmptyCandidates() {
  log.info("--- Test: Empty Candidates List ---");
  const evaluator = await setupEvaluator();

  const opportunities = await evaluator.runDiscovery(sourceProfileContext, {
    candidates: [],
    hydeDescription: "Looking for anyone",
    limit: 5
  });

  if (opportunities.length !== 0) throw new Error(`Expected 0 opportunities, found ${opportunities.length}`);
  log.info("PASSED\n");
}

async function testHighThreshold() {
  log.info("--- Test: High Threshold (MinScore 1.5 - Impossible) ---");
  const evaluator = await setupEvaluator();

  // candidateB has score 1.0 (vector match). If we ask for 1.1, should find nothing.
  // Note: memorySearcher handles minScore filtering.
  const opportunities = await evaluator.runDiscovery(sourceProfileContext, {
    candidates: [candidateB],
    hydeDescription: "Looking for perfection",
    limit: 5,
    minScore: 1.1
  });

  if (opportunities.length !== 0) throw new Error(`Expected 0 opportunities, found ${opportunities.length}`);
  log.info("PASSED\n");
}

async function testMissingUserId() {
  log.info("--- Test: Candidate Missing UserId (Graceful Fail) ---");
  const evaluator = await setupEvaluator();

  const candidateNoId = { ...candidateB, userId: undefined } as any;

  // Should filter this out potentially or handle it? 
  // Evaluator logs warning. The mock currently returns map based on userId. 
  // If userId is missing, candidateId will be undefined.

  const opportunities = await evaluator.runDiscovery(sourceProfileContext, {
    candidates: [candidateNoId],
    hydeDescription: "Searching...",
    limit: 5
  });

  // Depending on behavior, it returns an op with undefined candidateId
  if (opportunities.length > 0) {
    if (opportunities[0].candidateId !== undefined) {
      throw new Error("Expected undefined candidateId for candidate without userId");
    }
  }
  log.info("PASSED\n");
}

async function runAllTests() {
  log.info("=== Starting Opportunity Evaluator Test Suite ===\n");
  try {
    await testBasicFlow();
    await testEmptyCandidates();
    await testHighThreshold();
    await testMissingUserId();
    log.info("=== All Tests Passed ===");
  } catch (e) {
    log.error("Test Failed:", e);
    process.exit(1);
  }
}

runAllTests().catch(console.error);
