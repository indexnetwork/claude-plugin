import { AuthGuard, type AuthenticatedUser } from '../guards/auth.guard';
import { Controller, Get, Post, Patch, Delete, UseGuards } from '../lib/router/router.decorators';
import { ConversationService } from '../services/conversation.service';
import { TaskService } from '../services/task.service';
import { log } from '../lib/log';

type RouteParams = Record<string, string>;

const logger = log.controller.from('conversation');

/**
 * HTTP controller for conversation REST API endpoints.
 * Thin layer: parses requests, delegates to ConversationService and TaskService, formats responses.
 */
@Controller('/conversations')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly taskService: TaskService,
  ) {}

  /**
   * GET /conversations — list all conversations for the authenticated user.
   *
   * @param _req - The HTTP request object (unused)
   * @param user - Authenticated user from AuthGuard
   * @returns JSON with conversations array
   */
  @Get('')
  @UseGuards(AuthGuard)
  async listConversations(_req: Request, user: AuthenticatedUser) {
    try {
      const conversations = await this.conversationService.getConversations(user.id);
      return Response.json({ conversations });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[listConversations] Error', { userId: user.id, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * POST /conversations — create a new conversation with participants.
   *
   * @param req - Must include `participants` array in JSON body
   * @param user - Authenticated user from AuthGuard
   * @returns JSON with created conversation
   */
  @Post('')
  @UseGuards(AuthGuard)
  async createConversation(req: Request, user: AuthenticatedUser) {
    let body: { participants?: { participantId: string; participantType: 'user' | 'agent' }[] };
    try {
      body = (await req.json()) as { participants?: { participantId: string; participantType: 'user' | 'agent' }[] };
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!Array.isArray(body.participants) || body.participants.length === 0) {
      return Response.json({ error: 'participants array is required' }, { status: 400 });
    }

    try {
      const conversation = await this.conversationService.createConversation(body.participants);
      return Response.json({ conversation }, { status: 201 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[createConversation] Error', { userId: user.id, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * GET /conversations/:id/messages — get messages for a conversation.
   *
   * @param req - Optional query params: limit, before, taskId
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID
   * @returns JSON with messages array
   */
  @Get('/:id/messages')
  @UseGuards(AuthGuard)
  async getMessages(req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    if (!conversationId) {
      return Response.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
    const before = url.searchParams.get('before') ?? undefined;
    const taskId = url.searchParams.get('taskId') ?? undefined;

    try {
      const messages = await this.conversationService.getMessages(conversationId, { limit, before, taskId });
      return Response.json({ messages });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[getMessages] Error', { userId: user.id, conversationId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * POST /conversations/:id/messages — send a message in a conversation.
   *
   * @param req - Must include `parts` array in JSON body; optional `taskId`, `metadata`
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID
   * @returns JSON with created message
   */
  @Post('/:id/messages')
  @UseGuards(AuthGuard)
  async sendMessage(req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    if (!conversationId) {
      return Response.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    let body: { parts?: unknown[]; taskId?: string; metadata?: Record<string, unknown> };
    try {
      body = (await req.json()) as { parts?: unknown[]; taskId?: string; metadata?: Record<string, unknown> };
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!Array.isArray(body.parts) || body.parts.length === 0) {
      return Response.json({ error: 'parts array is required' }, { status: 400 });
    }

    try {
      const msg = await this.conversationService.sendMessage(
        conversationId, user.id, 'user', body.parts, { taskId: body.taskId, metadata: body.metadata }
      );
      return Response.json({ message: msg }, { status: 201 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[sendMessage] Error', { userId: user.id, conversationId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * POST /conversations/dm — get or create a DM conversation with a peer.
   *
   * @param req - Must include `peerUserId` in JSON body
   * @param user - Authenticated user from AuthGuard
   * @returns JSON with conversation
   */
  @Post('/dm')
  @UseGuards(AuthGuard)
  async getOrCreateDM(req: Request, user: AuthenticatedUser) {
    let body: { peerUserId?: string };
    try {
      body = (await req.json()) as { peerUserId?: string };
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.peerUserId) {
      return Response.json({ error: 'peerUserId is required' }, { status: 400 });
    }

    try {
      const conversation = await this.conversationService.getOrCreateDM(user.id, body.peerUserId);
      return Response.json({ conversation });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[getOrCreateDM] Error', { userId: user.id, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * PATCH /conversations/:id/metadata — update metadata for a conversation.
   *
   * @param req - Must include `metadata` object in JSON body
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID
   * @returns JSON with success status
   */
  @Patch('/:id/metadata')
  @UseGuards(AuthGuard)
  async updateMetadata(req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    if (!conversationId) {
      return Response.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    let body: { metadata?: Record<string, unknown> };
    try {
      body = (await req.json()) as { metadata?: Record<string, unknown> };
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.metadata || typeof body.metadata !== 'object') {
      return Response.json({ error: 'metadata object is required' }, { status: 400 });
    }

    try {
      await this.conversationService.updateMetadata(conversationId, body.metadata);
      return Response.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[updateMetadata] Error', { userId: user.id, conversationId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * DELETE /conversations/:id — hide a conversation for the authenticated user.
   *
   * @param _req - The HTTP request object (unused)
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID
   * @returns JSON with success status
   */
  @Delete('/:id')
  @UseGuards(AuthGuard)
  async hideConversation(_req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    if (!conversationId) {
      return Response.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    try {
      await this.conversationService.hideConversation(user.id, conversationId);
      return Response.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[hideConversation] Error', { userId: user.id, conversationId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * GET /conversations/:id/tasks — list all tasks for a conversation.
   *
   * @param _req - The HTTP request object (unused)
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID
   * @returns JSON with tasks array
   */
  @Get('/:id/tasks')
  @UseGuards(AuthGuard)
  async listTasks(_req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    if (!conversationId) {
      return Response.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    try {
      const tasks = await this.taskService.getTasksByConversation(conversationId);
      return Response.json({ tasks });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[listTasks] Error', { userId: user.id, conversationId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * GET /conversations/:id/tasks/:taskId — get a single task.
   *
   * @param _req - The HTTP request object (unused)
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID and task ID
   * @returns JSON with task, or 404 if not found
   */
  @Get('/:id/tasks/:taskId')
  @UseGuards(AuthGuard)
  async getTask(_req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    const taskId = params?.taskId;
    if (!conversationId || !taskId) {
      return Response.json({ error: 'Conversation ID and Task ID required' }, { status: 400 });
    }

    try {
      const task = await this.taskService.getTask(taskId);
      if (!task) {
        return Response.json({ error: 'Task not found' }, { status: 404 });
      }
      return Response.json({ task });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[getTask] Error', { userId: user.id, conversationId, taskId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * GET /conversations/:id/tasks/:taskId/artifacts — get artifacts for a task.
   *
   * @param _req - The HTTP request object (unused)
   * @param user - Authenticated user from AuthGuard
   * @param params - Route params containing the conversation ID and task ID
   * @returns JSON with artifacts array
   */
  @Get('/:id/tasks/:taskId/artifacts')
  @UseGuards(AuthGuard)
  async getArtifacts(_req: Request, user: AuthenticatedUser, params?: RouteParams) {
    const conversationId = params?.id;
    const taskId = params?.taskId;
    if (!conversationId || !taskId) {
      return Response.json({ error: 'Conversation ID and Task ID required' }, { status: 400 });
    }

    try {
      const artifacts = await this.taskService.getArtifacts(taskId);
      return Response.json({ artifacts });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[getArtifacts] Error', { userId: user.id, conversationId, taskId, error: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * GET /conversations/stream — SSE endpoint for real-time conversation events.
   * Sends an initial connected event and keepalive pings every 15 seconds.
   * Real Redis pub/sub integration will replace this placeholder later.
   *
   * @param _req - The HTTP request object (unused)
   * @param user - Authenticated user from AuthGuard
   * @returns SSE event stream
   */
  @Get('/stream')
  @UseGuards(AuthGuard)
  async stream(_req: Request, user: AuthenticatedUser) {
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      start(controller) {
        // Send initial identity event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', userId: user.id })}\n\n`));
        // Keepalive every 15s
        const interval = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { clearInterval(interval); }
        }, 15000);
      },
      cancel() { /* cleanup handled by interval closure */ },
    });
    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  }
}
