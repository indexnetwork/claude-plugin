import { eq, and, sql, desc, min, max, count } from 'drizzle-orm';

import db from '../lib/drizzle/drizzle';
import { log } from '../lib/log';
import { Controller, Get, UseGuards } from '../lib/router/router.decorators';
import { intents, hydeDocuments, intentIndexes, indexes, opportunities } from '../schemas/database.schema';

import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';
import { DebugGuard } from '../guards/debug.guard';

type RouteParams = Record<string, string>;

const logger = log.controller.from('debug');

/** Statuses that are considered actionable (the opportunity is still "live"). */
const ACTIONABLE_STATUSES = new Set(['pending', 'viewed']);

/**
 * Debug controller exposing diagnostic endpoints for internal use.
 * All routes are gated by DebugGuard (dev-only or explicit opt-in)
 * and AuthGuard (valid JWT required).
 *
 * @remarks This controller queries the database directly rather than going
 * through a service layer. This is a known exception for debug-only code
 * to avoid over-engineering a service for diagnostic queries.
 */
@Controller('/debug')
export class DebugController {
  /**
   * Returns a full diagnostic snapshot for a single intent.
   * Gathers the intent record, HyDE document stats, index assignments,
   * related opportunities, and a pipeline-health diagnosis object.
   * @param _req - Incoming request (unused beyond guard processing)
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the intent `id`
   * @returns Diagnostic JSON payload
   */
  @Get('/intents/:id')
  @UseGuards(DebugGuard, AuthGuard)
  async getIntentDebug(_req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const intentId = params?.id;
    if (!intentId) {
      return Response.json({ error: 'Intent ID is required' }, { status: 400 });
    }

    logger.verbose('Intent debug request', { intentId, userId: user.id });

    // ── 1. Fetch intent record (scoped to authenticated user) ─────────
    const [intent] = await db
      .select({
        id: intents.id,
        payload: intents.payload,
        summary: intents.summary,
        confidence: intents.semanticEntropy,
        inferenceType: intents.intentMode,
        sourceType: intents.sourceType,
        hasEmbedding: sql<boolean>`${intents.embedding} IS NOT NULL`.as('has_embedding'),
        createdAt: intents.createdAt,
        updatedAt: intents.updatedAt,
        archivedAt: intents.archivedAt,
      })
      .from(intents)
      .where(and(eq(intents.id, intentId), eq(intents.userId, user.id)))
      .limit(1);

    if (!intent) {
      return Response.json({ error: 'Intent not found' }, { status: 404 });
    }

    // ── 2. Fetch HyDE document stats ──────────────────────────────────
    const [hydeStats] = await db
      .select({
        count: count().as('count'),
        oldestGeneratedAt: min(hydeDocuments.createdAt).as('oldest'),
        newestGeneratedAt: max(hydeDocuments.createdAt).as('newest'),
      })
      .from(hydeDocuments)
      .where(
        and(
          eq(hydeDocuments.sourceType, 'intent'),
          eq(hydeDocuments.sourceId, intentId),
        ),
      );

    // ── 3. Fetch index assignments with title and prompt ──────────────
    const indexRows = await db
      .select({
        indexId: intentIndexes.indexId,
        indexTitle: indexes.title,
        indexPrompt: indexes.prompt,
      })
      .from(intentIndexes)
      .innerJoin(indexes, eq(intentIndexes.indexId, indexes.id))
      .where(eq(intentIndexes.intentId, intentId));

    // ── 4. Fetch opportunities referencing this intent ─────────────────
    const opportunityRows = await db
      .select({
        id: opportunities.id,
        actors: opportunities.actors,
        confidence: opportunities.confidence,
        status: opportunities.status,
        createdAt: opportunities.createdAt,
        context: opportunities.context,
      })
      .from(opportunities)
      .where(
        sql`${opportunities.actors}::jsonb @> ${JSON.stringify([{ intent: intentId }])}::jsonb`,
      )
      .orderBy(desc(opportunities.createdAt));

    // ── 5. Build response shapes ──────────────────────────────────────

    const intentResponse = {
      id: intent.id,
      text: intent.payload,
      summary: intent.summary,
      status: intent.archivedAt ? 'archived' : 'active',
      confidence: intent.confidence,
      inferenceType: intent.inferenceType,
      sourceType: intent.sourceType,
      hasEmbedding: intent.hasEmbedding,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };

    const hydeDocumentsResponse = {
      count: hydeStats?.count ?? 0,
      oldestGeneratedAt: hydeStats?.oldestGeneratedAt?.toISOString() ?? null,
      newestGeneratedAt: hydeStats?.newestGeneratedAt?.toISOString() ?? null,
    };

    const indexAssignments = indexRows.map((r) => ({
      indexId: r.indexId,
      indexTitle: r.indexTitle,
      indexPrompt: r.indexPrompt,
    }));

    // Aggregate opportunities by status
    const byStatus: Record<string, number> = {};
    for (const o of opportunityRows) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    }

    const opportunitiesResponse = {
      total: opportunityRows.length,
      byStatus,
      items: opportunityRows.map((o) => {
        // Find the counterpart actor (the one whose intent is NOT this one)
        const counterpart = o.actors.find((a) => a.intent !== intentId);
        return {
          opportunityId: o.id,
          counterpartUserId: counterpart?.userId ?? null,
          confidence: Number(o.confidence),
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          indexId: o.context?.indexId ?? counterpart?.indexId ?? null,
        };
      }),
    };

    // ── 6. Build diagnosis ────────────────────────────────────────────
    const hasHydeDocuments = (hydeStats?.count ?? 0) > 0;
    const isInAtLeastOneIndex = indexRows.length > 0;
    const hasOpportunities = opportunityRows.length > 0;

    // Check if all opportunities are non-actionable
    const actionableCount = opportunityRows.filter((o) => ACTIONABLE_STATUSES.has(o.status)).length;
    const allOpportunitiesFilteredFromHome = hasOpportunities && actionableCount === 0;

    // Build filterReasons: list non-actionable statuses with counts
    const filterReasons: string[] = [];
    if (allOpportunitiesFilteredFromHome) {
      for (const [status, cnt] of Object.entries(byStatus)) {
        if (!ACTIONABLE_STATUSES.has(status)) {
          filterReasons.push(`${status}: ${cnt}`);
        }
      }
    }

    const diagnosis = {
      hasEmbedding: intent.hasEmbedding,
      hasHydeDocuments,
      isInAtLeastOneIndex,
      hasOpportunities,
      allOpportunitiesFilteredFromHome,
      filterReasons,
    };

    return Response.json({
      exportedAt: new Date().toISOString(),
      intent: intentResponse,
      hydeDocuments: hydeDocumentsResponse,
      indexAssignments,
      opportunities: opportunitiesResponse,
      diagnosis,
    });
  }
}
