import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { log } from "../../../../log";

/**
 * Config
 */
import { config } from "dotenv";
config({ path: '.env.development', override: true });

const model = new ChatOpenAI({
  model: 'google/gemini-2.5-flash',
  configuration: {
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY
  }
});

// ──────────────────────────────────────────────────────────────
// 1. SYSTEM PROMPT
// ──────────────────────────────────────────────────────────────

const systemPrompt = `
You are a Routing Agent for a professional networking platform.

**CRITICAL**: Your job is to route requests to the RIGHT ACTION NODE, not to answer questions yourself!

ANY request to VIEW/SHOW/DISPLAY user data MUST go to a _query route:
- "show my profile" → profile_query
- "show my profile in a table" → profile_query (formatting doesn't change routing!)
- "can you show me my profile" → profile_query  
- "display my profile" → profile_query
- "what's my profile" → profile_query
- "show my intents" → intent_query
- "list my goals" → intent_query
- "what are my intents" → intent_query

DON'T route to "respond" for data requests! The query nodes will:
1. Fetch the data
2. Format it however the user wants (table, list, etc.)
3. Display it properly

Your ONLY job: Identify that user wants data → route to correct _query node

**USE CONTEXT**: Look at conversation history. Don't ask for clarification when context is obvious:

- "Would you like me to add these skills?" → "Yes" = Execute it (profile_write)
- "Should I create this intent?" → "Sure" = Create it (intent_write)
- Failed to scrape URL X → "Try again" = Retry scraping URL X (scrape_web, extract URL from history)
- Did action X → "Try again" / "Retry" / "Do that again" = Repeat action X

**If user asks to retry/redo something and the previous action is obvious from history, just do it.**

### Examples with Context

## Key Patterns

**Confirmations**: "Would you like me to X?" → "Yes" = Do X with high confidence

**Retries**: "Try again" / "Retry" / "Do that again" → Look at conversation history, find what failed/was attempted, extract details (like URLs), and retry it

**New intents**: User expresses wants/needs → intent_write (create)

**Queries**: User asks "what are..." / "show me..." → _query routes

**For extractedContext**: Extract relevant details from current message OR conversation history if user is referring to something previous

## Read vs Write

**Query (read)**: User asks questions → Use *_query routes
**Write**: User declares/commands/expresses desires → Use *_write routes

Use common sense to determine intent.

## Routing Options

**IMPORTANT: Route to _query and _write targets even if you don't have the data yet - they will fetch it!**

1. **intent_query** - READ ONLY: Fetch and display existing intents
   - Use when: User asks questions/wants to see their intents
   - Examples: "show my intents", "what are my goals", "list my intentions"
   - operationType: "read"
   - NOTE: Use this even if you don't have intent data - it will fetch it!
   
2. **intent_write** - WRITE: Create, update, or delete intents
   - Use when: User expresses new goals, updates, or deletions
   - operationType: "create" | "update" | "delete"

3. **profile_query** - READ ONLY: Display profile information
   - Use when: User asks to see/view/display their profile (ANY format request!)
   - Examples: 
     * "show my profile"
     * "show my profile in a table"
     * "can you display my profile"
     * "what's my profile"
     * "view my info"
     * "show me my data"
   - operationType: "read"
   - NOTE: Use this route regardless of formatting (table/list/markdown) - it will handle it!
   - NOTE: Use this even if you don't have profile data - it will fetch it!

4. **profile_write** - WRITE: Update profile data
   - Use when: User wants to modify their profile
   - operationType: "update"

5. **opportunity_subgraph** - Discovery and matching
   - Use when: User wants recommendations or connections
   - No operationType needed

6. **scrape_web** - Extract content from URL
   - Use when: User provides a URL OR asks to retry a previous failed scrape
   - Extract URL from current message or conversation history
   - Pass the full URL in extractedContext

7. **respond** - Direct conversational response
   - Use when: General conversation, greetings, or questions ABOUT the system
   - Examples: "hello", "how does this work", "what can you do"
   - NEVER use for:
     * "show me X" → use query routes
     * "display X" → use query routes  
     * "what's my X" → use query routes
     * "can you show X" → use query routes
   - No operationType needed

8. **clarify** - Ambiguous or unclear
   - Use when: Cannot determine intent
   - No operationType needed

## Guidelines
- Set confidence based on clarity (0.0-1.0)
- Extract relevant details in extractedContext for write operations
- Trust your judgment - you're smart enough to understand user intent
`;

