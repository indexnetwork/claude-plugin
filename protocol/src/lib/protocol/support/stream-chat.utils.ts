/**
 * Shared Stream Chat utilities.
 *
 * Centralises constants, channel-id derivation, server-client creation,
 * bot-user management, and message helpers so that every call-site
 * (opportunity.service, opportunity.chat-injection, etc.) shares a single
 * implementation and all Stream SDK type workarounds live in one place.
 */

import { StreamChat } from 'stream-chat';
import type { Channel } from 'stream-chat';
import { protocolLogger } from './protocol.logger';

const logger = protocolLogger('StreamChatUtils');

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────

export const INDEX_BOT_USER_ID = 'index_bot';
export const INDEX_BOT_NAME = 'Index';

// ──────────────────────────────────────────────────────────────
// CHANNEL-ID DERIVATION
// ──────────────────────────────────────────────────────────────

/**
 * Deterministic channel id for a direct conversation between two users.
 * Sorts the ids so that the same pair always produces the same channel id.
 * Hashes when the concatenated length would exceed Stream's 64-char limit.
 */
export function getDirectChannelId(firstUserId: string, secondUserId: string): string {
  const sortedIds = [firstUserId, secondUserId].sort().join('_');
  if (sortedIds.length <= 64) return sortedIds;

  let hash = 0;
  for (let i = 0; i < sortedIds.length; i++) {
    const char = sortedIds.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).slice(0, 63);
}

// ──────────────────────────────────────────────────────────────
// SERVER CLIENT
// ──────────────────────────────────────────────────────────────

/**
 * Returns the singleton Stream server-side client, or `null` when
 * `STREAM_API_KEY` / `STREAM_SECRET` are not configured.
 */
export function getStreamServerClient(): StreamChat | null {
  const apiKey = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET;
  if (!apiKey || !secret) return null;
  return StreamChat.getInstance(apiKey, secret);
}

// ──────────────────────────────────────────────────────────────
// BOT-USER MANAGEMENT
// ──────────────────────────────────────────────────────────────

/**
 * Upsert the Index bot user so it can send messages.
 * Silently logs and continues on failure.
 */
export async function ensureIndexBotUser(streamClient: StreamChat): Promise<void> {
  try {
    await streamClient.upsertUsers([{ id: INDEX_BOT_USER_ID, name: INDEX_BOT_NAME }]);
  } catch (error) {
    logger.warn('[ensureIndexBotUser] Failed to upsert Index bot user', { error });
  }
}

// ──────────────────────────────────────────────────────────────
// MESSAGE HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Send a message from the Index bot on `channel`.
 *
 * Wraps Stream's `channel.sendMessage` with the necessary type casts
 * (the SDK's TS definitions don't accommodate custom fields or
 * the server-side user-id-as-second-arg pattern cleanly).
 */
export async function sendBotMessage(
  channel: Channel,
  message: Record<string, unknown>,
): Promise<void> {
  await (
    channel as unknown as {
      sendMessage: (msg: Record<string, unknown>, userId: string) => Promise<unknown>;
    }
  ).sendMessage(message, INDEX_BOT_USER_ID);
}

/**
 * Check whether any message in `messages` already references the given
 * `opportunityId` via an `introType` of `opportunity_intro` or
 * `opportunity_update`.
 */
export function channelHasMessageForOpportunity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: readonly any[],
  opportunityId: string,
): boolean {
  return messages.some((message) => {
    const m = message as { introType?: string; opportunityId?: string };
    return (
      (m.introType === 'opportunity_intro' || m.introType === 'opportunity_update') &&
      m.opportunityId === opportunityId
    );
  });
}
