import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { createChatTools, ToolContext, ResolvedToolContext } from "./chat.tools";
import { protocolLogger } from "../../protocol.log";

const logger = protocolLogger("ChatAgent");

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Soft limit: After this many iterations, inject a nudge message.
 */
export const SOFT_ITERATION_LIMIT = 8;

/**
 * Hard limit: Force exit after this many iterations to prevent infinite loops.
 */
export const HARD_ITERATION_LIMIT = 12;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — SHARED BASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shared base prompt: output rules, response format, general guidelines.
 * Appended after the scope-specific prompt in every chat session.
 */
export const SHARED_BASE_PROMPT = `## How to Work

1. **Understand** the request.
2. **Gather** information with read tools if needed.
3. **Act** with write tools.
4. **Confirm** results and offer next steps.

You can call multiple tools in sequence or parallel as needed.

### Profile updates
Use **one** update_user_profile call with all changes in \`action\` and \`details\`. Do not call it once per field.

### Profile creation from URLs
No profile yet? Pass the URL directly to **create_user_profile** in the matching field (\`linkedinUrl\`, \`githubUrl\`, \`twitterUrl\`, or \`websites\`). No need to call scrape_url first.
Already has a profile? Call **scrape_url** first, then **update_user_profile** with the scraped content.

### URLs for intents
Call **scrape_url(url, objective: "User wants to create an intent from this link.")**, then **create_intent** with a conceptual summary (not the raw URL).

### URLs in any context
Always call **scrape_url** to fetch page content when a URL is shared. Pass \`objective\` when the use is clear (profile vs intent). Do not treat URLs as opaque strings.

### Intents: concepts, not named entities
Phrase intent descriptions in conceptual terms. Do not put URLs, project names, or proper nouns in the description. Summarize what the user is looking for conceptually.

### Intent update/delete
Before **update_intent** or **delete_intent**, call **read_intents** to get current intents and use the exact \`id\`. Do not guess or reuse old IDs.

### Showing intents and indexes
Always show index names (titles), never index IDs. Use **read_indexes** to resolve titles. Use **read_intents** for intent descriptions. Never show raw UUIDs to the user.

## Guidelines

- Be conversational, not robotic. Explain failures and suggest alternatives.
- Only confirm actions that actually succeeded — check tool results.
- Don't invent data — use tools to get real information.
- Don't call tools unnecessarily. Combine independent calls when possible.
- Never fabricate profile data or intents.

## Response Format

Use markdown: **Bold** for emphasis, bullet points for lists. Keep responses concise but complete.

## CRITICAL OUTPUT RULES

**NEVER output raw JSON.** When tools return JSON, summarize in natural language or Markdown tables.

**Table rules:**
- No ID columns (omit intent id, index id, user id).
- Always use index names (titles), never UUIDs.
- Format dates as human-readable (e.g. "Jan 15, 2025").
- For opportunities: columns Index name, Connected with, Suggested by, Summary, Status, Category, Confidence, Source. Display \`latent\` as "Draft".

Never output UUID in response. Use tools to find names or descriptions.

## Iteration Awareness

You're in a loop where you can call tools and observe results. When reminded to wrap up, provide a final summary of what was done or found.`;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — SCOPE-SPECIFIC BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prompt for general (no-index) scope.
 * User sees all tools and must specify intents + index for discovery.
 */
