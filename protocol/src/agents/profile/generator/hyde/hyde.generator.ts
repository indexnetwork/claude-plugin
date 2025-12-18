import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { UserMemoryProfile } from '../../../intent/manager/intent.manager.types';
import { z } from 'zod';
import { json2md } from '../../../../lib/json2md/json2md';
import { BaseLangChainAgent } from '../../../../lib/langchain/langchain';

// System prompt for HyDE Generation
const HYDE_GENERATION_PROMPT = `
    You are a Profile Profiler.
    Given a user's profile, describe the **perfect** person they should meet to accelerate their goals.
    Describe this ideal candidate's Bio, Skills, and top Intents.
    Your output will be used to search a database of user profiles.
    Return a concise paragraph written in the first person (as if the candidate wrote it).
`;

const HydeDescriptionSchema = z.object({
  description: z.string().describe("The hypothetical ideal candidate description"),
});

/**
 * Helper Agent specifically for generating HyDE descriptions.
 * Encapsulated to have its own schema configuration.
 */
export class HydeGeneratorAgent extends BaseLangChainAgent {
  constructor() {
    super({
      model: 'openai/gpt-4o',
      responseFormat: HydeDescriptionSchema
    });
  }

  async generate(profile: UserMemoryProfile): Promise<string> {
    const messages = [
      new SystemMessage(HYDE_GENERATION_PROMPT),
      new HumanMessage(json2md.fromObject({
        bio: profile.identity.bio,
        interests: profile.attributes?.interests || [],
        aspirations: profile.narrative?.aspirations || ''
      }))
    ];

    // The model is configured with structured output
    const result = await this.model.invoke(messages) as any;

    // Handle potential wrapping of structured output
    if (result.structuredResponse) {
      return result.structuredResponse.description;
    }
    return result.description;
  }
}
