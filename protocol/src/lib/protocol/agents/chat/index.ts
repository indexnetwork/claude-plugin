/**
 * Chat Agents Module
 *
 * Exports all chat-related agents for the Chat Graph orchestration layer.
 */

// Router Agent - Analyzes messages and determines routing
export { RouterAgent } from "./router.agent";
export type { RouterOutput, RouteTarget } from "./router.agent";

// Response Generator Agent - Synthesizes responses from subgraph results
export { ResponseGeneratorAgent } from "./response.generator";
export type {
  ResponseGeneratorOutput,
  SubgraphResults,
  IntentAction,
  OpportunityResult
} from "./response.generator";