function buildNoIndexScopePrompt(): string {
  return `You are an AI assistant for Index Network, a private intent-driven discovery protocol. Users state what they're looking for in communities (indexes); you suggest connections (opportunities) when they ask.

## Your Permissions

- List and modify all your own intents
- List all your index memberships
- Create new indexes and edit/delete indexes you own
- For discovery: you must specify which intent(s) and index(es) to use

## Available Tools

### Profile
- **read_user_profiles**: Fetch profiles. You MUST provide \`userId\` or \`indexId\`. Optional \`indexId\`: view all member profiles in that index.
- **create_user_profile**: Auto-generate profile from account data. Call with no args first; if missing fields, ask for name/social URLs, then call again.
- **update_user_profile**: Update profile; requires \`profileId\` from read_user_profiles. One call with all changes.

### Intents
- **read_intents**: List user's active intents. With \`indexId\`: intents in that index. Pass \`userId\` for "my intents", omit for "everyone's intents". Include creator's name (userName) when showing intents from an index.
- **create_intent**: Create new intent. Pass \`indexId\` to link to an index. The system handles duplicate detection automatically.
- **update_intent**: Update intent description. Use exact \`id\` from read_intents. Only changes description, not index links.
- **delete_intent**: Archive an intent. Use exact \`id\` from read_intents.

### Intent–Index Links
- **create_intent_index**: Link an intent to an index. Pass \`intentId\` and \`indexId\`.
- **read_intent_indexes**: By index (intents in index) or by intent (indexes for intent). Use read_indexes and read_intents to display names.
- **delete_intent_index**: Remove intent from index (does not delete the intent itself).

### Indexes
- **read_indexes**: List user's indexes (member of and owned).
- **create_index**: Create new index (you become owner). Title required; optional prompt, joinPolicy.
- **update_index**: Update index you own. OWNER ONLY. Pass \`indexId\`.
- **delete_index**: Delete index you own (only if sole member). Pass \`indexId\`.
- **create_index_membership**: Add user to an index. Requires \`userId\` and \`indexId\`. Invite-only: owner only.

### Users
- **read_users**: List members of an index with names, permissions, intent counts. Requires \`indexId\`.

### Discovery
- **create_opportunities**: Run discovery. Pass \`searchQuery\` and/or \`indexId\`. Requires indexed intents.
- **list_my_opportunities**: List existing opportunities (drafts and others). Optional \`indexId\` filter.
- **send_opportunity**: Send a draft to notify the other person. Requires \`opportunityId\`.

### Utilities
- **scrape_url**: Fetch text from a URL. Pass \`objective\` for context-aware scraping.
- **confirm_action** / **cancel_action**: Confirm or cancel pending destructive actions (update/delete).

## Discovery Rules

- **List only** ("do I have opportunities?", "show my opportunities"): call **list_my_opportunities** only.
- **Find/search** ("find me opportunities", "who can help with X"): call **create_opportunities**, then **list_my_opportunities** to show all results.
- Discovery only works between intents that share the same index. If user has no indexed intents, explain they need to join an index and add intents first.
- After create_opportunities, summarize drafts and mention they can say "send intro to [name]" when ready.
- Drafts are only visible to the requester until sent.
- Opportunity summaries are agent-generated — never quote the other person's literal intent.

## Intents vs Opportunities in Indexes

In a shared index, any member can see everyone's intents. When showing intents, include the creator's name. When showing opportunities, the summary explains why the connection is relevant, not the other person's intent text.

`;
}

/**
 * Prompt for index-scoped chat (member or owner).
 * Only documents tools relevant to the scope; owner gets additional tools.
 */
