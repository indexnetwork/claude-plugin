#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';

const envFile = `.env.development`;
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import { eq, sql } from 'drizzle-orm';

import db from '../lib/drizzle/drizzle';
import {
  chatMessages,
  chatMessageMetadata,
  chatSessionMetadata,
  chatSessions,
  conversationMetadata,
  conversationParticipants,
  conversations,
  messages,
  tasks,
} from '../schemas/database.schema';

/**
 * Migrates existing chat data from deprecated chat_sessions / chat_messages
 * tables into the new A2A-aligned conversations / messages / tasks tables.
 *
 * @remarks
 * Idempotent: skips migration when the conversations table already contains rows.
 * Run once on an existing database; safe to call again on an already-migrated DB.
 */
async function main() {
  console.log('Starting chat → conversations migration...');

  // Guard: skip if conversations table already has data
  const [existingRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations);

  if (Number(existingRow.count) > 0) {
    console.log('Conversations table already has data. Skipping migration.');
    return;
  }

  // Read all legacy sessions
  const sessions = await db.select().from(chatSessions);
  console.log(`Found ${sessions.length} sessions to migrate`);

  let messagesCount = 0;
  let tasksCount = 0;

  for (const session of sessions) {
    // ── 1. Insert conversation (preserve ID) ──────────────────────────────────
    await db.insert(conversations).values({
      id: session.id,
      lastMessageAt: session.updatedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    // ── 2. Insert participants ─────────────────────────────────────────────────
    await db.insert(conversationParticipants).values([
      {
        conversationId: session.id,
        participantId: session.userId,
        participantType: 'user',
      },
      {
        conversationId: session.id,
        participantId: 'system-agent',
        participantType: 'agent',
      },
    ]);

    // ── 3. Insert conversation metadata ───────────────────────────────────────
    const meta: Record<string, unknown> = {};
    if (session.title) meta.title = session.title;
    if (session.shareToken) meta.shareToken = session.shareToken;
    if (session.indexId) meta.indexId = session.indexId;
    if (session.metadata) meta._sessionMeta = session.metadata;

    if (Object.keys(meta).length > 0) {
      await db.insert(conversationMetadata).values({
        conversationId: session.id,
        metadata: meta,
      });
    }

    // ── 4. Check for session-level metadata → create a task ───────────────────
    // The chat_session_metadata table may not exist in all environments.
    let taskId: string | null = null;
    let sessionMeta: typeof chatSessionMetadata.$inferSelect | undefined;
    try {
      [sessionMeta] = await db
        .select()
        .from(chatSessionMetadata)
        .where(eq(chatSessionMetadata.sessionId, session.id));
    } catch {
      // Table does not exist; skip session metadata
    }

    if (sessionMeta) {
      taskId = crypto.randomUUID();
      await db.insert(tasks).values({
        id: taskId,
        conversationId: session.id,
        state: 'completed',
        metadata: sessionMeta.metadata ?? undefined,
        createdAt: sessionMeta.createdAt,
        updatedAt: sessionMeta.updatedAt,
      });
      tasksCount++;
    }

    // ── 5. Migrate messages for this session ──────────────────────────────────
    const sessionMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id));

    for (const msg of sessionMessages) {
      const msgMeta: Record<string, unknown> = {};
      if (msg.routingDecision) msgMeta.routingDecision = msg.routingDecision;
      if (msg.subgraphResults) msgMeta.subgraphResults = msg.subgraphResults;
      if (msg.tokenCount != null) msgMeta.tokenCount = msg.tokenCount;

      // Merge per-message trace / debug metadata (table may not exist in all envs)
      try {
        const [msgMetaRow] = await db
          .select()
          .from(chatMessageMetadata)
          .where(eq(chatMessageMetadata.messageId, msg.id));

        if (msgMetaRow?.traceEvents) msgMeta.traceEvents = msgMetaRow.traceEvents;
        if (msgMetaRow?.debugMeta) msgMeta.debugMeta = msgMetaRow.debugMeta;
      } catch {
        // Table does not exist; skip message metadata
      }

      await db.insert(messages).values({
        id: msg.id,
        conversationId: session.id,
        senderId: msg.role === 'user' ? session.userId : 'system-agent',
        role: msg.role === 'user' ? 'user' : 'agent',
        parts: [{ text: msg.content }],
        metadata: Object.keys(msgMeta).length > 0 ? msgMeta : null,
        taskId: taskId ?? undefined,
        createdAt: msg.createdAt,
      });

      messagesCount++;
    }
  }

  // ── 6. Update lastMessageAt per conversation ───────────────────────────────
  // This is a best-effort update; errors here do not fail the migration.
  if (sessions.length > 0) {
    await db.execute(sql`
      UPDATE conversations c
      SET last_message_at = sub.max_created_at
      FROM (
        SELECT conversation_id, MAX(created_at) AS max_created_at
        FROM messages
        GROUP BY conversation_id
      ) sub
      WHERE c.id = sub.conversation_id
    `);
  }

  console.log('Migration complete:');
  console.log(`  Sessions → Conversations: ${sessions.length}`);
  console.log(`  Messages migrated:        ${messagesCount}`);
  console.log(`  Tasks created:            ${tasksCount}`);
}

main().catch(console.error).finally(() => process.exit(0));
