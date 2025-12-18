import { z } from 'zod';
import { BaseLangChainAgent } from '../../../lib/langchain/langchain';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ProfileGeneratorOutput } from './profile.generator.types';

export const SYSTEM_PROMPT = `
    You are an expert profiler. Your task is to synthesize a structured User Profile from raw data scraped from the web (via Parallel.ai).

    Output Rules:
    1. Infer their name from the data.
    2. Synthesize a coherent 'bio' (short summary).
    3. Infer their current 'location' (City, Country formatted).
    4. Write a rich 'narrative.context' describing their current situation, constraints, and background in detail.
    5. Write a rich 'narrative.aspirations' describing what they effectively want to achieve or find.
    6. Extract specific 'skills' and 'interests'.
`;

// Zod Schemas for local validation/structured output definition
export const UserProfileSchema = z.object({
    identity: z.object({
        name: z.string().describe("The user's full name"),
        bio: z.string().describe("A short professional summary (1-2 sentences)"),
        location: z.string().describe("Inferred location (City, Country) or 'Remote'"),
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
});

export class ProfileGenerator extends BaseLangChainAgent {
    constructor() {
        super({
            model: 'openai/gpt-4o', // Use a strong model for synthesis
            responseFormat: ProfileGeneratorOutputSchema
        });
    }

    /**
     * Generates a structured profile from raw Parallel.ai data.
     * @param input Stringified JSON response from Parallel.ai search.
     */
    async run(input: string): Promise<ProfileGeneratorOutput> {
        console.debug({ input })
        const messages = [
            new SystemMessage(SYSTEM_PROMPT),
            new HumanMessage(`Here is the raw data:\n${input}`)
        ];

        const result = await this.model.invoke(messages);
        return result.structuredResponse as ProfileGeneratorOutput;
    }
}
