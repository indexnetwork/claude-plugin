import { eq, and, sql, desc } from 'drizzle-orm';

import db from '../lib/drizzle/drizzle';
import { log } from '../lib/log';
import { Controller, Get, UseGuards } from '../lib/router/router.decorators';
import { intents, hydeDocuments, intentIndexes, indexes, opportunities } from '../schemas/database.schema';

import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';
import { DebugGuard } from '../guards/debug.guard';

type RouteParams = Record<string, string>;

const logger = log.controller.from('debug');

/**
 * Debug controller exposing diagnostic endpoints for internal use.
 * All routes are gated by DebugGuard (dev-only or explicit opt-in)
 * and AuthGuard (valid JWT required).
 */
@Controller('/debug')
export class DebugController {
  /**
   * Returns a full diagnostic snapshot for a single intent.
   * Gathers the intent record, HyDE documents, index assignments,
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

    // ── 1. Fetch intent record ──────────────────────────────────────────
    const [intent] = await db
      .select({
        id: intents.id,
        payload: intents.payload,
        summary: intents.summary,
        status: intents.status,
        confidence: intents.semanticEntropy,
        sourceType: intents.sourceType,
        sourceId: intents.sourceId,
        intentMode: intents.intentMode,
        speechActType: intents.speechActType,
        hasEmbedding: sql<boolean>`${intents.embedding} IS NOT NULL`.as('has_embedding'),
        createdAt: intents.createdAt,
        updatedAt: intents.updatedAt,
        archivedAt: intents.archivedAt,
        userId: intents.userId,
      })
      .from(intents)
      .where(eq(intents.id, intentId))
      .limit(1);

    if (!intent) {
      return Response.json({ error: 'Intent not found' }, { status: 404 });
    }

    // ── 2. Fetch HyDE documents for this intent ────────────────────────
    const hydeRows = await db
      .select({
        id: hydeDocuments.id,
        strategy: hydeDocuments.strategy,
        targetCorpus: hydeDocuments.targetCorpus,
        createdAt: hydeDocuments.createdAt,
      })
      .from(hydeDocuments)
      .where(
        and(
          eq(hydeDocuments.sourceType, 'intent'),
          eq(hydeDocuments.sourceId, intentId),
        ),
      )
      .orderBy(desc(hydeDocuments.createdAt));

    // ── 3. Fetch index assignments ─────────────────────────────────────
    const indexRows = await db
      .select({
        indexId: intentIndexes.indexId,
        indexTitle: indexes.title,
        assignedAt: intentIndexes.createdAt,
      })
      .from(intentIndexes)
      .innerJoin(indexes, eq(intentIndexes.indexId, indexes.id))
      .where(eq(intentIndexes.intentId, intentId));

    // ── 4. Fetch opportunities referencing this intent ──────────────────
    const opportunityRows = await db
      .select({
        id: opportunities.id,
        actors: opportunities.actors,
        interpretation: opportunities.interpretation,
        context: opportunities.context,
        confidence: opportunities.confidence,
        status: opportunities.status,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .where(
        sql`${opportunities.actors}::jsonb @> ${JSON.stringify([{ intent: intentId }])}::jsonb`,
      )
      .orderBy(desc(opportunities.createdAt));

    // ── 5. Build diagnosis ──────────────────────────────────────────────
    const diagnosis = buildDiagnosis(intent, hydeRows, indexRows, opportunityRows);

    return Response.json({
      intent: {
        ...intent,
        createdAt: intent.createdAt.toISOString(),
        updatedAt: intent.updatedAt.toISOString(),
        archivedAt: intent.archivedAt?.toISOString() ?? null,
      },
      hyde: {
        count: hydeRows.length,
        documents: hydeRows.map((h) => ({
          ...h,
          createdAt: h.createdAt.toISOString(),
        })),
      },
      indexes: indexRows.map((r) => ({
        ...r,
        assignedAt: r.assignedAt.toISOString(),
      })),
      opportunities: opportunityRows.map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
      })),
      diagnosis,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Diagnosis helpers
// ═══════════════════════════════════════════════════════════════════════════════

interface DiagnosisIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

interface Diagnosis {
  healthy: boolean;
  issues: DiagnosisIssue[];
}

/**
 * Analyses pipeline artefacts and returns a health summary with actionable issues.
 */
function buildDiagnosis(
  intent: { hasEmbedding: boolean; status: string | null; archivedAt: Date | null },
  hydeRows: { id: string }[],
  indexRows: { indexId: string }[],
  opportunityRows: { id: string }[],
): Diagnosis {
  const issues: DiagnosisIssue[] = [];

  // Embedding check
  if (!intent.hasEmbedding) {
    issues.push({
      level: 'error',
      code: 'NO_EMBEDDING',
      message: 'Intent has no embedding vector. Semantic search and HyDE generation will not work.',
    });
  }

  // Archived check
  if (intent.archivedAt) {
    issues.push({
      level: 'warning',
      code: 'ARCHIVED',
      message: 'Intent is archived. It will not participate in new opportunity matching.',
    });
  }

  // Status check
  if (intent.status && intent.status !== 'ACTIVE') {
    issues.push({
      level: 'info',
      code: 'NON_ACTIVE_STATUS',
      message: `Intent status is "${intent.status}". Only ACTIVE intents are matched.`,
    });
  }

  // HyDE documents
  if (hydeRows.length === 0 && intent.hasEmbedding) {
    issues.push({
      level: 'warning',
      code: 'NO_HYDE_DOCUMENTS',
      message: 'No HyDE documents generated yet. The intent may not surface in discovery searches.',
    });
  }

  // Index assignments
  if (indexRows.length === 0) {
    issues.push({
      level: 'warning',
      code: 'NO_INDEX_ASSIGNMENTS',
      message: 'Intent is not assigned to any index. It cannot participate in opportunity matching.',
    });
  }

  // Opportunities
  if (opportunityRows.length === 0 && indexRows.length > 0 && intent.hasEmbedding) {
    issues.push({
      level: 'info',
      code: 'NO_OPPORTUNITIES',
      message: 'No opportunities found yet. This may be normal for new or niche intents.',
    });
  }

  return {
    healthy: issues.every((i) => i.level !== 'error'),
    issues,
  };
}
