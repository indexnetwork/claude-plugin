/**
 * Conversation command handlers for the Index CLI.
 *
 * Implements both H2A (agent chat with SSE streaming, REPL, session
 * management) and H2H (direct messaging) under a single "conversation"
 * command. Everything is a conversation.
 */

import type { ApiClient } from "./api.client";
import * as output from "./output";

// ── SSE stream types ────────────────────────────────────────────────

/** Result of processing one SSE stream. */
export interface StreamResult {
  sessionId?: string;
  response?: string;
  title?: string;
  error?: string;
}

/** Callbacks for stream rendering. */
export interface StreamCallbacks {
  onToken: (text: string) => void;
  onStatus?: (message: string) => void;
  /**
   * Tool activity from the protocol — uses the server's own human-friendly
   * description string. Phase is "start" or "end".
   */
  onToolActivity?: (description: string, phase: "start" | "end", success?: boolean) => void;
  /** Called when the agent detects a hallucination and resets its response. */
  onResponseReset?: (reason?: string) => void;
}

// ── SSE stream parser ──────────────────────────────────────────────

/**
 * Read an SSE Response body, dispatch token content to callbacks, and
 * return a summary result once the stream ends.
 *
 * The protocol emits `tool_activity` events with human-friendly descriptions
 * (e.g. "Proposing a new signal for game development"). These are the
 * canonical tool call indicators — `tool_start`/`tool_end` events are only
 * used to track the insideToolCall state for token suppression, not displayed.
 */
