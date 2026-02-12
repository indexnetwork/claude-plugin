import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { evalRuns, evalScenarioResults, evalNeeds } from "@/lib/db/schema";
import { USER_PERSONAS, type UserPersonaId } from "@/lib/scenarios";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const runs = await db
      .select({
        id: evalRuns.id,
        name: evalRuns.name,
        status: evalRuns.status,
        createdAt: evalRuns.createdAt,
      })
      .from(evalRuns)
      .where(eq(evalRuns.userId, userId))
      .orderBy(desc(evalRuns.createdAt))
      .limit(50);

    const withCounts = await Promise.all(
      runs.map(async (r) => {
        const results = await db
          .select({ status: evalScenarioResults.status })
          .from(evalScenarioResults)
          .where(eq(evalScenarioResults.evalRunId, r.id));
        const scenarioCount = results.length;
        const completedCount = results.filter(
          (x) => x.status === "completed" || x.status === "error"
        ).length;
        return {
          id: r.id,
          name: r.name,
          status: r.status,
          createdAt: r.createdAt,
          scenarioCount,
          completedCount,
        };
      })
    );

    return Response.json({ runs: withCounts });
  } catch (err) {
    console.error("list runs", err);
    return Response.json({ error: "Failed to list runs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const needs = await db
      .select()
      .from(evalNeeds)
      .where(eq(evalNeeds.enabled, true));

    if (needs.length === 0) {
      return Response.json(
        { error: "No test cases found. Seed test cases first." },
        { status: 400 }
      );
    }

    const personaIds = Object.keys(USER_PERSONAS) as UserPersonaId[];

    const scenarios = needs.flatMap((need) =>
      personaIds.map((personaId) => {
        const personaKey = USER_PERSONAS[personaId].id;
        const message =
          personaKey in need.messages
            ? need.messages[personaKey]
            : need.question;

        return {
          id: `${need.needId}-${personaId}`,
          needId: need.needId,
          personaId,
          message,
          category: need.category,
        };
      })
    );

    const [run] = await db
      .insert(evalRuns)
      .values({ userId, status: "draft" })
      .returning();

    if (!run) return Response.json({ error: "Failed to create run" }, { status: 500 });

    await db.insert(evalScenarioResults).values(
      scenarios.map((s) => ({
        evalRunId: run.id,
        scenarioId: s.id,
        needId: s.needId,
        personaId: s.personaId,
        category: s.category,
        message: s.message,
      }))
    );

    return Response.json({
      runId: run.id,
      scenarios: scenarios.map((s) => ({
        id: s.id,
        needId: s.needId,
        personaId: s.personaId,
        message: s.message,
        category: s.category,
      })),
    });
  } catch (err) {
    console.error("create run", err);
    return Response.json({ error: "Failed to create run" }, { status: 500 });
  }
}
