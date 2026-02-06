import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';
import { log } from '../lib/log';
import { Controller, Delete, Get, Post, UseGuards } from '../lib/router/router.decorators';
import db from '../lib/drizzle/drizzle';
import { links } from '../schemas/database.schema';
import { eq, and } from 'drizzle-orm';

const logger = log.controller.from('link');

@Controller('/links')
export class LinkController {
  /**
   * List all links for the authenticated user.
   */
  @Get('')
  @UseGuards(AuthGuard)
  async list(_req: Request, user: AuthenticatedUser) {
    const rows = await db.select({
      id: links.id,
      url: links.url,
      createdAt: links.createdAt,
      lastSyncAt: links.lastSyncAt,
      lastStatus: links.lastStatus,
      lastError: links.lastError,
    })
      .from(links)
      .where(eq(links.userId, user.id));

    return Response.json({
      links: rows.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      })),
    });
  }

  /**
   * Create a new link.
   */
  @Post('')
  @UseGuards(AuthGuard)
  async create(req: Request, user: AuthenticatedUser) {
    const body = await req.json().catch(() => ({})) as { url?: string };
    if (!body.url) {
      return Response.json({ error: 'url is required' }, { status: 400 });
    }

    const [inserted] = await db.insert(links)
      .values({ userId: user.id, url: body.url })
      .returning({
        id: links.id,
        url: links.url,
        createdAt: links.createdAt,
        lastSyncAt: links.lastSyncAt,
        lastStatus: links.lastStatus,
        lastError: links.lastError,
      });

    logger.info('Link created', { userId: user.id, linkId: inserted.id });

    return Response.json({
      link: {
        ...inserted,
        createdAt: inserted.createdAt.toISOString(),
        lastSyncAt: inserted.lastSyncAt?.toISOString() ?? null,
      },
    });
  }

  /**
   * Delete a link.
   */
  @Delete('/:id')
  @UseGuards(AuthGuard)
  async delete(_req: Request, user: AuthenticatedUser, params: { id: string }) {
    const result = await db.delete(links)
      .where(and(eq(links.id, params.id), eq(links.userId, user.id)))
      .returning({ id: links.id });

    if (!result.length) {
      return Response.json({ error: 'Link not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  /**
   * Get link content (stub — returns stored metadata).
   */
  @Get('/:id/content')
  @UseGuards(AuthGuard)
  async getContent(_req: Request, user: AuthenticatedUser, params: { id: string }) {
    const rows = await db.select({
      id: links.id,
      url: links.url,
      lastSyncAt: links.lastSyncAt,
      lastStatus: links.lastStatus,
    })
      .from(links)
      .where(and(eq(links.id, params.id), eq(links.userId, user.id)))
      .limit(1);

    if (!rows[0]) {
      return Response.json({ error: 'Link not found' }, { status: 404 });
    }

    const link = rows[0];
    return Response.json({
      url: link.url,
      lastSyncAt: link.lastSyncAt?.toISOString() ?? null,
      lastStatus: link.lastStatus,
      pending: link.lastStatus === null,
    });
  }
}
