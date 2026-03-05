import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { createUserSession } from '../lib/composio/composio';
import { log } from '../lib/log';
import { contactService } from '../services/contact.service';
import type { ContactSource } from '../schemas/database.schema';

const logger = log.lib.from('integration');

const COMPOSIO_SYSTEM_PROMPT = `You are an integration assistant with Composio meta-tools.

WORKFLOW:
1. COMPOSIO_SEARCH_TOOLS - find tools for the task
2. Check "connection_status" - if NOT connected, use COMPOSIO_MANAGE_CONNECTIONS for auth link
3. COMPOSIO_MULTI_EXECUTE_TOOL - execute the integration
4. For bulk data: use COMPOSIO_REMOTE_WORKBENCH to process and upload

CRITICAL:
- ONLY use parameters defined in each tool's schema
- Meta tools share context via session_id

BULK DATA EXPORT:
After COMPOSIO_MULTI_EXECUTE_TOOL returns data, use COMPOSIO_REMOTE_WORKBENCH to:
1. Inspect the data_preview to understand the schema
2. Write Python to extract contacts (name + email) based on the actual structure
3. Save to JSON: {"contacts": [{"name": "...", "email": "..."}], "source": "<toolkit>", "count": N}
4. Upload and print the URL

Example workbench code pattern:
\`\`\`
import json
# Extract based on actual schema from data_preview
contacts = [{"name": item.get("..."), "email": item.get("...")} for item in data if item.get("...")]
with open('export.json', 'w') as f:
    json.dump({"contacts": contacts, "source": "<toolkit_name>", "count": len(contacts)}, f)
url = upload_local_file('export.json')
print(f"IMPORT_URL:{url}")
\`\`\`

Your final response MUST include: IMPORT_URL:https://...`;

// Matches IMPORT_URL with optional markdown formatting
const IMPORT_URL_PATTERN = /\*{0,2}IMPORT_URL:?\*{0,2}\s*(?:\[)?(https?:\/\/[^\s\]\)]+)/;

/**
 * Fully dynamic integration adapter using Composio + LangGraph.
 * Uses Composio's native in-chat authentication via COMPOSIO_MANAGE_CONNECTIONS meta-tool.
 * When a tool requires auth, the meta-tool returns a Connect Link URL for the user.
 */
export class IntegrationAdapter {
  /**
   * Execute a dynamic task using user's connected integrations.
   * If user lacks required connections, returns a connect URL for them to authenticate.
   * For bulk data (contacts, etc.), the workbench uploads a JSON file and we import server-side.
   * @param userId - User ID for Composio session
   * @param prompt - Natural language instruction
   * @returns Result string (import summary, auth URL, or raw response)
   */
  async execute(userId: string, prompt: string): Promise<string> {
    const session = await createUserSession(userId);
    const tools = await session.tools();

    logger.info('Executing integration task', {
      userId,
      toolCount: tools.length,
      promptPreview: prompt.slice(0, 80),
    });

    if (!tools.length) {
      logger.warn('No Composio tools available (check COMPOSIO_API_KEY)', { userId });
      return JSON.stringify({ 
        error: 'Integration service unavailable', 
        message: 'No integration tools are configured. Please check your Composio setup.',
      });
    }

    const toolNode = new ToolNode(tools);
    const model = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      configuration: {
        baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
      },
    }).bindTools(tools);

    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const last = state.messages[state.messages.length - 1] as AIMessage;
      return last.tool_calls?.length ? 'tools' : '__end__';
    };

    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', async (state) => {
        logger.info('Agent node invoked', { messageCount: state.messages.length });
        try {
          const response = await model.invoke(state.messages);
          logger.info('Agent response', { 
            hasToolCalls: !!(response as AIMessage).tool_calls?.length,
            toolCalls: (response as AIMessage).tool_calls?.map(tc => tc.name),
          });
          return { messages: [response] };
        } catch (err) {
          logger.error('Agent node error', { error: err instanceof Error ? err.message : String(err) });
          throw err;
        }
      })
      .addNode('tools', async (state) => {
        logger.info('Tools node invoked');
        try {
          const result = await toolNode.invoke(state);
          logger.info('Tools node result', { 
            messageCount: result.messages?.length,
            lastContent: result.messages?.[result.messages.length - 1]?.content?.slice?.(0, 200),
          });
          return result;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error('Tools node error', { error: errMsg });
          // Return error as a message so the agent can retry with correct params
          return { 
            messages: [new HumanMessage(`Error: ${errMsg}\n\n✖ Please fix your mistakes and try again with only the parameters defined in the tool schema.`)] 
          };
        }
      })
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', shouldContinue)
      .addEdge('tools', 'agent')
      .compile();

    try {
      const result = await graph.invoke({
        messages: [new SystemMessage(COMPOSIO_SYSTEM_PROMPT), new HumanMessage(prompt)],
      });

      const lastMessage = result.messages?.[result.messages.length - 1];
      const content =
        typeof lastMessage?.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage?.content || '');

      logger.info('Integration task completed', { userId, rawResult: content.slice(0, 500) });

      // Check for IMPORT_URL pattern and process bulk import
      const importMatch = content.match(IMPORT_URL_PATTERN);
      if (importMatch) {
        const importUrl = importMatch[1];
        logger.info('Detected import URL, fetching contacts', { userId, importUrl });
        
        try {
          const importResult = await this.processImportUrl(userId, importUrl);
          return importResult;
        } catch (importErr) {
          logger.error('Import from URL failed', { 
            userId, 
            importUrl,
            error: importErr instanceof Error ? importErr.message : String(importErr),
          });
        }
      }

      return content;
    } catch (err) {
      logger.error('Graph execution failed', { 
        userId, 
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return JSON.stringify({
        error: 'Integration execution failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Fetch contacts from uploaded JSON file and import them.
   */
  private async processImportUrl(userId: string, url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch import file: ${response.status}`);
    }

    const data = await response.json() as { 
      contacts: Array<{ name: string; email: string }>; 
      source: string; 
      count: number;
    };

    logger.info('Fetched import data', { 
      userId, 
      contactCount: data.contacts?.length,
      source: data.source,
    });

    if (!data.contacts?.length) {
      return JSON.stringify({ message: 'No contacts found to import', imported: 0 });
    }

    const result = await contactService.importContacts(
      userId,
      data.contacts,
      data.source as ContactSource
    );

    logger.info('Bulk import completed', { 
      userId, 
      imported: result.imported,
      skipped: result.skipped,
      newGhosts: result.newGhosts,
    });

    return JSON.stringify({
      message: `Imported ${result.imported} contacts from ${data.source}`,
      imported: result.imported,
      skipped: result.skipped,
      newGhosts: result.newGhosts,
      source: data.source,
    });
  }
}
