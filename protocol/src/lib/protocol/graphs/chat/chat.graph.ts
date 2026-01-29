import { StateGraph, START, END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ChatGraphState, RouteTarget, RoutingDecision, SubgraphResults } from "./chat.graph.state";
import { RouterAgent } from "../../agents/chat/router.agent";
import { ResponseGeneratorAgent } from "../../agents/chat/response.generator";
import { IntentGraphFactory } from "../intent/intent.graph";
import { ProfileGraphFactory } from "../profile/profile.graph";
import { OpportunityGraph } from "../opportunity/opportunity.graph";
import type { ChatGraphCompositeDatabase } from "../../interfaces/database.interface";
import type { Embedder } from "../../interfaces/embedder.interface";
import type { Scraper } from "../../interfaces/scraper.interface";
import { log } from "../../../log";

/**
 * Factory class to build and compile the Chat Graph.
 * 
 * The Chat Graph serves as the primary orchestration layer for user conversations.
 * It coordinates subgraphs for Intent, Profile, and Opportunity processing.
 * 
 * Flow:
 * 1. loadContext - Fetch user profile and active intents
 * 2. router - Analyze message and determine routing
 * 3. [subgraph] - Process based on routing decision
 * 4. generateResponse - Synthesize final response
 */
export class ChatGraphFactory {
  constructor(
    private database: ChatGraphCompositeDatabase,
    private embedder: Embedder,
    private scraper: Scraper
  ) {}

