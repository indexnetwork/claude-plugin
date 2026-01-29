import { BaseMessage } from "@langchain/core/messages";
import { CandidateProfile, Opportunity, OpportunityEvaluatorOptions } from "../../agents/opportunity/opportunity.evaluator";

/**
 * The State of the Opportunity Matching Graph.
 * 
 * Channels:
 * - options: Trace-scoped configuration (Read-Only).
 * - sourceProfileContext: The source user profile context (Read-Only).
 * - candidates: List of found candidates (Read/Write).
 * - opportunities: List of valid opportunities (Write-Only).
 */
export interface OpportunityGraphState {
  // Config & Inputs
  options: OpportunityEvaluatorOptions;
  sourceProfileContext: string;
  sourceUserId: string;

  // Intermediate State
  candidates: CandidateProfile[];

  // Output State
  opportunities: Opportunity[];
}

/**
 * Initial State Factory
 */
export function createInitialState(): OpportunityGraphState {
  return {
    options: {},
    sourceProfileContext: '',
    sourceUserId: '',
    candidates: [],
    opportunities: []
  };
}
