import { createAgent, BaseLangChainAgent } from "../../lib/langchain/langchain";
import { z } from "zod";
import { StakeMatcherOutput } from "./stake.matcher.types";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export const SYSTEM_PROMPT = `
  You are a semantic relationship analyst. Determine if two intents have MUTUAL relevance.

  STRICT Mutual criteria:
  - Both intents seek things that complement each other.
  - Bidirectional value.
  - IMMEDIATELY actionable.

  Score threshold: Must be >= 70 to qualify as mutual.
  
  CONFIDENCE SCORING:
  - 95-100: Exceptional / Perfect
  - 85-94: Strong
  - 70-84: Acceptable / Good
  - < 70: Not Mutual
`;

/**
 * Output Schemas
 */
export const MatchedStakeSchema = z.object({
  targetIntentId: z.string().describe("The ID of the candidate intent being evaluated"),
  isMutual: z.boolean().describe("Whether the two intents have mutual intent (both relate to or depend on each other)"),
  reasoning: z.string().describe("One sentence explanation. If mutual, explain why using subject matter. If not mutual, provide empty string."),
  confidenceScore: z.number().min(0).max(100).describe("Precise confidence score 0-100. Use full range 70-100 for mutual matches.")
});

export const StakeMatcherOutputSchema = z.object({
  matches: z.array(MatchedStakeSchema).describe("List of evaluated matches")
});

export class StakeMatcher extends BaseLangChainAgent {
  constructor(options: Partial<Parameters<typeof createAgent>[0]> = {}) {
    super({
      preset: 'stake-matcher',
      responseFormat: StakeMatcherOutputSchema,
      temperature: 0.2, // Low temp for consistent scoring
      ...options
    });
  }

  /**
   * Run the matcher for a specific intent against a list of candidates
   */
  async run(
    primaryIntent: { id: string; payload: string },
    candidates: Array<{ id: string; payload: string }>
  ): Promise<StakeMatcherOutput> {

    if (candidates.length === 0) {
      return { matches: [] };
    }

    // 2. Prepare Prompt
    const prompt = `
      Analyze the following intent against the candidates.

      PRIMARY INTENT:
      "${primaryIntent.payload}" (ID: ${primaryIntent.id})

      CANDIDATES:
      ${candidates.map((c, i) => `
        Candidate ${i + 1}:
        ID: ${c.id}
        Payload: "${c.payload}"
      `).join('\n')}

      For EACH candidate, determine isMutual, reasoning, and confidenceScore.
      Return the list of evaluations.
    `;

    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(prompt)
    ];

    try {
      // 3. Invoke LLM
      const result = await this.model.invoke({ messages });
      const output = result.structuredResponse as z.infer<typeof StakeMatcherOutputSchema>;

      // 4. Process matches
      const finalMatches: StakeMatcherOutput['matches'] = [];

      for (const match of output.matches) {
        if (match.isMutual && match.confidenceScore >= 70) {
          finalMatches.push({
            newIntentId: primaryIntent.id,
            targetIntentId: match.targetIntentId,
            score: match.confidenceScore,
            reasoning: match.reasoning,
            isMutual: match.isMutual
          });
        }
      }

      return { matches: finalMatches };

    } catch (error) {
      console.error("Error in StakeMatcher run:", error);
      return { matches: [] };
    }
  }
}
