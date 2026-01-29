import { StateGraph, END, START } from "@langchain/langgraph";
import { OpportunityGraphState, createInitialState } from "./opportunity.state";
import { OpportunityEvaluator, CandidateProfile } from "../../agents/opportunity/opportunity.evaluator";
import { OpportunityGraphDatabase } from "../../interfaces/database.interface";
import { Embedder } from "../../interfaces/embedder.interface";
import { log } from "../../../log";

export class OpportunityGraph {
  private database: OpportunityGraphDatabase;
  private embedder: Embedder;
  private evaluatorAgent: OpportunityEvaluator;

  constructor(database: OpportunityGraphDatabase, embedder: Embedder) {
    this.database = database;
    this.embedder = embedder;
    this.evaluatorAgent = new OpportunityEvaluator();
  }

  /**
   * Compiles the graph into a Runnable.
   */
  public compile() {
    const builder = new StateGraph<OpportunityGraphState>({
      channels: {
        options: { value: (a, b) => b ?? a, default: () => ({}) },
        sourceProfileContext: { value: (a, b) => b ?? a, default: () => '' },
        sourceUserId: { value: (a, b) => b ?? a, default: () => '' },
        candidates: { value: (a, b) => b ?? a, default: () => [] },
        opportunities: { value: (a, b) => b ?? a, default: () => [] },
      }
    })
      .addNode("resolve_source_profile", this.resolveSourceProfileNode.bind(this))
      .addNode("search_candidates", this.searchNode.bind(this))
      .addNode("evaluate_candidates", this.evaluateNode.bind(this))
      .addEdge(START, "resolve_source_profile")
      .addConditionalEdges("resolve_source_profile", (state) => {
        if (state.candidates && state.candidates.length > 0) {
          log.info("[OpportunityGraph] Candidates provided directly. Skipping search.");
          return "evaluate_candidates";
        }
        if (state.options.hydeDescription) {
          log.info("[OpportunityGraph] No candidates. Proceeding to Search.");
          return "search_candidates";
        }
        log.warn("[OpportunityGraph] No candidates and no HyDE description. Ending.");
        return END;
      })
      .addEdge("search_candidates", "evaluate_candidates")
      .addEdge("evaluate_candidates", END);

    return builder.compile();
  }

  // ──────────────────────────────────────────────────────────────
  // Node Implementations
  // ──────────────────────────────────────────────────────────────

  /**
   * NODE: resolve_source_profile
   * Fetches source profile from database if context is missing but ID is provided.
   */
  private async resolveSourceProfileNode(state: OpportunityGraphState): Promise<Partial<OpportunityGraphState>> {
    let { sourceProfileContext, sourceUserId } = state;

    if (!sourceProfileContext && sourceUserId) {
      log.info(`[OpportunityGraph] Resolving source profile for userId: ${sourceUserId}`);
      try {
        const profile = await this.database.getProfile(sourceUserId);

        if (profile) {
          const identity = profile.identity || {};
          const attributes = profile.attributes || {};
          const narrative = profile.narrative || {};

          sourceProfileContext = `
            Name: ${identity.name || 'Unknown'}
            Bio: ${identity.bio || ''}
            Location: ${identity.location || ''}
            Interests: ${attributes.interests?.join(', ') || ''}
            Skills: ${attributes.skills?.join(', ') || ''}
            Context: ${narrative.context || ''}
          `.trim();
          log.info("[OpportunityGraph] Source profile resolved successfully.");
        } else {
          log.warn(`[OpportunityGraph] Profile not found for userId: ${sourceUserId}`);
        }
      } catch (error) {
        log.error(`[OpportunityGraph] Failed to fetch source profile for ${sourceUserId}`, { error });
      }
    }

    return { sourceProfileContext };
  }

  /**
   * NODE: search_candidates
   * Uses Embedder to find candidates based on HyDE description.
   */
  private async searchNode(state: OpportunityGraphState): Promise<Partial<OpportunityGraphState>> {
    const { options } = state;

    // 1. Generate Query Vector
    const queryText = options.hydeDescription;
    if (!queryText) {
      log.error("[OpportunityGraph] Missing HyDE description in search node.");
      return { candidates: [] };
    }

    log.info(`[OpportunityGraph] Generating instructions for query: "${queryText.substring(0, 30)}..."`);
    const embeddingResult = await this.embedder.generate(queryText);

    const queryVector = Array.isArray(embeddingResult[0])
      ? (embeddingResult as number[][])[0]
      : (embeddingResult as number[]);

    // 2. Search
    log.info("[OpportunityGraph] Searching vector database...");
    const searchResults = await this.embedder.search<CandidateProfile>(
      queryVector,
      'profiles',
      {
        filter: options.filter,
        limit: options.limit || 5, // Default to 5 candidates
      }
    );

    const candidates = searchResults.map(r => r.item);
    log.info(`[OpportunityGraph] Found ${candidates.length} candidates.`);

    return { candidates };
  }

  /**
   * NODE: evaluate_candidates
   * Uses OpportunityEvaluator Agent to analyze candidates.
   */
  private async evaluateNode(state: OpportunityGraphState): Promise<Partial<OpportunityGraphState>> {
    const { candidates, sourceProfileContext, options } = state;

    if (!candidates || candidates.length === 0) {
      log.info("[OpportunityGraph] No candidates to evaluate.");
      return { opportunities: [] };
    }

    log.info(`[OpportunityGraph] Evaluating ${candidates.length} candidates...`);
    const opportunities = await this.evaluatorAgent.invoke(sourceProfileContext, candidates, options);

    log.info(`[OpportunityGraph] Identification complete. Found ${opportunities.length} opportunities.`);
    return { opportunities };
  }
}
