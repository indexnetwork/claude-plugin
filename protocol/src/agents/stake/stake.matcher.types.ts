
export interface MatchedStake {
  newIntentId: string;
  targetIntentId: string;
  score: number;
  reasoning: string;
  isMutual: boolean;
}

export interface StakeMatcherOutput {
  matches: MatchedStake[];
}