  /**
   * Creates and compiles the Chat Graph.
   * @returns Compiled StateGraph ready for invocation
   */
  public createGraph() {
    // Initialize Agents
    const routerAgent = new RouterAgent();
    const responseGenerator = new ResponseGeneratorAgent();

    // Initialize Subgraphs
    const intentGraph = new IntentGraphFactory(this.database).createGraph();
    const profileGraph = new ProfileGraphFactory(
      this.database, 
      this.embedder, 
      this.scraper
    ).createGraph();
    const opportunityGraph = new OpportunityGraph(
      this.database, 
      this.embedder
    ).compile();

    // ─────────────────────────────────────────────────────────
    // NODE: Load Context
    // Fetches user profile and active intents from the database
    // ─────────────────────────────────────────────────────────
    const loadContextNode = async (state: typeof ChatGraphState.State) => {
      log.info("[ChatGraph:LoadContext] Loading user context...", { 
        userId: state.userId 
      });

      try {
        const profile = await this.database.getProfile(state.userId);
        
        // TODO: Load active intents from database/intent service
        // This would typically call: await this.database.getActiveIntentsFormatted(state.userId)
        const activeIntents = "No active intents."; 

        log.info("[ChatGraph:LoadContext] Context loaded", { 
          hasProfile: !!profile,
          activeIntents: activeIntents.substring(0, 50)
        });

        return {
          userProfile: profile ?? undefined,
          activeIntents
        };
      } catch (error) {
        log.error("[ChatGraph:LoadContext] Failed to load context", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return {
          userProfile: undefined,
          activeIntents: "",
          error: "Failed to load user context"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Router
    // Analyzes message and determines routing target
    // ─────────────────────────────────────────────────────────
    const routerNode = async (state: typeof ChatGraphState.State) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const userMessage = lastMessage?.content?.toString() || "";

      log.info("[ChatGraph:Router] Analyzing message...", { 
        messagePreview: userMessage.substring(0, 50) 
      });

      // Build profile context string for the router
      const profileContext = state.userProfile 
        ? `Name: ${state.userProfile.identity.name}\n` +
          `Bio: ${state.userProfile.identity.bio}\n` +
          `Location: ${state.userProfile.identity.location}\n` +
          `Skills: ${state.userProfile.attributes.skills.join(", ")}\n` +
          `Interests: ${state.userProfile.attributes.interests.join(", ")}`
        : "";

      try {
        const decision = await routerAgent.invoke(
          userMessage,
          profileContext,
          state.activeIntents
        );

        log.info("[ChatGraph:Router] Decision made", { 
          target: decision.target, 
          confidence: decision.confidence 
        });

        return {
          routingDecision: decision as RoutingDecision
        };
      } catch (error) {
        log.error("[ChatGraph:Router] Routing failed", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return {
          routingDecision: {
            target: "respond" as RouteTarget,
            confidence: 0.5,
            reasoning: "Defaulting to response due to routing error"
          },
          error: "Routing failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Intent Subgraph Wrapper
    // Maps ChatGraphState to IntentGraphState and invokes
    // ─────────────────────────────────────────────────────────
    const intentSubgraphNode = async (state: typeof ChatGraphState.State) => {
      log.info("[ChatGraph:IntentSubgraph] Processing intents...");
      
      const lastMessage = state.messages[state.messages.length - 1];
      const inputContent = lastMessage?.content?.toString() || "";
      
      try {
        // Map ChatGraphState to IntentGraphState input
        const intentInput = {
          userId: state.userId,
          userProfile: state.userProfile
            ? JSON.stringify(state.userProfile)
            : "",
          inputContent,
        };

        const result = await intentGraph.invoke(intentInput);

        log.info("[ChatGraph:IntentSubgraph] Processing complete", {
          actionsCount: result.actions?.length || 0,
          inferredCount: result.inferredIntents?.length || 0
        });

        const subgraphResults: SubgraphResults = {
          intent: {
            actions: result.actions || [],
            inferredIntents: (result.inferredIntents || []).map(
              (i: { description: string }) => i.description
            )
          }
        };

        return { subgraphResults };
      } catch (error) {
        log.error("[ChatGraph:IntentSubgraph] Processing failed", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return { 
          subgraphResults: { intent: { actions: [], inferredIntents: [] } },
          error: "Intent processing failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Profile Subgraph Wrapper
    // Maps ChatGraphState to ProfileGraphState and invokes
    // ─────────────────────────────────────────────────────────
    const profileSubgraphNode = async (state: typeof ChatGraphState.State) => {
      log.info("[ChatGraph:ProfileSubgraph] Processing profile...");
      
      try {
        // Map ChatGraphState to ProfileGraphState input
        const profileInput = {
          userId: state.userId,
          input: state.routingDecision?.extractedContext,
          objective: undefined,
          profile: state.userProfile,
          hydeDescription: undefined
        };

        const result = await profileGraph.invoke(profileInput);

        log.info("[ChatGraph:ProfileSubgraph] Processing complete", {
          hasProfile: !!result.profile
        });

        const subgraphResults: SubgraphResults = {
          profile: {
            updated: !!result.profile,
            profile: result.profile
          }
        };

        return { 
          userProfile: result.profile,
          subgraphResults 
        };
      } catch (error) {
        log.error("[ChatGraph:ProfileSubgraph] Processing failed", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return { 
          subgraphResults: { profile: { updated: false } },
          error: "Profile processing failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Opportunity Subgraph Wrapper
    // Maps ChatGraphState to OpportunityGraphState and invokes
    // ─────────────────────────────────────────────────────────
    const opportunitySubgraphNode = async (state: typeof ChatGraphState.State) => {
      log.info("[ChatGraph:OpportunitySubgraph] Finding opportunities...");
      
      // Build HyDE description from user message context
      const lastMessage = state.messages[state.messages.length - 1];
      const hydeDescription = state.routingDecision?.extractedContext || 
        lastMessage?.content?.toString() || "";

      try {
        const opportunityInput = {
          options: {
            hydeDescription,
            limit: 5
          },
          sourceUserId: state.userId,
          sourceProfileContext: state.userProfile 
            ? `${state.userProfile.identity.name}: ${state.userProfile.identity.bio}`
            : "",
          candidates: [],
          opportunities: []
        };

        const result = await opportunityGraph.invoke(opportunityInput);

        // Cast to array since the result might be empty object on error
        const opportunities = Array.isArray(result.opportunities)
          ? result.opportunities
          : [];

        log.info("[ChatGraph:OpportunitySubgraph] Search complete", {
          opportunitiesFound: opportunities.length
        });

        const subgraphResults: SubgraphResults = {
          opportunity: {
            opportunities,
            searchQuery: hydeDescription
          }
        };

        return { subgraphResults };
      } catch (error) {
        log.error("[ChatGraph:OpportunitySubgraph] Processing failed", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return { 
          subgraphResults: { opportunity: { opportunities: [], searchQuery: "" } },
          error: "Opportunity search failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Direct Response
    // Handles direct responses without subgraph processing
    // ─────────────────────────────────────────────────────────
    const respondDirectNode = async (state: typeof ChatGraphState.State) => {
      log.info("[ChatGraph:RespondDirect] Handling direct response...");
      
      // For simple responses, we proceed directly to response generation
      // The response generator will use the routing decision context
      return {};
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Clarify
    // Handles clarification requests
    // ─────────────────────────────────────────────────────────
    const clarifyNode = async (state: typeof ChatGraphState.State) => {
      log.info("[ChatGraph:Clarify] Requesting clarification...");
      
      // Signal that clarification is needed
      // The response generator will craft an appropriate clarification question
      return {
        subgraphResults: {} as SubgraphResults
      };
    };

    // ─────────────────────────────────────────────────────────
    // NODE: Generate Response
    // Synthesizes final response using ResponseGeneratorAgent
    // ─────────────────────────────────────────────────────────
    const generateResponseNode = async (state: typeof ChatGraphState.State) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const userMessage = lastMessage?.content?.toString() || "";

      log.info("[ChatGraph:GenerateResponse] Generating response...");

      if (!state.routingDecision) {
        const errorResponse = "I'm sorry, I couldn't process your request. Please try again.";
        return {
          responseText: errorResponse,
          messages: [new AIMessage(errorResponse)]
        };
      }

      try {
        const response = await responseGenerator.invoke(
          userMessage,
          state.routingDecision,
          state.subgraphResults || {}
        );

        log.info("[ChatGraph:GenerateResponse] Response generated", {
          responseLength: response.response.length
        });

        return {
          responseText: response.response,
          messages: [new AIMessage(response.response)]
        };
      } catch (error) {
        log.error("[ChatGraph:GenerateResponse] Generation failed", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        
        const fallbackResponse = "I apologize, but I encountered an issue. Could you please try again?";
        return {
          responseText: fallbackResponse,
          messages: [new AIMessage(fallbackResponse)],
          error: "Response generation failed"
        };
      }
    };

    // ─────────────────────────────────────────────────────────
    // ROUTING CONDITION
    // Determines which subgraph/node to route to
    // ─────────────────────────────────────────────────────────
    const routeCondition = (state: typeof ChatGraphState.State): RouteTarget => {
      const target = state.routingDecision?.target || "respond";
      log.debug("[ChatGraph:RouteCondition] Routing to", { target });
      return target;
    };

    // ─────────────────────────────────────────────────────────
    // GRAPH ASSEMBLY
    // ─────────────────────────────────────────────────────────
    const workflow = new StateGraph(ChatGraphState)
      // Add Nodes
      .addNode("load_context", loadContextNode)
      .addNode("router", routerNode)
      .addNode("intent_subgraph", intentSubgraphNode)
      .addNode("profile_subgraph", profileSubgraphNode)
      .addNode("opportunity_subgraph", opportunitySubgraphNode)
      .addNode("respond_direct", respondDirectNode)
      .addNode("clarify", clarifyNode)
      .addNode("generate_response", generateResponseNode)

      // Define Flow: START -> load_context -> router
      .addEdge(START, "load_context")
      .addEdge("load_context", "router")

      // Conditional Routing from router node
      .addConditionalEdges("router", routeCondition, {
        intent_subgraph: "intent_subgraph",
        profile_subgraph: "profile_subgraph",
        opportunity_subgraph: "opportunity_subgraph",
        respond: "respond_direct",
        clarify: "clarify"
      })

      // All paths lead to response generation
      .addEdge("intent_subgraph", "generate_response")
      .addEdge("profile_subgraph", "generate_response")
      .addEdge("opportunity_subgraph", "generate_response")
      .addEdge("respond_direct", "generate_response")
      .addEdge("clarify", "generate_response")

      // Generate response -> END
      .addEdge("generate_response", END);

    log.info("[ChatGraphFactory] Graph compiled successfully");
    return workflow.compile();
  }
}
