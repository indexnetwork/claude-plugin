import { z } from "zod";
import type { DefineTool, ToolDeps } from "./tool.helpers";
import { success, error, UUID_REGEX } from "./tool.helpers";
import { runDiscoverFromQuery } from "../support/opportunity.discover";
import { enrichOrCreate } from "../support/opportunity.enricher";
import { OpportunityPresenter, gatherPresenterContext } from "../agents/opportunity.presenter";
import { OpportunityEvaluator } from "../agents/opportunity.evaluator";
import type { EvaluatorEntity, EvaluatorInput } from "../agents/opportunity.evaluator";

export function createOpportunityTools(defineTool: DefineTool, deps: ToolDeps) {
  const { database, graphs, embedder } = deps;
  const presenter = new OpportunityPresenter();

  async function buildFallbackReasoning(
    partyUserIds: string[],
    context: { userId: string },
    hint?: string,
  ): Promise<{ reasoning: string; score: number }> {
    const partyNames = await Promise.all(
      partyUserIds.map(async (uid) => {
        const user = await database.getUser(uid);
        return user?.name ?? "Unknown";
      })
    );
    const introducerUser = await database.getUser(context.userId);
    const reasoning =
      `${introducerUser?.name ?? "A member"} believes ${partyNames.join(" and ")} should connect.` +
      (hint ? ` Context: ${hint}` : "");
    return { reasoning, score: 70 };
  }

  const createOpportunities = defineTool({
    name: "create_opportunities",
    description:
      "Creates opportunities (connections). Two modes:\n" +
      "1. **Discovery mode** (default): finds matching people via semantic search. Pass searchQuery and/or indexId. When searchQuery is omitted, uses the user's existing intents.\n" +
      "2. **Introduction mode**: when partyUserIds are provided (2+ user IDs from read_users), creates a direct introduction between those specific people. The current user becomes the introducer. You may omit indexId: the system finds indexes both people share, fetches their profiles and intents from those indexes, and creates the introduction. If you provide indexId, that index is used.\n\n" +
      "Use discovery mode when user asks to find opportunities, connections, who can help, etc. Use introduction mode when user wants to connect specific OTHER people (e.g. 'I think Alice and Bob should meet', 'introduce X to Y'). For introductions, pass partyUserIds; indexId is optional.\n\n" +
      "Results are saved as drafts; use send_opportunity when ready.",
    querySchema: z.object({
      searchQuery: z.string().optional().describe("Discovery mode: what kind of connections to search for; when omitted, uses the user's intents in scope."),
      indexId: z.string().optional().describe("Index UUID from read_indexes; optional when chat is index-scoped."),
      partyUserIds: z.array(z.string()).optional().describe("Introduction mode: user IDs of the people to introduce (at least 2). Get IDs from read_users or @mentions. indexId optional — system finds shared indexes and uses their intents."),
    }),
    handler: async ({ context, query }) => {
      const effectiveIndexId = (query.indexId?.trim() || context.indexId) ?? null;

      // ── Introduction mode: specific parties provided ──
      if (query.partyUserIds && query.partyUserIds.length >= 2) {
        return handleIntroduction(context, query.partyUserIds, effectiveIndexId, query.searchQuery?.trim());
      }

      // ── Discovery mode: semantic search ──
      const searchQuery = query.searchQuery?.trim() ?? "";

      let indexScope: string[];
      if (effectiveIndexId) {
        if (!UUID_REGEX.test(effectiveIndexId)) {
          return error("Invalid index ID format. Use the exact UUID from read_indexes.");
        }
        const memberResult = await graphs.indexMembership.invoke({
          userId: context.userId,
          indexId: effectiveIndexId,
          operationMode: 'read' as const,
        });
        if (memberResult.error) {
          return error("Index not found or you are not a member. Use read_indexes to see your indexes.");
        }
        indexScope = [effectiveIndexId];
      } else {
        const indexResult = await graphs.index.invoke({
          userId: context.userId,
          operationMode: 'read' as const,
          showAll: true,
        });
        indexScope = (indexResult.readResult?.memberOf || []).map((m: { indexId: string }) => m.indexId);
      }

      const result = await runDiscoverFromQuery({
        opportunityGraph: graphs.opportunity as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        database,
        userId: context.userId,
        query: searchQuery,
        indexScope,
        limit: 5,
        presenter,
      });

      if (!result.found) {
        return success({
          found: false,
          count: 0,
          message: result.message ?? "No matching opportunities found.",
        });
      }

      return success({
        found: true,
        count: result.count,
        opportunities: result.opportunities ?? [],
      });
    },
  });

  /**
   * Introduction mode handler: loads profiles & intents for specified parties,
   * runs the LLM evaluator to generate rich reasoning, then creates the opportunity.
   * When indexId is omitted, resolves shared indexes between the two people and
   * fetches their intents from those indexes (supports multiple shared indexes).
   */
  async function handleIntroduction(
    context: { userId: string; indexId?: string },
    partyUserIds: string[],
    effectiveIndexId: string | null,
    hint?: string,
  ): Promise<string> {
    let primaryIndexId: string;
    let sharedIndexIds: string[];

    if (effectiveIndexId && UUID_REGEX.test(effectiveIndexId)) {
      // Explicit index: validate and use it
      const isMember = await database.isIndexMember(effectiveIndexId, context.userId);
      if (!isMember) {
        return error("You are not a member of this index.");
      }
      for (const partyId of partyUserIds) {
        const partyIsMember = await database.isIndexMember(effectiveIndexId, partyId);
        if (!partyIsMember) {
          const partyUser = await database.getUser(partyId);
          return error(`${partyUser?.name ?? partyId} is not a member of this index.`);
        }
      }
      primaryIndexId = effectiveIndexId;
      sharedIndexIds = [effectiveIndexId];
    } else {
      // No index: resolve shared indexes between the two people
      const [membershipsA, membershipsB] = await Promise.all([
        database.getIndexMemberships(partyUserIds[0]!),
        database.getIndexMemberships(partyUserIds[1]!),
      ]);
      const indexIdsA = new Set(membershipsA.map((m) => m.indexId));
      const indexIdsB = new Set(membershipsB.map((m) => m.indexId));
      sharedIndexIds = [...indexIdsA].filter((id) => indexIdsB.has(id));

      if (sharedIndexIds.length === 0) {
        return error("These two people don't share any index. Introductions only work when they're in at least one common community.");
      }

      const introducerIsMemberOfShared = await Promise.all(
        sharedIndexIds.map((indexId) => database.isIndexMember(indexId, context.userId))
      );
      const introducerSharedIndex = sharedIndexIds.find((_, i) => introducerIsMemberOfShared[i]);
      if (!introducerSharedIndex) {
        return error("You must share an index with both people to introduce them.");
      }
      primaryIndexId = introducerSharedIndex;
    }

    // Check for existing opportunity in primary index (or any shared index when no index was specified)
    for (const indexId of sharedIndexIds) {
      const exists = await database.opportunityExistsBetweenActors(partyUserIds, indexId);
      if (exists) {
        return error("An opportunity already exists between these people in a shared index.");
      }
    }

    // Build entity bundles: profiles + intents from shared indexes (dedupe by intent id)
    const entities: EvaluatorEntity[] = await Promise.all(
      partyUserIds.map(async (uid) => {
        const profile = await database.getProfile(uid);
        const intentLists = await Promise.all(
          sharedIndexIds.map((indexId) => database.getIntentsInIndexForMember(uid, indexId))
        );
        const seen = new Set<string>();
        const activeIntents = intentLists.flat().filter((i) => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });
        return {
          userId: uid,
          profile: {
            name: profile?.identity?.name,
            bio: profile?.identity?.bio,
            location: profile?.identity?.location,
            interests: profile?.attributes?.interests,
            skills: profile?.attributes?.skills,
            context: profile?.narrative?.context,
          },
          intents: activeIntents.slice(0, 5).map((i) => ({
            intentId: i.id,
            payload: i.payload,
            summary: i.summary ?? undefined,
          })),
          indexId: primaryIndexId,
        };
      })
    );

    // Run the evaluator with ONLY the two parties (not the introducer). Reasoning must be about
    // why those two should meet; the introducer is added to actors afterward and must not appear in the match.
    const evaluator = new OpportunityEvaluator();
    const introducerUser = await database.getUser(context.userId);
    const input: EvaluatorInput = {
      discovererId: context.userId,
      entities,
      introductionMode: true,
      introducerName: introducerUser?.name ?? undefined,
      introductionHint: hint ?? undefined,
    };

    let reasoning: string;
    let score: number;
    let evaluatedActors: Array<{ userId: string; role: string; intentId?: string }> = [];

    try {
      const evaluated = await evaluator.invokeEntityBundle(input, { minScore: 0 });

      if (evaluated.length > 0) {
        const best = evaluated[0];
        reasoning = best.reasoning;
        score = best.score;
        evaluatedActors = best.actors.map((a) => ({ userId: a.userId, role: a.role, ...(a.intentId != null ? { intentId: a.intentId } : {}) }));
      } else {
        // Evaluator found no strong match; use a simple introducer-provided rationale.
        ({ reasoning, score } = await buildFallbackReasoning(partyUserIds, context, hint));
      }
    } catch (evalErr) {
      ({ reasoning, score } = await buildFallbackReasoning(partyUserIds, context, hint));
    }

    // Build actors: only use evaluator roles when all required parties are represented.
    const requiredPartyUserIds = partyUserIds.filter((uid) => uid !== context.userId);
    const evaluatorHasAllRequiredParties = requiredPartyUserIds.every((uid) =>
      evaluatedActors.some((a) => a.userId === uid)
    );
    const actors = evaluatorHasAllRequiredParties
      ? [
          ...evaluatedActors
            .filter((a) => a.userId !== context.userId)
            .map((a) => ({
              indexId: primaryIndexId,
              userId: a.userId,
              role: a.role as string,
              ...(a.intentId ? { intent: a.intentId } : {}),
            })),
          { indexId: primaryIndexId, userId: context.userId, role: 'introducer' },
        ]
      : [
          ...requiredPartyUserIds.map((uid) => ({ indexId: primaryIndexId, userId: uid, role: 'party' })),
          { indexId: primaryIndexId, userId: context.userId, role: 'introducer' },
        ];

    const confidence = score / 100;
    const data = {
      detection: {
        source: 'manual' as const,
        createdBy: context.userId,
        createdByName: introducerUser?.name ?? undefined,
        timestamp: new Date().toISOString(),
      },
      actors,
      interpretation: {
        category: 'collaboration' as const,
        reasoning,
        confidence,
        signals: [{ type: 'curator_judgment' as const, weight: 1, detail: `Introduction by ${introducerUser?.name ?? 'a member'} via chat` }],
      },
      context: { indexId: primaryIndexId },
      confidence: String(confidence),
      status: 'latent' as const,
    };

    const enrichment = await enrichOrCreate(database, embedder, data);
    const toCreate = enrichment.data;
    if (enrichment.enriched) {
      toCreate.status = enrichment.resolvedStatus;
    }
    const created = await database.createOpportunity(toCreate);

    if (enrichment.enriched && enrichment.expiredIds.length > 0) {
      for (const id of enrichment.expiredIds) {
        await database.updateOpportunityStatus(id, 'expired');
      }
    }

    // Resolve names for confirmation
    const partyNames = await Promise.all(
      partyUserIds.map(async (uid) => {
        const u = await database.getUser(uid);
        return u?.name ?? 'Unknown';
      })
    );

    return success({
      found: true,
      count: 1,
      opportunities: [{
        opportunityId: created.id,
        introduced: partyNames,
        matchReason: reasoning,
        score: confidence,
        status: 'latent',
      }],
      message: `Draft introduction created between ${partyNames.join(' and ')}. Review it and say "send intro" (or use send_opportunity) when you're ready to notify them.`,
    });
  }

  const listOpportunities = defineTool({
    name: "list_opportunities",
    description:
      "Lists the current user's opportunities (suggested connections). Only opportunities the user is allowed to see based on their role and the opportunity status are returned. When the chat is scoped to an index, you can omit indexId to list only opportunities in that index.",
    querySchema: z.object({
      indexId: z.string().optional().describe("Index UUID from read_indexes; optional when chat is index-scoped."),
    }),
    handler: async ({ context, query }) => {
      const effectiveIndexId = (query.indexId?.trim() || context.indexId) ?? undefined;
      if (effectiveIndexId && !UUID_REGEX.test(effectiveIndexId)) {
        return error("Invalid index ID format. Use the exact UUID from read_indexes.");
      }

      const result = await graphs.opportunity.invoke({
        userId: context.userId,
        indexId: effectiveIndexId,
        operationMode: 'read' as const,
      });

      if (!result.readResult) {
        return error("Failed to list opportunities.");
      }

      type ReadResultItem = (typeof result.readResult.opportunities)[number];
      const opps: ReadResultItem[] = result.readResult.opportunities;
      if (opps.length === 0) {
        return success(result.readResult);
      }

      const fullOpps = await Promise.all(
        opps.map((o: ReadResultItem) => database.getOpportunity(o.id))
      );
      const fullWithIndices = fullOpps
        .map((full, index) => ({ full, index }))
        .filter(
          (
            entry
          ): entry is { full: NonNullable<typeof entry.full>; index: number } =>
            entry.full != null
        );
      const contextsWithIndices = await Promise.all(
        fullWithIndices.map(async ({ full, index }) => ({
          index,
          context: await gatherPresenterContext(database, full, context.userId),
        }))
      );
      const contexts = contextsWithIndices.map(({ context }) => context);
      const presentations =
        contexts.length > 0
          ? await presenter.presentBatch(contexts, { concurrency: 5 })
          : [];
      const presentationByIndex = new Map<number, (typeof presentations)[0]>();
      for (let i = 0; i < contextsWithIndices.length; i++) {
        presentationByIndex.set(
          contextsWithIndices[i].index,
          presentations[i]
        );
      }
      const enriched = opps.map((item: ReadResultItem, i: number) => ({
        ...item,
        presentation: presentationByIndex.get(i),
      }));

      return success({
        ...result.readResult,
        opportunities: enriched,
      });
    },
  });

  const sendOpportunity = defineTool({
    name: "send_opportunity",
    description:
      "Sends a draft (latent) opportunity, promoting it to pending. The system notifies the appropriate next person based on actor roles (e.g., patient if sent by introducer, agent if sent by patient). Use after create_opportunities or list_opportunities when the user wants to send the intro.",
    querySchema: z.object({
      opportunityId: z.string().describe("The opportunity ID to send (from create_opportunities or list_opportunities)"),
    }),
    handler: async ({ context, query }) => {
      const result = await graphs.opportunity.invoke({
        userId: context.userId,
        operationMode: 'send' as const,
        opportunityId: query.opportunityId,
      });

      if (result.mutationResult) {
        if (result.mutationResult.success) {
          const opportunityId = result.mutationResult.opportunityId;
          let presentation: Awaited<
            ReturnType<OpportunityPresenter["present"]>
          > | undefined;
          if (opportunityId) {
            const opp = await database.getOpportunity(opportunityId);
            if (opp) {
              try {
                const ctx = await gatherPresenterContext(
                  database,
                  opp,
                  context.userId
                );
                presentation = await presenter.present(ctx);
              } catch {
                // non-fatal: return without presentation
              }
            }
          }
          return success({
            sent: true,
            opportunityId: result.mutationResult.opportunityId,
            notified: result.mutationResult.notified,
            message: result.mutationResult.message,
            ...(presentation && { presentation }),
          });
        }
        return error(result.mutationResult.error || "Failed to send opportunity.");
      }
      return error("Failed to send opportunity.");
    },
  });

  return [createOpportunities, listOpportunities, sendOpportunity] as const;
}
