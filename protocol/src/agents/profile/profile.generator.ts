import { z } from 'zod';
import { BaseLangChainAgent } from '../../lib/langchain/langchain';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ProfileGeneratorOutput, ProfileGeneratorAgent } from './profile.generator.types';

export const SYSTEM_PROMPT = `You are an expert profiler. Your task is to synthesize a structured User Profile from raw data scraped from the web (via Parallel.ai).

You must also infer "Implicit Intents" - these are potential needs, desires, or opportunities for the user.

Output Rules:
1. Synthesize a coherent 'bio' (short summary).
2. Write a rich 'narrative.context' describing their current situation, constraints, and background in detail.
3. Write a rich 'narrative.aspirations' describing what they effectively want to achieve or find.
4. Extract specific 'skills' and 'interests'.
5. Generate 3-5 'implicitIntents'. These should be actionable desires or directions the user is moving in.
   - actionable: "Looking for co-founder" is explicit, but if they just mention "building a startup", the implicit intent is "Building a startup".
   - promote: New users need opportunities.
`;

// Zod Schemas for local validation/structured output definition
export const UserProfileSchema = z.object({
    identity: z.object({
        name: z.string().describe("The user's full name"),
        bio: z.string().describe("A short professional summary (1-2 sentences)"),
    }),
    narrative: z.object({
        context: z.string().describe("A rich, detailed narrative about the user's current situation, background, and what they are currently working on. Use raw, natural language."),
        aspirations: z.string().describe("A rich, detailed narrative about what the user wants to achieve, who they want to meet, and their future goals. Use raw, natural language."),
    }),
    attributes: z.object({
        interests: z.array(z.string()).describe("Inferred or explicit interests"),
        skills: z.array(z.string()).describe("Professional skills"),
    }),
});

export const ProfileGeneratorOutputSchema = z.object({
    profile: UserProfileSchema,
    implicitIntents: z.array(z.string()).describe("A list of implicit intents (desires/needs) inferred from the profile. e.g. 'Considering Rust for next project'"),
});

export class ProfileGenerator extends BaseLangChainAgent {
    constructor() {
        super({
            model: 'openai/gpt-4o', // Use a strong model for synthesis
            responseFormat: ProfileGeneratorOutputSchema
        });
    }

    /**
     * Generates a structured profile and implicit intents from raw Parallel.ai data.
     * @param parallelData The raw JSON response from Parallel.ai search.
     */
    async run(parallelData: any): Promise<ProfileGeneratorOutput> {
        const messages = [
            new SystemMessage(SYSTEM_PROMPT),
            new HumanMessage(`Here is the raw data:\n${JSON.stringify(parallelData, null, 2)}`)
        ];

        const result = await this.model.invoke(messages);
        return result as ProfileGeneratorOutput;
    }
}
