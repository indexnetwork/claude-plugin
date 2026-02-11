import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { evalRuns, evalScenarioResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;

  try {
    const [run] = await db
      .select()
      .from(evalRuns)
      .where(and(eq(evalRuns.id, runId), eq(evalRuns.userId, userId)));

    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

    const results = await db
      .select()
      .from(evalScenarioResults)
      .where(eq(evalScenarioResults.evalRunId, runId))
      .orderBy(evalScenarioResults.createdAt);

    const scenarios = results.map((r) => ({
      id: r.scenarioId,
      need: r.needId,
      needId: r.needId,
      persona: r.personaId,
      personaId: r.personaId,
      message: r.message,
      category: r.category,
      status: r.status,
      conversation: r.conversation,
      result: r.result,
      reviewFlag: r.reviewFlag,
      reviewNote: r.reviewNote,
    }));

    return Response.json({
      run: { id: run.id, name: run.name, status: run.status, createdAt: run.createdAt },
      scenarios,
    });
  } catch (err) {
    console.error("get run", err);
    return Response.json({ error: "Failed to get run" }, { status: 500 });
  }
}
