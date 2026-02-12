import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { evalNeeds } from "@/lib/db/schema";
import { generatePersonaMessages } from "@/lib/evaluator";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ needId: string }> }
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { needId } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.category !== undefined) updates.category = body.category;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    // If question or expectation changed, re-generate persona messages
    const needsRegeneration = body.question !== undefined || body.expectation !== undefined;

    if (body.question !== undefined) updates.question = body.question;
    if (body.expectation !== undefined) updates.expectation = body.expectation;

    if (needsRegeneration) {
      // Fetch current values for fields not provided
      const [current] = await db
        .select()
        .from(evalNeeds)
        .where(eq(evalNeeds.id, needId));
      if (!current)
        return Response.json({ error: "Need not found" }, { status: 404 });

      const question = body.question ?? current.question;
      const expectation = body.expectation ?? current.expectation;
      updates.messages = await generatePersonaMessages(question, expectation);
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(evalNeeds)
      .set(updates)
      .where(eq(evalNeeds.id, needId))
      .returning();

    if (!updated)
      return Response.json({ error: "Need not found" }, { status: 404 });

    return Response.json({ need: updated });
  } catch (err) {
    console.error("update need", err);
    return Response.json({ error: "Failed to update need" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ needId: string }> }
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { needId } = await params;

  try {
    const [deleted] = await db
      .delete(evalNeeds)
      .where(eq(evalNeeds.id, needId))
      .returning();

    if (!deleted)
      return Response.json({ error: "Need not found" }, { status: 404 });

    return Response.json({ success: true });
  } catch (err) {
    console.error("delete need", err);
    return Response.json({ error: "Failed to delete need" }, { status: 500 });
  }
}
