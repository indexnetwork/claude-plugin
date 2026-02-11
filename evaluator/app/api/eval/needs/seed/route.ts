import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { evalNeeds } from "@/lib/db/schema";
import { CHAT_AGENT_USER_NEEDS } from "@/lib/scenarios";

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const entries = Object.entries(CHAT_AGENT_USER_NEEDS);
    let upserted = 0;

    for (const [key, need] of entries) {
      await db
        .insert(evalNeeds)
        .values({
          needId: key,
          category: need.category,
          question: need.question,
          expectation: need.expectation,
          messages: { ...need.messages },
        })
        .onConflictDoUpdate({
          target: evalNeeds.needId,
          set: {
            category: need.category,
            question: need.question,
            expectation: need.expectation,
            messages: { ...need.messages },
            updatedAt: new Date(),
          },
        });
      upserted++;
    }

    return Response.json({ upserted });
  } catch (err) {
    console.error("seed needs", err);
    return Response.json({ error: "Failed to seed needs" }, { status: 500 });
  }
}
