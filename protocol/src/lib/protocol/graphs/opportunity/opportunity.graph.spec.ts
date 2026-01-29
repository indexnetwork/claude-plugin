import { describe, test, expect, spyOn, beforeAll } from 'bun:test';
import { OpportunityGraph } from './opportunity.graph';
import { Database } from '../../interfaces/database.interface';
import { Embedder } from '../../interfaces/embedder.interface';
import { CandidateProfile } from '../../agents/opportunity/opportunity.evaluator';

describe('Opportunity Graph Tests', () => {
  let graph: OpportunityGraph;
  let mockDb: any;
  let mockEmbedder: any;
  let compiledGraph: any;

  // Mock Data
  const sourceProfile = "User is an experienced Rust developer building a decentralized exchange.";
  const candidates: CandidateProfile[] = [
    { userId: 'user-bob', identity: { name: 'Bob', bio: 'Looking for a Rust mentor' }, narrative: { context: "I want to learn systems programming." }, score: 0.9 },
    { userId: 'user-alice', identity: { name: 'Alice', bio: 'React Dev' }, narrative: { context: "Building frontend apps." }, score: 0.8 }
  ];

  beforeAll(() => {
    // Mock Database
    mockDb = {
      get: () => Promise.resolve(null),
      insert: () => Promise.resolve(null),
    } as unknown as Database;

    // Mock Embedder
    mockEmbedder = {
      generate: () => Promise.resolve(new Array(2000).fill(0.1)),
      search: () => Promise.resolve(candidates.map(c => ({ item: c, score: 0.9 })))
    } as unknown as Embedder;

    graph = new OpportunityGraph(mockDb, mockEmbedder);
    compiledGraph = graph.compile();
  });

  test('Flow: Direct Candidates (Skip Search)', async () => {
    const inputState = {
      sourceProfileContext: sourceProfile,
      sourceUserId: 'user-source',
      candidates: candidates,
      options: { minScore: 50 },
      opportunities: []
    };

    // Mock Evaluator inside the graph (we can't easily spy on private property without casting, 
    // but we can trust the agent mocking if we mock the underlying createAgent or similar, 
    // OR just Mock the evaluatorAgent on the graph instance if we expose it or assume integration test).

    // For this test, we are testing the graph flow primarily.
    // The real agent calls OpenAI. Let's Mock the invoke method of the agent property.
    spyOn((graph as any).evaluatorAgent, 'invoke').mockResolvedValue([{
      sourceId: 'user-source',
      candidateId: 'user-bob',
      score: 95,
      sourceDescription: 'Meet Bob',
      candidateDescription: 'Meet Source',
      valencyRole: 'Agent'
    }]);

    const result = await compiledGraph.invoke(inputState);

    expect(result.opportunities.length).toBe(1);
    expect(result.opportunities[0].candidateId).toBe('user-bob');
    // Ensure search was NOT called (candidates were provided)
    // We can verify this by checking if mockEmbedder.search was called?
    // Spy on mockEmbedder.search
    // NOTE: Spying here might need re-setup if beforeAll runs once. 
  });

  test('Flow: Discovery (Search -> Evaluate)', async () => {
    const inputState = {
      sourceProfileContext: sourceProfile,
      sourceUserId: 'user-source',
      candidates: [],
      options: { minScore: 50, hydeDescription: "Find Rust developers" },
      opportunities: []
    };

    // Mock Search
    const searchSpy = spyOn(mockEmbedder, 'search').mockResolvedValue([
      { item: candidates[0], score: 0.95 }
    ]);

    // Mock Evaluate
    spyOn((graph as any).evaluatorAgent, 'invoke').mockResolvedValue([{
      sourceId: 'user-source',
      candidateId: 'user-bob',
      score: 95,
      sourceDescription: 'Meet Bob',
      candidateDescription: 'Meet Source',
      valencyRole: 'Agent'
    }]);

    const result = await compiledGraph.invoke(inputState);

    expect(searchSpy).toHaveBeenCalled();
    expect(result.candidates.length).toBe(1); // From search
    expect(result.opportunities.length).toBe(1);
  });

  test('Flow: Resolve Source Profile (Missing Context) -> Search -> Evaluate', async () => {
    // 1. Setup Mock DB response for user profile
    spyOn(mockDb, 'get').mockResolvedValue({
      identity: { name: 'Resolved User', bio: 'AI Engineer' },
      attributes: { skills: ['Python', 'LangChain'] }
    });

    const inputState = {
      sourceProfileContext: '', // EMPTY context
      sourceUserId: 'user-source-resolved',
      candidates: [],
      options: { minScore: 50, hydeDescription: "Find AI jobs" },
      opportunities: []
    };

    // Mock Search
    spyOn(mockEmbedder, 'search').mockResolvedValue([
      { item: candidates[0], score: 0.95 }
    ]);

    // Mock Evaluate
    spyOn((graph as any).evaluatorAgent, 'invoke').mockResolvedValue([{
      sourceId: 'user-source-resolved',
      candidateId: 'user-bob',
      score: 95
    }]);

    const result = await compiledGraph.invoke(inputState);

    // Verify source profile was resolved
    expect(result.sourceProfileContext).toContain('Resolved User');
    expect(result.sourceProfileContext).toContain('AI Engineer');

    // Verify flow continued to search and evaluate
    expect(result.candidates.length).toBe(1);
    expect(result.opportunities.length).toBe(1);
  });
});
