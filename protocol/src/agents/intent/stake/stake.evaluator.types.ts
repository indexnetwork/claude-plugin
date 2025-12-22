export interface StakeEvaluatorOutput {
  matches: {
    candidateIntentId: string;
    isMatch: boolean;
    confidence: "high" | "medium" | "low";
    reason: string;
  }[];
}
