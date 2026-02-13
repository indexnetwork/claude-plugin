import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { evalRuns, evalScenarioResults } from "@/lib/db/schema";
import { loadPregeneratedScenarios } from "@/lib/scenarios";
import { scenarioToGenerated, runChatEvaluation } from "@/lib/evaluator";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const auth = req.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token)
    return Response.json({ error: "Missing Authorization header" }, { status: 401 });

  let body: {
    scenarioId?: string;
    scenarioIds?: string[];
    runId?: string;
    apiUrl?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiUrl =
    body.apiUrl?.trim() ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001/api";
  const runId = body.runId?.trim();
  const scenarios = loadPregeneratedScenarios();

  const ids = body.scenarioIds?.length
    ? body.scenarioIds
    : body.scenarioId
      ? [body.scenarioId]
      : [];

  if (ids.length === 0)
    return Response.json({ error: "Provide scenarioId or scenarioIds" }, { status: 400 });

  // If runId provided, verify ownership
  if (runId) {
    const [run] = await db
      .select()
      .from(evalRuns)
      .where(and(eq(evalRuns.id, runId), eq(evalRuns.userId, userId)));
    if (!run)
      return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const results = [];

  for (const scenarioId of ids) {
    const s = scenarios.find((x) => x.id === scenarioId);
    if (!s) {
      results.push({ scenarioId, error: "Scenario not found" });
      continue;
    }

    try {
      if (runId) {
        await db
          .update(evalScenarioResults)
          .set({ status: "running", updatedAt: new Date() })
          .where(
            and(
              eq(evalScenarioResults.evalRunId, runId),
              eq(evalScenarioResults.scenarioId, scenarioId)
            )
          );
      }

      const generated = scenarioToGenerated(s);
      const result = await runChatEvaluation(generated, { apiUrl, token });
      results.push(result);

      if (runId) {
        await db
          .update(evalScenarioResults)
          .set({
            status: "completed",
            conversation: result.conversation,
            result: {
              verdict: result.verdict,
              fulfillmentScore: result.fulfillmentScore,
              qualityScore: result.qualityScore,
              reasoning: result.reasoning,
              successSignals: result.successSignals,
              failureSignals: result.failureSignals,
              turns: result.turns,
              duration: result.durationMs,
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(evalScenarioResults.evalRunId, runId),
              eq(evalScenarioResults.scenarioId, scenarioId)
            )
          );
      }
    } catch (err) {
      results.push({
        scenarioId,
        error: err instanceof Error ? err.message : "Evaluation failed",
      });
      if (runId) {
        await db
          .update(evalScenarioResults)
          .set({ status: "error", updatedAt: new Date() })
          .where(
            and(
              eq(evalScenarioResults.evalRunId, runId),
              eq(evalScenarioResults.scenarioId, scenarioId)
            )
          );
      }
    }
  }

  return Response.json({ results });
}
