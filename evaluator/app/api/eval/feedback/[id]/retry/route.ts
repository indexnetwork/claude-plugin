import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { userFeedback } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendMessage } from "@/lib/chat-client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { apiUrl?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const apiUrl =
    body.apiUrl ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001/api";

  const token = req.headers.get("Authorization")?.slice(7);
  if (!token)
    return Response.json({ error: "Missing token" }, { status: 401 });

  try {
    const [entry] = await db
      .select()
      .from(userFeedback)
      .where(and(eq(userFeedback.id, id), eq(userFeedback.userId, userId)));

    if (!entry)
      return Response.json({ error: "Feedback not found" }, { status: 404 });

    if (!entry.conversation?.length)
      return Response.json(
        { error: "No conversation to retry" },
        { status: 400 }
      );

    await db
      .update(userFeedback)
      .set({ retryStatus: "running", retryConversation: null })
      .where(eq(userFeedback.id, id));

    const userMessages = entry.conversation.filter((m) => m.role === "user");
    const retryConversation: Array<{ role: string; content: string }> = [];
    let sessionId: string | undefined;

    for (const msg of userMessages) {
      const result = await sendMessage(apiUrl, token, {
        message: msg.content,
        sessionId,
      });

      retryConversation.push({ role: "user", content: msg.content });
      retryConversation.push({
        role: "assistant",
        content: result.error
          ? `[Error: ${result.error}]`
          : result.response,
      });

      if (result.sessionId) sessionId = result.sessionId;
      if (result.error) break;
    }

    await db
      .update(userFeedback)
      .set({ retryStatus: "completed", retryConversation })
      .where(eq(userFeedback.id, id));

    return Response.json({ ok: true, retryConversation });
  } catch (err) {
    console.error("Retry failed", err);
    await db
      .update(userFeedback)
      .set({ retryStatus: "error" })
      .where(eq(userFeedback.id, id));
    return Response.json({ error: "Retry failed" }, { status: 500 });
  }
}
