import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';
import { log } from '../lib/log';
import { Controller, Get, Patch, Post, UseGuards } from '../lib/router/router.decorators';
import { intentService } from '../services/intent.service';
import { userService } from '../services/user.service';
import { IntentDatabaseAdapter } from '../adapters/database.adapter';
import db from '../lib/drizzle/drizzle';
import * as schema from '../schemas/database.schema';
import { eq, and, isNull, isNotNull, desc, count } from 'drizzle-orm';

const logger = log.controller.from('intent');
const intentDb = new IntentDatabaseAdapter();

@Controller('/intents')
export class IntentController {
  /**
   * List intents with pagination and filters.
   */
  @Post('/list')
  @UseGuards(AuthGuard)
  async list(req: Request, user: AuthenticatedUser) {
    const body = await req.json().catch(() => ({})) as {
      page?: number;
      limit?: number;
      archived?: boolean;
      sourceType?: string;
    };

    const page = Math.max(1, body.page || 1);
    const limit = Math.min(100, Math.max(1, body.limit || 20));
    const offset = (page - 1) * limit;
    const archived = body.archived ?? false;

    const conditions = [eq(schema.intents.userId, user.id)];
    if (archived) {
      conditions.push(isNotNull(schema.intents.archivedAt));
    } else {
      conditions.push(isNull(schema.intents.archivedAt));
    }
    if (body.sourceType) {
      conditions.push(eq(schema.intents.sourceType, body.sourceType as any));
    }

    const where = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      db.select({
        id: schema.intents.id,
        payload: schema.intents.payload,
        summary: schema.intents.summary,
        isIncognito: schema.intents.isIncognito,
        createdAt: schema.intents.createdAt,
        updatedAt: schema.intents.updatedAt,
        archivedAt: schema.intents.archivedAt,
        sourceType: schema.intents.sourceType,
        sourceId: schema.intents.sourceId,
      })
        .from(schema.intents)
        .where(where)
        .orderBy(desc(schema.intents.createdAt))
        .offset(offset)
        .limit(limit),
      db.select({ count: count() }).from(schema.intents).where(where),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);

    return Response.json({
      intents: rows.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
      })),
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: rows.length,
        totalCount: total,
      },
    });
  }

  /**
   * Get a single intent by ID.
   */
  @Get('/:id')
  @UseGuards(AuthGuard)
  async getById(_req: Request, user: AuthenticatedUser, params: { id: string }) {
    const row = await db.select({
      id: schema.intents.id,
      payload: schema.intents.payload,
      summary: schema.intents.summary,
      isIncognito: schema.intents.isIncognito,
      createdAt: schema.intents.createdAt,
      updatedAt: schema.intents.updatedAt,
      archivedAt: schema.intents.archivedAt,
      sourceType: schema.intents.sourceType,
      sourceId: schema.intents.sourceId,
    })
      .from(schema.intents)
      .where(and(eq(schema.intents.id, params.id), eq(schema.intents.userId, user.id)))
      .limit(1);

    if (!row[0]) {
      return Response.json({ error: 'Intent not found' }, { status: 404 });
    }

    const r = row[0];
    return Response.json({
      intent: {
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
      },
    });
  }

  /**
   * Archive an intent.
   */
  @Patch('/:id/archive')
  @UseGuards(AuthGuard)
  async archive(_req: Request, user: AuthenticatedUser, params: { id: string }) {
    // Verify ownership
    const owned = await db.select({ id: schema.intents.id })
      .from(schema.intents)
      .where(and(eq(schema.intents.id, params.id), eq(schema.intents.userId, user.id)))
      .limit(1);

    if (!owned[0]) {
      return Response.json({ error: 'Intent not found' }, { status: 404 });
    }

    const result = await intentDb.archiveIntent(params.id);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ success: true });
  }

  /**
   * Process user input through the Intent Graph.
   */
  @Post('/process')
  @UseGuards(AuthGuard)
  async process(req: Request, user: AuthenticatedUser) {
    logger.info('Intent process requested', { userId: user.id });

    let content: string | undefined;
    try {
      const body = await req.json() as { content?: string };
      content = body.content;
    } catch {
      // No body or invalid JSON
    }

    const userWithGraph = await userService.findWithGraph(user.id);
    const userProfile = userWithGraph?.profile ? JSON.stringify(userWithGraph.profile) : '{}';
    const result = await intentService.processIntent(user.id, userProfile, content);

    return Response.json(result);
  }
}
