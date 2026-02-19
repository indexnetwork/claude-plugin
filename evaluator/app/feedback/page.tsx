"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MessageSquare,
  RefreshCw,
  X,
  ArrowLeft,
} from "lucide-react";

interface FeedbackEntry {
  id: string;
  userId: string;
  feedback: string;
  sessionId: string | null;
  conversation: Array<{ role: string; content: string }> | null;
  retryStatus: string | null;
  archived: boolean;
  createdAt: string;
}

export default function FeedbackListPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const router = useRouter();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : null;
  }, [getAccessToken]);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/eval/feedback", { headers });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.feedback || []);
      }
    } catch (e) {
      console.error("Failed to fetch feedback", e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (authenticated) fetchFeedback();
  }, [authenticated, fetchFeedback]);

  const archiveFeedback = async (id: string) => {
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch(`/api/eval/feedback/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Feedback</h1>
            <span className="text-sm text-gray-500">{entries.length} entries</span>
          </div>
          <button
            onClick={fetchFeedback}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && entries.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading feedback...
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p>No feedback yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-lg shadow-sm border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <button
                  onClick={() => router.push(`/feedback/${entry.id}`)}
                  className="w-full text-left px-5 py-4"
                >
                  <p className="text-sm text-gray-800 line-clamp-2 mb-2">
                    {entry.feedback}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    {entry.conversation && (
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {entry.conversation.length} msgs
                      </span>
                    )}
                    {entry.retryStatus === "completed" && (
                      <span className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                        retried
                      </span>
                    )}
                  </div>
                </button>
                <div className="px-5 pb-3 flex justify-end">
                  <button
                    onClick={() => archiveFeedback(entry.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <X className="w-3 h-3" /> Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
