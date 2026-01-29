import { ChatOpenAI } from "@langchain/openai";
import { createAgent, HumanMessage, ReactAgent } from "langchain";
import { z } from "zod";
import { log } from "../../../log";
import type { RouterOutput } from "./router.agent";

/**
 * Config
 */
import { config } from "dotenv";
config({ path: '.env.development', override: true });

const model = new ChatOpenAI({
  model: 'google/gemini-3-flash-preview',
  configuration: { 
    baseURL: process.env.OPENROUTER_BASE_URL, 
    apiKey: process.env.OPENROUTER_API_KEY 
  }
});

// ──────────────────────────────────────────────────────────────
// 1. SYSTEM PROMPT
// ──────────────────────────────────────────────────────────────

const systemPrompt = `
You are a Response Generator for a professional networking platform.
Your task is to synthesize a helpful, natural response based on system outputs.

## Response Guidelines

1. **Be Conversational** - Write like a helpful assistant, not a robot
2. **Be Specific** - Reference actual results, not generic responses
3. **Be Actionable** - Suggest next steps when appropriate
4. **Be Concise** - Respect user's time, avoid unnecessary verbosity

## Context Handling

- If intents were created/updated: Acknowledge the change and summarize what was captured
- If profile was updated: Confirm what was changed and offer to do more
- If opportunities found: Present them clearly with key highlights, focusing on why each match is relevant
- If clarification needed: Ask specific questions to disambiguate
- If no action taken: Engage naturally in conversation, be helpful and friendly

## Tone
Professional but friendly. Like a knowledgeable colleague who wants to help.
Avoid corporate jargon. Be genuine and human.

## Format
- Use short paragraphs for readability
- Use bullet points for lists of items (opportunities, skills, etc.)
- Bold important names or key information when appropriate
`;

// ──────────────────────────────────────────────────────────────
// 2. RESPONSE SCHEMA (Zod)
// ──────────────────────────────────────────────────────────────

const responseSchema = z.object({
  response: z.string().describe("The response text to send to the user"),
  suggestedActions: z.array(z.string()).optional().describe("Suggested follow-up actions the user might want to take")
});

// ──────────────────────────────────────────────────────────────
// 3. TYPE DEFINITIONS
// ──────────────────────────────────────────────────────────────

export type ResponseGeneratorOutput = z.infer<typeof responseSchema>;

/**
 * Intent action types from IntentReconcilerOutput.
 * Matches the discriminated union from intent.reconciler.ts
 */
export type IntentAction =
  | {
      type: "create";
      payload: string;
      score: number | null;
      reasoning: string | null;
      intentMode: "REFERENTIAL" | "ATTRIBUTIVE" | null;
      referentialAnchor: string | null;
      semanticEntropy: number | null;
    }
  | {
      type: "update";
      id: string;
      payload: string;
      score: number | null;
      reasoning: string | null;
      intentMode: "REFERENTIAL" | "ATTRIBUTIVE" | null;
    }
  | {
      type: "expire";
      id: string;
      reason: string;
    };

/**
 * Opportunity type from OpportunityEvaluator.
 * Matches the schema from opportunity.evaluator.ts
 */
export interface OpportunityResult {
  sourceDescription: string;
  candidateDescription: string;
  score: number;
  valencyRole: "Agent" | "Patient" | "Peer";
  sourceId: string;
  candidateId: string;
}

/**
 * Subgraph results structure passed to the response generator.
 * This is a flexible structure that accumulates outputs from various subgraphs.
 */
export interface SubgraphResults {
  intent?: {
    actions: IntentAction[];
    inferredIntents: string[];
  };
  profile?: {
    updated: boolean;
    profile?: {
      identity: { name: string; bio: string; location: string };
      narrative: { context: string };
      attributes: { interests: string[]; skills: string[] };
    };
  };
  opportunity?: {
    opportunities: OpportunityResult[];
    searchQuery?: string;
  };
}

// ──────────────────────────────────────────────────────────────
// 4. CLASS DEFINITION
// ──────────────────────────────────────────────────────────────

/**
 * ResponseGeneratorAgent synthesizes natural language responses from subgraph results.
 * It takes the routing decision and accumulated results to create a coherent user response.
 */
