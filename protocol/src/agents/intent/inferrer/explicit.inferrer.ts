import { createAgent, BaseLangChainAgent } from "../../../lib/langchain/langchain";
import { ActiveIntent, UserMemoryProfile } from "../manager/intent.manager.types";
import { IntentDetector, IntentDetectorResponse } from "./explicit.inferrer.types";
import { json2md } from "../../../lib/json2md/json2md";
import { z } from "zod";

/**
 * Model Configuration
 */
export const SYSTEM_PROMPT = `
  You are an expert Intent Manager. Your goal is to manage the lifecycle of user intents based on their profile and activity.

  You have access to:
  1. User Memory Profile (Identity, Narrative, Attributes) - The long-term context.
  2. Active Intents - What they are currently working on.
  3. New Content - What they just said/did (Optional).

  SCENARIO 1: NEW CONTENT PROVIDED
  - Analyze the New Content against the Profile and Active Intents.
  - CREATE new intents if the user expresses a clear need not covered by Active Intents.
  - UPDATE/EXPIRE existing intents based on the new info.

  SCENARIO 2: NO NEW CONTENT (BOOTSTRAPPING)
  - If "New Content" is empty or missing, you must bootstrap intents from the User Memory Profile.
  - Deeply analyze the "Narrative" (Context, Aspirations) and "Attributes" (Goals).
  - Extract implied objectives or explicit goals.
  - CREATE intents for these objectives if they are not already in "Active Intents".
  - Example: If Narrative says "Aspiring to learn Rust", and "Learn Rust" is not active, CREATE it.

  DEDUPLICATION RULES (CRITICAL):
  - Before CREATING a new intent, you MUST check the "Active Intents" list.
  - If a similar intent exists, do NOT create a duplicate. Instead:
    - If the new content adds detail, UPDATE the existing intent.
    - If the new content is just a restatement, IGNORE it.
    - If the new content contradicts or completes it, EXPIRE it.

  General Rules:
  - Be precise.
  - "Create" payloads should be self-contained and clear.
  - "Update" payloads should replace the old intent description with the new, refined one.
  - "Expire" reasons should be brief.
`;

/**
 * Output Schemas
 */
export const CreateIntentActionSchema = z.object({
  type: z.literal("create"),
  payload: z.string().describe("The new intent description")
});

export const UpdateIntentActionSchema = z.object({
  type: z.literal("update"),
  id: z.string().describe("The ID of the intent to update"),
  payload: z.string().describe("The updated intent description")
});

export const ExpireIntentActionSchema = z.object({
  type: z.literal("expire"),
  id: z.string().describe("The ID of the intent to expire"),
  reason: z.string().describe("Why it is expired")
});

export const IntentActionSchema = z.discriminatedUnion("type", [
  CreateIntentActionSchema,
  UpdateIntentActionSchema,
  ExpireIntentActionSchema
]);

export const ExplicitInferrerOutputSchema = z.object({
  actions: z.array(IntentActionSchema).describe("List of actions to apply to the intent state")
});

export type ExplicitInferrerOutput = z.infer<typeof ExplicitInferrerOutputSchema>;

export class ExplicitIntentDetector extends BaseLangChainAgent {
  constructor() {
    super({
      preset: 'intent-inferrer',
      responseFormat: ExplicitInferrerOutputSchema,
      temperature: 0.5,
    });
  }

  /**
   * Evaluates new content against the user's profile and active intents to determine
   * if any intent actions (Create, Update, Expire) are needed.
   *
   * @param content - The new user input or context string.
   * @param profile - The user's long-term memory profile.
   * @param activeIntents - List of currently active intents.
   * @returns A Promise resolving to an object containing a list of actions.
   *
   * @example
   * // Input
   * const content = "I want to learn Rust";
   * const profile = { identity: { name: "User" }, ... };
   * const activeIntents = [];
   *
   * // Output
   * // {
   * //   actions: [
   * //     { type: "create", payload: "Learn Rust" }
   * //   ]
   * // }
   */
  async run(content: string | null, profile: UserMemoryProfile, activeIntents: ActiveIntent[]): Promise<IntentDetectorResponse> {

    console.debug('Profile: ', profile);

    const prompt = `
      Context:
      # User Memory Profile
      ${this.formatProfile(profile)}

      ## Active Intents
      ${this.formatActiveIntents(activeIntents)}

      ## New Content
      ${content ? content : '(None. Please infer intents from Profile Narrative and Aspirations)'}
    `;

    console.debug('Prompt: ', prompt);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ];

    try {
      // Invoke pre-initialized agent
      const result = await this.model.invoke({ messages });
      // Return structured response directly
      return result.structuredResponse as IntentDetectorResponse;
    } catch (error) {
      console.error("Error in ExplicitIntentDetector", error);
      // Fallback: return empty actions if LLM fails
      return { actions: [] };
    }
  }

  private formatProfile(profile: UserMemoryProfile): string {
    const { identity, attributes, narrative } = profile;

    let md = '';

    // Identity Section
    md += '## Identity\n';
    md += `**Name**: ${identity.name}\n`;
    md += `**Bio**: ${identity.bio}\n`;
    md += `**Location**: ${identity.location}\n\n`;

    // Narrative Section
    if (narrative) {
      md += '## Narrative\n';
      md += `**Context**: ${narrative.context}\n`;
      md += `**Aspirations**: ${narrative.aspirations}\n\n`;
    }

    // Attributes Section
    md += '## Attributes\n';
    if (attributes.interests && attributes.interests.length > 0) {
      md += `**Interests**:\n${attributes.interests.map(i => `- ${i}`).join('\n')}\n`;
    }
    if (attributes.skills && attributes.skills.length > 0) {
      md += `**Skills**:\n${attributes.skills.map(s => `- ${s}`).join('\n')}\n`;
    }
    if (attributes.goals && attributes.goals.length > 0) {
      md += `**Goals**:\n${attributes.goals.map(g => `- ${g}`).join('\n')}\n`;
    } else {
      md += `**Goals**:\n(None)\n`;
    }

    return md;
  }

  /**
   * Formats active intents into a markdown table for the LLM prompt.
   *
   * @param intents - List of active intents.
   * @returns A markdown table string or "No active intents."
   *
   * @example
   * // Input
   * const intents = [{ id: "1", description: "Learn Rust", status: "active", created_at: 123456 }];
   *
   * // Output
   * // | ID | Description | Status | Created |
   * // | -- | ----------- | ------ | ------- |
   * // | 1  | Learn Rust  | active | 2024... |
   */
  private formatActiveIntents(intents: ActiveIntent[]): string {
    if (intents.length === 0) {
      return "No active intents.";
    }

    // Format data for the table
    const tableData = intents.map(intent => ({
      id: intent.id,
      description: intent.description,
      status: intent.status,
      created: new Date(intent.created_at).toISOString().split('T')[0]
    }));

    return json2md.table(tableData, {
      columns: [
        { header: "ID", key: "id" },
        { header: "Description", key: "description" },
        { header: "Status", key: "status" },
        { header: "Created", key: "created" }
      ]
    });
  }
}