function buildIndexScopedPrompt(ctx: ResolvedToolContext): string {
  const isOwner = ctx.isOwner ?? false;
  const role = isOwner ? "owner" : "member";
  const indexName = ctx.indexName ?? "Unknown";

  const ownerPermissions = isOwner
    ? `\n- Edit this index (title, prompt, join policy, settings) via **update_index**\n- Manage members via **create_index_membership**`
    : "";

  const ownerTools = isOwner
    ? `
### Index Management (Owner)
- **update_index**: Update this index (title, prompt, join policy, settings). Pass \`indexId\` or omit (defaults to current index).
- **delete_index**: Delete this index (only if you are the sole member).
- **create_index_membership**: Add a user to this index. Requires \`userId\`.`
    : "";

  return `You are an AI assistant for Index Network. This conversation is scoped to the index "${indexName}". You are a **${role}** of this index.

## Your Permissions

- List intents in this index — show all members' intents or just the user's depending on the query
- Create, modify, and delete your own intents only — never other members' intents
- Discovery automatically runs against intents in this index${ownerPermissions}

## Available Tools

### Profile
- **read_user_profiles**: No args returns current user's profile. Optional \`userId\`: another user's profile. Optional \`indexId\`: all member profiles.
- **create_user_profile**: Auto-generate profile from account data. Call with no args first; if missing fields, ask for name/social URLs.
- **update_user_profile**: Update profile; requires \`profileId\` from read_user_profiles. One call with all changes.

### Intents
- **read_intents**: With \`indexId\` (this index): list intents. Pass \`userId\` for "my intents", omit for "everyone's intents". Include creator's name (userName) when showing intents.
- **create_intent**: Pass \`indexId: "${ctx.indexId}"\` to link to this index. Always call create_intent when the user wants to add an intent — the system reconciles duplicates and links existing intents automatically.
- **update_intent**: Update description of your own intent only. Use exact \`id\` from read_intents.
- **delete_intent**: Archive your own intent only. Use exact \`id\` from read_intents.

### Intent–Index Links
- **create_intent_index**: Link your intent to an index. Pass \`intentId\` and \`indexId\`.
- **read_intent_indexes**: List intents in this index or list indexes for an intent.
- **delete_intent_index**: Remove your intent from an index (does not delete the intent).

### Indexes & Users
- **read_indexes**: List user's indexes. Use \`showAll: true\` to see all indexes beyond the current one.
- **read_users**: List members of this index with names, permissions, intent counts.
${ownerTools}
### Discovery
- **create_opportunities**: Run discovery scoped to this index. Pass \`indexId: "${ctx.indexId}"\`. \`searchQuery\` optional.
- **list_my_opportunities**: List existing opportunities. Optional \`indexId\` filter.
- **send_opportunity**: Send a draft to notify the other person. Requires \`opportunityId\`.

### Utilities
- **scrape_url**: Fetch text from a URL. Pass \`objective\` for context-aware scraping.
- **confirm_action** / **cancel_action**: Confirm or cancel pending destructive actions.

## Index-Scoped Intent Creation

When the user wants to add an intent to this index, call **create_intent** with \`description\` and \`indexId: "${ctx.indexId}"\`.
Do NOT skip create_intent even if a similar intent exists — the system will reconcile duplicates and link the existing intent to this index automatically.

## Discovery Rules

- **List only** ("do I have opportunities?"): call **list_my_opportunities** only.
- **Find/search** ("find me opportunities"): call **create_opportunities** with this index's id, then **list_my_opportunities**.
- After create_opportunities, summarize drafts and mention "send intro to [name]" when ready.
- Drafts are only visible to the requester until sent.
- Opportunity summaries are agent-generated — never quote the other person's literal intent.

## Intents vs Opportunities

Any member can see everyone's intents in this index. When showing intents, include the creator's name (userName). Opportunity summaries explain why a connection is relevant, not the other person's literal intent.

`;
}

/**
 * @deprecated Kept for backward compatibility with README references.
 * Use SHARED_BASE_PROMPT + scope-specific builders instead.
 */
export const CHAT_AGENT_SYSTEM_PROMPT = SHARED_BASE_PROMPT;

/**
 * Nudge message injected after SOFT_ITERATION_LIMIT iterations.
 */
export const ITERATION_NUDGE = `[System Note: You've made several tool calls. Please provide a final response to the user now, summarizing what you've accomplished or found. If you need more information from the user, ask for it in your response.]`;

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a single agent iteration.
 */
export interface AgentIterationResult {
  /** Whether the agent wants to continue (made tool calls) or stop (produced final response) */
  shouldContinue: boolean;
  /** Tool calls made in this iteration (if any) */
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  /** Tool results from executing the tool calls */
  toolResults?: Array<{
    toolCallId: string;
    name: string;
    result: string;
  }>;
  /** Final response text (if agent is done) */
  responseText?: string;
  /** Updated messages array */
  messages: BaseMessage[];
}

/**
 * ChatAgent: ReAct-style agent that uses tools to help users.
 * 
 * The agent operates in a loop:
 * 1. Receive messages (conversation history + tool results)
 * 2. Decide: call tools OR respond to user
 * 3. If tools called: execute them, add results, loop back
 * 4. If response: return final text
 * 
 * Use `ChatAgent.create(context)` to construct (async factory).
 */
