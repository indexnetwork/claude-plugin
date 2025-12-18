import { BaseLangChainAgent } from '../../../lib/langchain/langchain';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { UserMemoryProfile } from '../../intent/manager/intent.manager.types';
import {
    Opportunity,
    OpportunityFinderOptions,
    CandidateProfile
} from './opportunity.finder.types';
import { z } from 'zod';
import { json2md } from '../../../lib/json2md/json2md';
import { HydeGeneratorAgent } from '../generator/hyde/hyde.generator';

// --- SCHEMAS ---
const OpportunitySchema = z.object({
    type: z.enum(['collaboration', 'mentorship', 'networking', 'other']),
    title: z.string().describe('Short title of the opportunity'),
    description: z.string().describe('Reasoning why this is a good match'),
    score: z.number().min(0).max(100).describe('Relevance score 0-100'),
    candidateId: z.string().describe('The user ID of the match'),
});

const OpportunityFinderOutputSchema = z.object({
    opportunities: z.array(OpportunitySchema),
});

// ----------------

// System prompt for the Opportunity Finder Agent (Analysis Stage)
const ANALYSIS_SYSTEM_PROMPT = `
    You are an expert "Opportunity Matcher" and super-connector.
    Your Goal: Analyze a Source User's profile against a Candidate User's profile to identify HIGH-VALUE opportunities for collaboration, mentorship, or networking.

    Input:
    - Source Profile (JSON)
    - Candidate Profile (JSON)

    Output:
    - A list of distinct "Opportunities" (if any).
    - Score (0-100): How strong is this match?
    - 90-100: "Must Meet" (Perfect skill complementarity, exact shared goal).
    - 70-89: "Should Meet" (Strong shared interests, clear potential).
    - <70: No opportunity (Return empty list).

    Rules:
    1. Be specific. Don't say "Collaborate". Say "Collaborate on Rust-based DeFi tools" if both mention Rust and DeFi.
    2. Value Complementarity: Identify where one user's strength fills another's gap (Mentorship).
    3. Value Shared Goals: Identify where users are building similar things (Collaboration).
`;

export class OpportunityFinder extends BaseLangChainAgent {
    private hydeAgent: HydeGeneratorAgent;

    constructor() {
        // Main model is for Analysis (structured output of Opportunities)
        super({
            model: 'openai/gpt-4o',
            responseFormat: OpportunityFinderOutputSchema
        });

        this.hydeAgent = new HydeGeneratorAgent();
    }

    /**
     * Main entry point to analyze opportunities.
     * Takes pre-fetched candidates and analyzes them against the source profile.
     */
    async findOpportunities(
        sourceProfile: UserMemoryProfile,
        candidates: CandidateProfile[],
        options: OpportunityFinderOptions = {}
    ): Promise<Opportunity[]> {
        const minScore = options.minScore || 70;

        console.log(`Analyzing ${candidates.length} candidates for opportunities...`);

        if (candidates.length === 0) {
            console.log('No candidates provided.');
            return [];
        }

        const opportunities: Opportunity[] = [];

        // Analyze each candidate in parallel (bounded)
        const promises = candidates.map(async (candidate) => {
            return this.analyzeMatch(sourceProfile, candidate, candidate.userId);
        });

        const results = await Promise.all(promises);
        results.flat().forEach(op => {
            if (op.score >= minScore) {
                opportunities.push(op as Opportunity);
            }
        });

        // Sort by score
        return opportunities.sort((a, b) => b.score - a.score);
    }

    /**
     * Helper to generate a HyDE description.
     * Use this to create a search query for your vector database.
     */
    async generateHydeQuery(profile: UserMemoryProfile): Promise<string> {
        try {
            return await this.hydeAgent.generate(profile);
        } catch (e) {
            console.error("HyDE generation failed", e);
            return "";
        }
    }

    /**
     * Helper to generate a direct search query text.
     */
    generateDirectQuery(sourceProfile: UserMemoryProfile): string {
        return json2md.fromObject({
            Bio: sourceProfile.identity.bio,
            Interests: sourceProfile.attributes?.interests,
            Skills: sourceProfile.attributes?.skills,
            Aspirations: sourceProfile.narrative?.aspirations
        });
    }

    /**
     * Analyze a single match pair using the primary Agent model
     */
    private async analyzeMatch(
        sourceProfile: UserMemoryProfile,
        candidateProfile: CandidateProfile,
        candidateUserId: string
    ): Promise<Opportunity[]> {
        try {
            const messages = [
                new SystemMessage(ANALYSIS_SYSTEM_PROMPT),
                new HumanMessage(`SOURCE PROFILE:\n${json2md.fromObject(sourceProfile as any)}\n\nCANDIDATE PROFILE:\n${json2md.fromObject(candidateProfile as any)}`)
            ];

            // Primary model is already configured with OutputSchema
            const result = await this.model.invoke(messages) as any;

            // Handle potential variations in structured output return
            let opportunitiesList = [];
            if (result.opportunities) {
                opportunitiesList = result.opportunities;
            } else if (result.structuredResponse?.opportunities) {
                opportunitiesList = result.structuredResponse.opportunities;
            } else if (typeof result === 'object' && Array.isArray(result.opportunities)) {
                opportunitiesList = result.opportunities;
            }

            return opportunitiesList.map((op: Opportunity) => ({
                ...op,
                candidateId: candidateUserId
            }));
        } catch (e) {
            console.error(`Analysis failed for candidate ${candidateUserId}`, e);
            return [];
        }
    }
}