export class ResponseGeneratorAgent {
  private agent: ReactAgent;

  constructor() {
    this.agent = createAgent({ 
      model, 
      responseFormat: responseSchema, 
      systemPrompt 
    });
  }

  /**
   * Formats subgraph results into a readable string for the LLM prompt.
   */
  private formatSubgraphResults(results: SubgraphResults): string {
    const sections: string[] = [];

    if (results.intent) {
      sections.push('## Intent Processing Results');
      if (results.intent.actions.length > 0) {
        sections.push('Actions taken:');
        results.intent.actions.forEach(a => {
          // Handle different action types
          if (a.type === 'create') {
            sections.push(`- CREATE: "${a.payload}"`);
          } else if (a.type === 'update') {
            sections.push(`- UPDATE (${a.id}): "${a.payload}"`);
          } else if (a.type === 'expire') {
            sections.push(`- EXPIRE (${a.id}): ${a.reason}`);
          }
        });
      }
      if (results.intent.inferredIntents.length > 0) {
        sections.push('Intents detected:');
        results.intent.inferredIntents.forEach(i => {
          sections.push(`- ${i}`);
        });
      }
    }

    if (results.profile) {
      sections.push('## Profile Results');
      sections.push(`Updated: ${results.profile.updated ? 'Yes' : 'No'}`);
      if (results.profile.profile) {
        const p = results.profile.profile;
        sections.push(`Name: ${p.identity.name}`);
        sections.push(`Bio: ${p.identity.bio}`);
        sections.push(`Skills: ${p.attributes.skills.join(', ')}`);
      }
    }

    if (results.opportunity) {
      sections.push('## Opportunity Results');
      if (results.opportunity.searchQuery) {
        sections.push(`Search: "${results.opportunity.searchQuery}"`);
      }
      if (results.opportunity.opportunities.length > 0) {
        sections.push(`Found ${results.opportunity.opportunities.length} matches:`);
        results.opportunity.opportunities.forEach((o, i) => {
          sections.push(`${i + 1}. Candidate: ${o.candidateId}`);
          sections.push(`   Score: ${o.score}/100`);
          sections.push(`   Role: ${o.valencyRole}`);
          sections.push(`   For you: ${o.sourceDescription}`);
          sections.push(`   For them: ${o.candidateDescription}`);
        });
      } else {
        sections.push('No matching opportunities found.');
      }
    }

    return sections.length > 0 ? sections.join('\n') : 'No subgraph results available.';
  }

  /**
   * Invokes the response generator to synthesize a user response.
   * @param originalMessage - The original user message
   * @param routingDecision - The routing decision from RouterAgent
   * @param subgraphResults - Accumulated results from subgraph processing
   * @returns ResponseGeneratorOutput with response text and optional suggested actions
   */
  public async invoke(
    originalMessage: string,
    routingDecision: RouterOutput,
    subgraphResults: SubgraphResults
  ): Promise<ResponseGeneratorOutput> {
    log.info('[ResponseGeneratorAgent.invoke] Generating response...', { 
      target: routingDecision.target 
    });

    const formattedResults = this.formatSubgraphResults(subgraphResults);

    const prompt = `
# Original User Message
${originalMessage}

# Routing Decision
Target: ${routingDecision.target}
Confidence: ${routingDecision.confidence}
Reasoning: ${routingDecision.reasoning}

# Processing Results
${formattedResults}

Generate an appropriate, natural response for the user based on the above context and results.
    `.trim();

    const messages = [new HumanMessage(prompt)];
    
    try {
      const result = await this.agent.invoke({ messages });
      const output = responseSchema.parse(result.structuredResponse);
      
      log.info('[ResponseGeneratorAgent.invoke] Response generated', { 
        responseLength: output.response.length,
        suggestedActions: output.suggestedActions?.length || 0
      });
      
      return output;
    } catch (error: unknown) {
      log.error('[ResponseGeneratorAgent.invoke] Error generating response', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Fallback response
      return {
        response: "I apologize, but I encountered an issue processing your request. Could you please try rephrasing your message?",
        suggestedActions: ["Try a simpler request", "Ask for help"]
      };
    }
  }
}