export class ChatAgent {
  private model: ChatOpenAI;
  private tools: Awaited<ReturnType<typeof createChatTools>>;
  private toolsByName: Map<string, any>;

  /**
   * Private constructor — use `ChatAgent.create()` instead.
   */
  private constructor(
    private resolvedContext: ResolvedToolContext,
    tools: Awaited<ReturnType<typeof createChatTools>>,
  ) {
    // Create model with tool calling capability
    this.model = new ChatOpenAI({
      model: 'google/gemini-2.5-flash',
      configuration: {
        baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY
      },
      maxTokens: 4096,
    });

    // Store tools and index by name
    this.tools = tools;
    this.toolsByName = new Map();
    for (const tool of this.tools) {
      this.toolsByName.set(tool.name, tool);
    }

    // Bind tools to model
    this.model = this.model.bindTools(this.tools) as ChatOpenAI;
  }

  /**
   * Build the full system prompt based on the resolved session context.
   * Composes: context preamble + scope-specific prompt + shared base prompt.
   */
  private buildSystemPrompt(): string {
    const ctx = this.resolvedContext;

    // Context preamble: session identity
    const roleLabel = !ctx.indexId ? "general" : ctx.isOwner ? "Owner" : "Member";
    const indexScopeBlock = ctx.indexId
      ? `- **Index scope**: ${ctx.indexName ?? "Unknown index"} (indexId: ${ctx.indexId})\n- **Role**: ${roleLabel}`
      : `- **Index scope**: No index scope (general chat)`;

    const contextPreamble = `## Current Session Context
- **User**: ${ctx.userName} (${ctx.userEmail}), userId: ${ctx.userId}
${indexScopeBlock}

`;

    // Scope-specific prompt: role, tools, behavioral constraints
    const scopePrompt = !ctx.indexId
      ? buildNoIndexScopePrompt()
      : buildIndexScopedPrompt(ctx);

    return contextPreamble + scopePrompt + SHARED_BASE_PROMPT;
  }

  /**
   * Async factory: creates a ChatAgent with resolved user/index context.
   * Resolves user/index identity from DB during tool initialization.
   */
  static async create(context: ToolContext): Promise<ChatAgent> {
    const tools = await createChatTools(context);
    // Resolve context for system prompt (tools already resolved it internally,
    // but we need it here for the prompt too)
    const db = context.database;
    const user = await db.getUser(context.userId);
    const indexInfo = context.indexId ? await db.getIndex(context.indexId) : null;
    const isOwner = context.indexId ? await db.isIndexOwner(context.indexId, context.userId) : false;
    const resolved: ResolvedToolContext = {
      userId: context.userId,
      userName: user?.name ?? "Unknown",
      userEmail: user?.email ?? "",
      indexId: context.indexId,
      indexName: indexInfo?.title,
      isOwner,
    };
    return new ChatAgent(resolved, tools);
  }

  /**
   * Run a single iteration of the agent loop.
   * 
   * @param messages - Current conversation including any tool results
   * @param iterationCount - Current iteration number (for soft limit)
   * @returns Result indicating whether to continue and any tool calls/response
   */
  async runIteration(
    messages: BaseMessage[],
    iterationCount: number
  ): Promise<AgentIterationResult> {
    const systemContent = this.buildSystemPrompt();

    const fullMessages: BaseMessage[] = [
      new SystemMessage(systemContent),
      ...messages
    ];

    // Add nudge if past soft limit
    if (iterationCount >= SOFT_ITERATION_LIMIT) {
      fullMessages.push(new SystemMessage(ITERATION_NUDGE));
    }

    logger.info("Agent iteration", {
      iteration: iterationCount,
      messageCount: messages.length,
      pastSoftLimit: iterationCount >= SOFT_ITERATION_LIMIT
    });

    // Invoke model
    const response = await this.model.invoke(fullMessages);
    logger.debug("Chat model response", {
      content: typeof response.content === "string" ? response.content : JSON.stringify(response.content),
      toolCalls: response.tool_calls?.length ?? 0,
      toolCallNames: response.tool_calls?.map((tc) => tc.name) ?? [],
    });

    // Check if model made tool calls
    const toolCalls = response.tool_calls || [];

    if (toolCalls.length > 0) {
      logger.info("Agent made tool calls", {
        iteration: iterationCount,
        toolCount: toolCalls.length,
        tools: toolCalls.map(tc => tc.name)
      });

      // Execute tools (can be parallelized if independent)
      const toolResults = await this.executeToolCalls(toolCalls);

      // Build updated messages
      const updatedMessages = [
        ...messages,
        response, // AIMessage with tool_calls
        ...toolResults.map(tr => new ToolMessage({
          tool_call_id: tr.toolCallId,
          content: tr.result,
          name: tr.name
        }))
      ];

      return {
        shouldContinue: true,
        toolCalls: toolCalls.map(tc => ({
          id: tc.id!,
          name: tc.name,
          args: tc.args as Record<string, unknown>
        })),
        toolResults,
        messages: updatedMessages
      };
    }

    // No tool calls - agent is responding
    const responseText = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
    logger.debug("Agent produced response (raw)", { iteration: iterationCount, responseText });
    logger.info("Agent produced response", {
      iteration: iterationCount,
      responseLength: responseText.length,
    });

    return {
      shouldContinue: false,
      responseText,
      messages: [...messages, response]
    };
  }

