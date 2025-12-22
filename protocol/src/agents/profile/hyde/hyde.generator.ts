import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { UserMemoryProfile } from '../../intent/manager/intent.manager.types';
import { z } from 'zod';
import { json2md } from '../../../lib/json2md/json2md';
import { BaseLangChainAgent } from '../../../lib/langchain/langchain';
import { log } from '../../../lib/log';

// System prompt for HyDE Generation
const HYDE_GENERATION_PROMPT = `
    You are a Profile Profiler.
    Given a user's profile, imagine a **Hypothetical User Profile** person that would be the best match for the user to accomplish their aspirations.
    
    Imagine this ideal candidate actually exists. Write a profile for THEM.
    Your output will be used to vector-search a database of real user profiles.

    Structure your response as a natural language Bio/Narrative written in the **Third Person**.
    
    The description should include:
    1. **Context**: Who they are (role, background).
    2. **Skills/lnterests**: What they are good at that complements the user.
    3. **Goals**: What they are trying to achieve that aligns with the user.
    
    Do NOT describe the Source User. Describe the TARGET Match.
    Do NOT invent a name for the candidate. Refer to them as "The candidate", "They", or "This individual".
    Do NOT include locations.
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
      temperature: 0.5,
      responseFormat: HydeDescriptionSchema
    });
  }

  async generate(profile: UserMemoryProfile): Promise<string> {
    const messages = [
      new SystemMessage(HYDE_GENERATION_PROMPT),
      new HumanMessage(json2md.fromObject({
        bio: profile.identity.bio,
        location: profile.identity.location,
        interests: profile.attributes?.interests || [],
        aspirations: profile.narrative?.aspirations || '',
        context: profile.narrative?.context || ''
      }))
    ];

    log.info(`[HydeGenerator] Generating HyDE profile for user...`);

    try {
      // The model is configured with structured output
      const result = await this.model.invoke(messages) as any;

      // Handle potential wrapping of structured output
      let description = "";
      if (result.structuredResponse) {
        description = result.structuredResponse.description;
      } else {
        description = result.description;
      }

      log.info(`[HydeGenerator] Successfully generated HyDE profile.`);
      return description;

    } catch (error) {
      log.error("[HydeGenerator] Error generating HyDE profile", { error });
      throw error;
    }
  }
}
