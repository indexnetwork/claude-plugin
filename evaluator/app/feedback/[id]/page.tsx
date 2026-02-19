"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  RotateCcw,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import OpportunityCard, { parseOpportunityBlocks } from "@/components/OpportunityCard";

interface FeedbackEntry {
  id: string;
  userId: string;
  feedback: string;
  sessionId: string | null;
  conversation: Array<{ role: string; content: string }> | null;
  retryConversation: Array<{ role: string; content: string }> | null;
  retryStatus: string | null;
  archived: boolean;
  createdAt: string;
}

function AssistantContent({ content }: { content: string }) {
  const segments = parseOpportunityBlocks(content);
  return (
    <article className="chat-markdown max-w-none">
      {segments.map((segment, idx) => {
        if (segment.type === "text") {
          return (
            <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]}>
              {segment.content}
            </ReactMarkdown>
          );
        } else if (segment.type === "opportunity") {
          return (
            <div key={idx} className="my-3">
              <OpportunityCard card={segment.data} />
            </div>
          );
        }
        return null;
      })}
    </article>
  );
}

function ConversationView({
  messages,
}: {
  messages: Array<{ role: string; content: string }>;
}) {
  return (
    <div className="space-y-4">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-sm px-3 py-2 ${
              msg.role === "user"
                ? "bg-[#041729] text-white"
                : "bg-gray-100 text-gray-900"
            }`}
          >
            {msg.role === "assistant" && (
              <span className="text-[10px] uppercase tracking-wider text-[#4091BB]/70 mb-1 block">
                Index
              </span>
            )}
            {msg.role === "assistant" ? (
              <AssistantContent content={msg.content} />
            ) : (
              <article className="chat-markdown max-w-none chat-markdown-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </article>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedbackDetailPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<FeedbackEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : null;
  }, [getAccessToken]);

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/eval/feedback", { headers });
      if (!res.ok) return;
      const data = await res.json();
      const found = (data.feedback || []).find(
        (e: FeedbackEntry) => e.id === params.id
      );
      if (found) {
        setEntry(found);
      } else {
        setNotFound(true);
      }
    } catch (e) {
      console.error("Failed to fetch feedback", e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, params.id]);

  useEffect(() => {
    if (authenticated) fetchEntry();
  }, [authenticated, fetchEntry]);

  const retryFeedback = async () => {
    if (!entry) return;
    setRetrying(true);
    setEntry((prev) =>
      prev ? { ...prev, retryConversation: [], retryStatus: "running" } : prev
    );

    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch(`/api/eval/feedback/${entry.id}/retry`, {
        method: "POST",
        headers,
        body: JSON.stringify({ apiUrl }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "user" || event.type === "assistant") {
              const msg = { role: event.type, content: event.content };
              setEntry((prev) =>
                prev
                  ? { ...prev, retryConversation: [...(prev.retryConversation ?? []), msg] }
                  : prev
              );
            } else if (event.type === "done") {
              setEntry((prev) =>
                prev ? { ...prev, retryStatus: "completed" } : prev
              );
            } else if (event.type === "error") {
              setEntry((prev) =>
                prev ? { ...prev, retryStatus: "error" } : prev
              );
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e) {
      console.error("Retry failed", e);
      setEntry((prev) =>
        prev ? { ...prev, retryStatus: "error" } : prev
      );
    } finally {
      setRetrying(false);
    }
  };

  const archiveFeedback = async () => {
    if (!entry) return;
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch(`/api/eval/feedback/${entry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      });
      if (res.ok) router.push("/feedback");
    } catch (e) {
      console.error("Archive failed", e);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-gray-600">Sign in to view feedback</p>
        <button
          onClick={login}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Log in
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notFound || !entry) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Feedback not found</p>
        <button
          onClick={() => router.push("/feedback")}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" /> Back to feedback
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/feedback")}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Feedback Detail</h1>
        </div>

        {/* Feedback text */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Feedback</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
              <button
                onClick={archiveFeedback}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Archive
              </button>
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-sm">{entry.feedback}</div>
          {entry.sessionId && (
            <p className="mt-2 text-xs text-gray-400">
              Session: {entry.sessionId}
            </p>
          )}
        </div>

        {/* Original conversation */}
        {entry.conversation && entry.conversation.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">
                Original Conversation ({entry.conversation.length} messages)
              </h3>
              <button
                onClick={retryFeedback}
                disabled={retrying}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Retrying...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" /> Retry
                  </>
                )}
              </button>
            </div>
            <ConversationView messages={entry.conversation} />
          </div>
        )}

        {/* Retry conversation */}
        {entry.retryConversation && entry.retryConversation.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-base font-semibold mb-4">
              Retry Conversation ({entry.retryConversation.length} messages)
            </h3>
            <ConversationView messages={entry.retryConversation} />
          </div>
        )}

        {/* No conversation */}
        {!entry.conversation && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-400">
            <p className="text-sm">No conversation was captured with this feedback</p>
          </div>
        )}
      </div>
    </div>
  );
}