export async function renderSSEStream(
  response: Response,
  callbacks: StreamCallbacks,
): Promise<StreamResult> {
  const { onToken, onStatus, onToolActivity, onResponseReset } = callbacks;
  const result: StreamResult = {};

  if (!response.body) {
    result.error = "No response body";
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  /** Tracks whether we're inside a tool call (suppress tool-name tokens). */
  let insideToolCall = false;
  /** Maps toolName -> human-friendly description from the start event. */
  const toolDescriptions = new Map<string, string>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events (delimited by double newline)
      while (buffer.includes("\n\n")) {
        const idx = buffer.indexOf("\n\n");
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of raw.split("\n")) {
          if (!line.startsWith("data:")) continue;

          const jsonStr = line.slice("data:".length).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as Record<string, unknown>;
            const type = event.type as string;

            switch (type) {
              case "token": {
                if (typeof event.content !== "string") break;
                if (insideToolCall) break;
                onToken(event.content);
                break;
              }

              case "status":
                if (onStatus && typeof event.message === "string") {
                  onStatus(event.message);
                }
                break;

              case "tool_activity": {
                const phase = event.phase as string;
                const toolName = typeof event.toolName === "string" ? event.toolName : "";
                const desc = typeof event.description === "string" ? event.description : undefined;

                if (phase === "start") {
                  insideToolCall = true;
                  // Store the human-friendly description from the start event
                  if (desc && toolName) {
                    toolDescriptions.set(toolName, desc);
                  }
                  if (onToolActivity && desc) {
                    onToolActivity(desc, "start");
                  }
                } else if (phase === "end") {
                  insideToolCall = false;
                  // Reuse the start description — end events often have the raw tool name
                  const startDesc = toolName ? toolDescriptions.get(toolName) : undefined;
                  if (onToolActivity) {
                    onToolActivity(startDesc ?? desc ?? toolName, "end", event.success !== false);
                  }
                  if (toolName) toolDescriptions.delete(toolName);
                }
                break;
              }

              case "tool_start":
                // Only used for token suppression — tool_activity handles display.
                insideToolCall = true;
                break;

              case "tool_end":
                insideToolCall = false;
                break;

              case "llm_start":
                insideToolCall = false;
                break;

              case "response_reset":
                result.response = undefined;
                if (onResponseReset) {
                  onResponseReset(typeof event.reason === "string" ? event.reason : undefined);
                }
                break;

              case "done":
                result.sessionId =
                  typeof event.sessionId === "string"
                    ? event.sessionId
                    : undefined;
                result.response =
                  typeof event.response === "string"
                    ? event.response
                    : undefined;
                result.title =
                  typeof event.title === "string" ? event.title : undefined;
                break;

              case "error":
                result.error =
                  typeof event.message === "string"
                    ? event.message
                    : "Unknown stream error";
                break;

              default:
                break;
            }
          } catch {
            // Malformed JSON line — skip.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

const CONVERSATION_HELP = `
Conversation Commands:
  index conversation list                  List your conversations
  index conversation with <user-id>        Open or resume a DM with a user
  index conversation show <id>             Show messages in a conversation
  index conversation show <id> --limit <n> Limit number of messages
  index conversation send <id> <message>   Send a message
  index conversation stream                Listen for real-time events (SSE)
`;

/**
 * Route a conversation subcommand to the appropriate handler.
 *
 * @param client - Authenticated API client.
 * @param subcommand - The subcommand (list, with, show, send, stream).
 * @param positionals - Positional arguments after the subcommand.
 * @param options - Additional options (e.g. limit).
 */
export async function handleConversation(
  client: ApiClient,
  subcommand: string | undefined,
  positionals: string[],
  options?: { limit?: number },
): Promise<void> {
  if (!subcommand) {
    console.log(CONVERSATION_HELP);
    return;
  }

  switch (subcommand) {
    case "list":
      await conversationList(client);
      return;
    case "with":
      await conversationWith(client, positionals[0]);
      return;
    case "show":
      await conversationShow(client, positionals[0], options?.limit);
      return;
    case "send":
      await conversationSend(client, positionals[0], positionals.slice(1));
      return;
    case "stream":
      await conversationStream(client);
      return;
    default:
      output.error(`Unknown conversation subcommand: ${subcommand}`, 1);
  }
}

/**
 * List conversations for the authenticated user.
 */
async function conversationList(client: ApiClient): Promise<void> {
  const conversations = await client.listConversations();

  output.heading("Conversations");
  output.conversationTable(conversations);
  console.log();
}

/**
 * Get or create a DM with a peer user.
 */
async function conversationWith(client: ApiClient, userId: string | undefined): Promise<void> {
  if (!userId) {
    output.error("Usage: index conversation with <user-id>", 1);
    return;
  }

  const conversation = await client.getOrCreateDM(userId);
  output.conversationCard(conversation);
}

/**
 * Show messages in a conversation.
 */
async function conversationShow(
  client: ApiClient,
  id: string | undefined,
  limit?: number,
): Promise<void> {
  if (!id) {
    output.error("Usage: index conversation show <id>", 1);
    return;
  }

  const messages = await client.getMessages(id, { limit: limit ?? 20 });

  output.heading("Messages");
  output.messageList(messages);
}

/**
 * Send a text message in a conversation.
 */
async function conversationSend(
  client: ApiClient,
  id: string | undefined,
  messageParts: string[],
): Promise<void> {
  if (!id) {
    output.error("Usage: index conversation send <id> <message>", 1);
    return;
  }

  if (messageParts.length === 0) {
    output.error("Missing message. Usage: index conversation send <id> <message>", 1);
    return;
  }

  const text = messageParts.join(" ");
  const msg = await client.sendMessage(id, text);
  output.success(`Message sent (${msg.id})`);
}

/**
 * Open an SSE stream for real-time conversation events.
 */
async function conversationStream(client: ApiClient): Promise<void> {
  output.info("Connecting to conversation stream...");
  output.dim("Press Ctrl+C to stop.\n");

  const response = await client.streamConversationEvents();

  if (!response.body) {
    output.error("No response body from stream endpoint.", 1);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes("\n\n")) {
        const idx = buffer.indexOf("\n\n");
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) continue; // keepalive comment
          if (!line.startsWith("data:")) continue;

          const jsonStr = line.slice("data:".length).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as Record<string, unknown>;
            const type = event.type as string;

            if (type === "connected") {
              output.success("Connected to conversation stream.");
            } else {
              output.dim(`[${type}] ${JSON.stringify(event)}`);
            }
          } catch {
            // Malformed JSON — skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