// ──────────────────────────────────────────────────────────────
// 2. RESPONSE SCHEMA (Zod)
// ──────────────────────────────────────────────────────────────

const routingResponseSchema = z.object({
  target: z.enum([
    "intent_query",           // NEW: Read-only intent queries
    "intent_write",           // NEW: Create/update/delete intents (replaces intent_subgraph)
    "intent_subgraph",        // DEPRECATED: Backward compatibility (maps to intent_write)
    "profile_query",          // NEW: Read-only profile queries
    "profile_write",          // NEW: Update profile (replaces profile_subgraph)
    "profile_subgraph",       // DEPRECATED: Backward compatibility (maps to profile_write)
    "opportunity_subgraph",
    "scrape_web",             // NEW: Extract content from URL
    "respond",
    "clarify"
  ]).describe("The routing target"),
  operationType: z.enum([
    "read",
    "create",
    "update",
    "delete"
  ]).nullable().describe("CRUD operation type for intent_* and profile_* routes. Required for intent_* and profile_* targets, null for others."),
  confidence: z.number().min(0).max(1).describe("Confidence in this routing decision (0.0-1.0)"),
  reasoning: z.string().describe("Brief explanation for this routing choice"),
  extractedContext: z.string().nullable().describe("Relevant context extracted from message for subgraph processing")
});

// ──────────────────────────────────────────────────────────────
// 3. TYPE DEFINITIONS
// ──────────────────────────────────────────────────────────────

export type RouterOutput = z.infer<typeof routingResponseSchema>;
export type RouteTarget = RouterOutput['target'];
export type OperationType = RouterOutput['operationType'];

// ──────────────────────────────────────────────────────────────
// 4. CLASS DEFINITION
// ──────────────────────────────────────────────────────────────

/**
 * RouterAgent analyzes user messages to determine the appropriate routing target.
 * It uses structured output to ensure consistent routing decisions.
 */
export class RouterAgent {
  private model: any;

  constructor() {
    this.model = model.withStructuredOutput(routingResponseSchema, {
      name: "router_agent"
    });
  }

