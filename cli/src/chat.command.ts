/**
 * Chat command implementation — renders SSE streams from the protocol
 * server to the terminal and manages interactive REPL sessions.
 *
 * @deprecated Use `conversation.command.ts` instead. This module
 * re-exports shared SSE utilities and will be removed in a future version.
 */

import { createInterface } from "node:readline/promises";

import type { ApiClient } from "./api.client";
import * as output from "./output";
import { MarkdownRenderer } from "./output";
import { renderSSEStream } from "./conversation.command";

// Re-export SSE utilities so existing imports keep working during migration
export { renderSSEStream } from "./conversation.command";
export type { StreamResult, StreamCallbacks } from "./conversation.command";

/**
 * Route a chat subcommand to the appropriate handler.
 *
 * @param client - Authenticated API client.
 * @param options - Chat options (list, message, sessionId).
 */
export async function handleChat(
  client: ApiClient,
  options: { list: boolean; message?: string; sessionId?: string },
): Promise<void> {
  if (options.list) {
    await chatList(client);
  } else if (options.message) {
    await chatOneShot(client, options.message, options.sessionId);
  } else {
    await chatRepl(client, options.sessionId);
  }
}

/**
 * List all chat sessions.
 */
async function chatList(client: ApiClient): Promise<void> {
  const sessions = await client.listSessions();
  output.heading("Chat Sessions");
  output.sessionTable(sessions);
  console.log();
}

/**
 * Send a single message and print the streamed response.
 */
async function chatOneShot(
  client: ApiClient,
  message: string,
  sessionId?: string,
): Promise<void> {
  const response = await client.streamChat({ message, sessionId });

  if (!response.ok) {
    handleStreamError(response);
    return;
  }

  const result = await streamToTerminal(response);

  if (result.error) {
    output.error(result.error, 1);
    return;
  }

  if (result.sessionId) {
    output.dim(`\nSession: ${result.sessionId}`);
  }
}

/**
 * Enter an interactive REPL chat session.
 */
async function chatRepl(
  client: ApiClient,
  sessionId?: string,
): Promise<void> {
  let currentSessionId = sessionId;

  output.chatHeader();

  const PROMPT_STR = output.PROMPT_STR;

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  rl.setPrompt(PROMPT_STR);
  rl.prompt();

  try {
    for await (const line of rl) {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        continue;
      }
      if (input === "exit" || input === "quit") break;

      const response = await client.streamChat({
        message: input,
        sessionId: currentSessionId,
      });

      if (!response.ok) {
        if (response.status === 401) {
          output.error(
            "Session expired. Run `index login` to re-authenticate.",
            1,
          );
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        output.error(body.error ?? `HTTP ${response.status}`);
        rl.prompt();
        continue;
      }

      const result = await streamToTerminal(response);

      if (result.error) {
        output.error(result.error);
      }

      // Track session for continuity
      if (result.sessionId) {
        currentSessionId = result.sessionId;
      }

      process.stderr.write("\n");
      rl.prompt();
    }
  } finally {
    rl.close();
  }

  process.stderr.write("\n");
  output.dim("Goodbye!");
}

// ── Stream helpers ──────────────────────────────────────────────────

/**
 * Stream an SSE response to the terminal with formatting.
 * Handles status messages, tool activity, and markdown rendering.
 */
async function streamToTerminal(response: Response): Promise<StreamResult> {
  let hasTokens = false;
  const md = new MarkdownRenderer();
  let lastToolDesc = "";

  const result = await renderSSEStream(response, {
    onToken(text) {
      if (!hasTokens) {
        output.clearStatus();
        hasTokens = true;
      }
      md.write(text);
      // Once tokens flow, clear last tool so it can show again after new text
      lastToolDesc = "";
    },
    onStatus(msg) {
      if (!hasTokens) {
        output.status(msg);
      }
    },
    onToolActivity(description, phase) {
      if (phase === "start") {
        const friendly = output.humanizeToolName(description);
        // Skip if identical to the last tool line with no text in between
        if (friendly === lastToolDesc) return;
        lastToolDesc = friendly;
        // Finalize any buffered markdown before the tool line
        md.finalize();
        hasTokens = false;
        output.toolActivity(friendly);
      }
    },
    onResponseReset(reason) {
      md.reset(reason);
      hasTokens = false;
    },
  });

  md.finalize();
  output.clearStatus();
  if (hasTokens) {
    console.log(); // newline after streamed tokens
  }

  return result;
}

/** Handle non-OK stream responses. */
async function handleStreamError(response: Response): Promise<void> {
  if (response.status === 401) {
    output.error(
      "Session expired or invalid. Run `index login` to re-authenticate.",
      1,
    );
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  output.error(body.error ?? `HTTP ${response.status}`, 1);
}