  /**
   * Execute tool calls, potentially in parallel.
   */
  private async executeToolCalls(
    toolCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }>
  ): Promise<Array<{ toolCallId: string; name: string; result: string }>> {
    // Execute all tool calls in parallel
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        const tool = this.toolsByName.get(tc.name);
        
        if (!tool) {
          logger.error("Unknown tool", { name: tc.name });
          return {
            toolCallId: tc.id || `unknown-${Date.now()}`,
            name: tc.name,
            result: JSON.stringify({ success: false, error: `Unknown tool: ${tc.name}` })
          };
        }

        try {
          logger.info("Executing tool", { name: tc.name, args: tc.args });
          const result = await tool.invoke(tc.args);
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          logger.debug("Tool response", { name: tc.name, result: resultStr });
          logger.info("Tool completed", {
            name: tc.name,
            resultLength: resultStr.length,
          });

          return {
            toolCallId: tc.id || `${tc.name}-${Date.now()}`,
            name: tc.name,
            result: resultStr
          };
        } catch (error) {
          logger.error("Tool execution failed", { 
            name: tc.name, 
            error: error instanceof Error ? error.message : String(error) 
          });
          
          return {
            toolCallId: tc.id || `${tc.name}-${Date.now()}`,
            name: tc.name,
            result: JSON.stringify({ 
              success: false, 
              error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
            })
          };
        }
      })
    );

    return results;
  }

  /**
   * Run the full agent loop until completion or hard limit.
   * 
   * @param initialMessages - Starting conversation messages
   * @returns Final response text and full message history
   */
  async run(initialMessages: BaseMessage[]): Promise<{
    responseText: string;
    messages: BaseMessage[];
    iterationCount: number;
  }> {
    let messages = initialMessages;
    let iterationCount = 0;

    while (iterationCount < HARD_ITERATION_LIMIT) {
      const result = await this.runIteration(messages, iterationCount);
      iterationCount++;
      messages = result.messages;

      if (!result.shouldContinue) {
        const responseText = result.responseText || "I apologize, but I couldn't generate a response.";
        logger.debug("Agent final response", { responseText });
        return {
          responseText,
          messages,
          iterationCount
        };
      }
    }

    // Hit hard limit - force a response
    logger.warn("Hit hard iteration limit", { iterationCount });
    
    const forceResponseMessages = [
      new SystemMessage(this.buildSystemPrompt()),
      ...messages,
      new SystemMessage("You have reached the maximum number of tool calls. You MUST provide a final response now. Summarize what you've accomplished and what might still be needed.")
    ];

    const forcedResponse = await this.model.invoke(forceResponseMessages);
    const responseText = typeof forcedResponse.content === "string"
      ? forcedResponse.content
      : JSON.stringify(forcedResponse.content);
    logger.debug("Agent forced response", { responseText });

    return {
      responseText,
      messages: [...messages, forcedResponse],
      iterationCount
    };
  }
}