  /**
   * Invokes the router agent to analyze a user message and determine routing.
   * @param userMessage - The user's message to analyze
   * @param profileContext - Formatted string of user profile for context
   * @param activeIntents - Formatted string of user's active intents
   * @param conversationHistory - Optional array of previous messages for context-aware routing
   * @returns RouterOutput with target, confidence, reasoning, and optional extracted context
   */
  public async invoke(
    userMessage: string,
    profileContext: string,
    activeIntents: string,
    conversationHistory?: BaseMessage[]
  ): Promise<RouterOutput> {
    log.info('[RouterAgent.invoke] Analyzing message...', {
      messagePreview: userMessage.substring(0, 50),
      hasConversationHistory: !!conversationHistory,
      historyLength: conversationHistory?.length || 0
    });

    // Build conversation context if available
    let conversationContextText = "";
    if (conversationHistory && conversationHistory.length > 0) {
      // Include last 5 messages for context (prioritize recent exchanges)
      const recentMessages = conversationHistory.slice(-5);
      conversationContextText = "\n# Recent Conversation History\n";
      recentMessages.forEach((msg, index) => {
        const role = msg._getType() === 'human' ? 'User' : 'Assistant';
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        conversationContextText += `${role}: ${content}\n`;
      });
    }

    const prompt = `
${conversationContextText}

**Current User Message**: ${userMessage}

${profileContext ? `\nUser Profile: ${profileContext}` : ''}
${activeIntents ? `\nActive Intents: ${activeIntents}` : ''}

Analyze the conversation and route appropriately.
    `.trim();

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt)
    ];
    
    try {
      const result = await this.model.invoke(messages);
      const output = routingResponseSchema.parse(result);
      
      log.info('[RouterAgent.invoke] Initial routing decision', {
        target: output.target,
        operationType: output.operationType,
        confidence: output.confidence
      });
      
      // PHASE 1: Apply safety rules to prevent accidental writes
      const safeOutput = this.applySafetyRules(output, userMessage);
      
      log.info('[RouterAgent.invoke] Final routing decision', {
        target: safeOutput.target,
        operationType: safeOutput.operationType,
        confidence: safeOutput.confidence,
        safetyRulesApplied: output.target !== safeOutput.target || output.operationType !== safeOutput.operationType
      });
      
      return safeOutput;
    } catch (error: unknown) {
      log.error('[RouterAgent.invoke] Error during routing', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Default to clarify on error
      return {
        target: "clarify",
        operationType: null,
        confidence: 0.0,
        reasoning: "Failed to process message, asking for clarification",
        extractedContext: null
      };
    }
  }

  /**
   * Detects if a message is a confirmation response (yes, no, etc.)
   * @param message - The user message to analyze
   * @returns true if confirmation detected
   */
  private isConfirmation(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    
    // Remove punctuation for matching
    const cleaned = lowerMessage.replace(/[.!?]+$/, '');
    
    // Short message check (confirmations are typically ≤10 words)
    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount > 10) {
      return false;
    }
    
    // Affirmative patterns
    const affirmativePatterns = [
      /^(yes|yeah|yep|yup|sure|okay|ok|alright|right|correct|exactly|absolutely|definitely|certainly)$/i,
      /^(that'?s? right|that'?s? correct|sounds good|go ahead|do it|please do|make it so)$/i,
      /^(yes please|yes do it|yes go ahead|sure thing|will do)$/i,
    ];
    
    // Negative patterns
    const negativePatterns = [
      /^(no|nope|nah|never|don'?t|cancel|stop|wait|hold on|not yet|negative)$/i,
      /^(no thanks|not now|maybe later|nevermind)$/i,
    ];
    
    return affirmativePatterns.some(p => p.test(cleaned)) || 
           negativePatterns.some(p => p.test(cleaned));
  }

  /**
   * Detects anaphoric references in user messages that suggest an update operation.
   * Anaphoric references include: "that intent", "this goal", "the RPG game", etc.
   * @param message - The user message to analyze
   * @returns true if anaphoric reference detected
   */
  private detectAnaphoricReference(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Demonstrative pronouns + intent/goal keywords
    const demonstrativePatterns = [
      /\b(that|this|these|those)\s+(intent|goal|objective|plan|project|idea)\b/i,
      /\b(the)\s+(intent|goal|objective|plan|project|idea)\b/i,
      /\bmake\s+(that|this|it|them)\b/i,
      /\b(change|update|modify|refine|add to|edit)\s+(that|this|it|them)\b/i,
      /\b(my|the)\s+(previous|last|first|current)\s+(intent|goal)\b/i
    ];
    
    // Check for demonstrative patterns
    const hasDemonstrativePattern = demonstrativePatterns.some(pattern =>
      pattern.test(lowerMessage)
    );
    
    // Modification verbs that often accompany anaphoric references
    const modificationVerbs = /\b(make|change|update|modify|refine|add|edit|adjust)\b/i;
    
    // Anaphoric pronouns (only count if combined with modification verbs)
    const anaphoricPronouns = /\b(it|that|this)\b/i;
    
    return hasDemonstrativePattern ||
           (modificationVerbs.test(lowerMessage) && anaphoricPronouns.test(lowerMessage));
  }

  /**
   * Applies safety rules to routing decisions.
   * Prevents accidental writes when intent is unclear.
   */
  private applySafetyRules(
    output: RouterOutput,
    userMessage: string
  ): RouterOutput {
    // Rule 0: Strong anaphoric reference with action verb → force intent_write update
    // This runs before other rules to catch cases where LLM misroutes anaphoric updates
    if (this.detectAnaphoricReference(userMessage)) {
      // Check if it's combined with an action/modification verb
      const actionVerbs = /\b(make|create|update|change|modify|set|add|remove|delete)\s+(that|this|it|the)\b/i;
      
      if (actionVerbs.test(userMessage)) {
        log.info('[RouterAgent] Strong anaphoric update signal detected, forcing intent_write update', {
          originalTarget: output.target,
          originalOperationType: output.operationType,
          messagePreview: userMessage.substring(0, 50)
        });
        
        return {
          ...output,
          target: 'intent_write',
          operationType: 'update',
          reasoning: `[ANAPHORIC OVERRIDE] Strong update signal detected: "${userMessage.substring(0, 50)}...". ${output.reasoning}`
        };
      }
    }
    
    // Rule 1: Map deprecated targets to new targets for backward compatibility
    if (output.target === 'intent_subgraph') {
      log.warn('[RouterAgent] Deprecated target used: intent_subgraph → intent_write', {
        confidence: output.confidence
      });
      output = {
        ...output,
        target: 'intent_write',
        operationType: output.operationType || 'create'
      };
    }
    
    if (output.target === 'profile_subgraph') {
      log.warn('[RouterAgent] Deprecated target used: profile_subgraph → profile_write', {
        confidence: output.confidence
      });
      output = {
        ...output,
        target: 'profile_write',
        operationType: output.operationType || 'update'
      };
    }
    
    // Rule 2: Only downgrade VERY low confidence writes (< 0.4) to reads
    // Trust the model more - it's smarter than our rules
    if (
      (output.target === 'intent_write' || output.target === 'profile_write') &&
      output.confidence < 0.4
    ) {
      log.warn('[RouterAgent] Very low confidence write operation, considering downgrade', {
        originalTarget: output.target,
        confidence: output.confidence,
        reasoning: output.reasoning
      });
      
      return {
        ...output,
        target: output.target.replace('_write', '_query') as RouteTarget,
        operationType: 'read',
        reasoning: `[SAFETY] Very low confidence (${output.confidence.toFixed(2)}). Original: ${output.reasoning}`
      };
    }
    
    // Rule 3: Write operation without operationType → infer from target or default to create
    if (
      (output.target === 'intent_write' || output.target === 'profile_write') &&
      !output.operationType
    ) {
      log.warn('[RouterAgent] Write operation missing operationType, defaulting to create', {
        target: output.target
      });
      return {
        ...output,
        operationType: 'create'
      };
    }
    
    // Rule 4: Query target with non-read operationType → ensure operationType is read
    if (
      (output.target === 'intent_query' || output.target === 'profile_query') &&
      output.operationType !== 'read'
    ) {
      log.warn('[RouterAgent] Query target with non-read operationType, correcting', {
        target: output.target,
        originalOperationType: output.operationType
      });
      return {
        ...output,
        operationType: 'read'
      };
    }
    
    // Rule 5: Anaphoric reference detection - upgrade create to update
    if (
      output.target === 'intent_write' &&
      output.operationType === 'create' &&
      this.detectAnaphoricReference(userMessage)
    ) {
      log.info('[RouterAgent] Anaphoric reference detected, upgrading create to update', {
        messagePreview: userMessage.substring(0, 50),
        originalOperationType: output.operationType
      });
      
      return {
        ...output,
        operationType: 'update',
        reasoning: `[ANAPHORIC] Reference to existing intent detected. ${output.reasoning}`
      };
    }
    
    return output;
  }
}
