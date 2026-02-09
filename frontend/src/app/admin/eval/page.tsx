"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Play, Square, RotateCcw, CheckCircle2, XCircle, AlertCircle, Loader2, Circle, Download } from "lucide-react";

interface Scenario {
  id: string;
  need: string;
  persona: string;
  message: string;
  category: string;
  tools: string[];
  status: "pending" | "running" | "completed" | "error";
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  result?: {
    verdict: "success" | "partial" | "failure" | "blocked" | "misunderstood";
    fulfillmentScore: number;
    qualityScore: number;
    reasoning: string;
    successSignals?: string[];
    failureSignals?: string[];
    turns: number;
    duration: number;
  };
}

export default function EvalDashboardPage() {
  const { getAccessToken } = usePrivy();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [globalStatus, setGlobalStatus] = useState<"idle" | "loading" | "running" | "completed">("idle");
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterTool, setFilterTool] = useState<string>("all");
  const cancelRef = useRef(false);

  // ── Derived state ──────────────────────────────────────────────────────

  const filterOptions = useMemo(() => {
    const personas = new Set<string>();
    const categories = new Set<string>();
    const tools = new Set<string>();
    for (const s of scenarios) {
      if (s.persona) personas.add(s.persona);
      if (s.category) categories.add(s.category);
      for (const t of s.tools ?? []) tools.add(t);
    }
    return {
      personas: [...personas].sort(),
      categories: [...categories].sort(),
      tools: [...tools].sort(),
    };
  }, [scenarios]);

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((s) => {
      if (filterPersona !== "all" && s.persona !== filterPersona) return false;
      if (filterCategory !== "all" && s.category !== filterCategory) return false;
      if (filterTool !== "all" && !(s.tools ?? []).includes(filterTool)) return false;
      return true;
    });
  }, [scenarios, filterPersona, filterCategory, filterTool]);

  const hasActiveFilters = filterPersona !== "all" || filterCategory !== "all" || filterTool !== "all";

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId);

  // Metrics computed from the visible (filtered) set
  const metrics = useMemo(() => {
    const set = filteredScenarios;
    const completed = set.filter((s) => s.status === "completed");
    const total = set.length;
    const completedCount = completed.length;
    const success = completed.filter((s) => s.result?.verdict === "success").length;
    const partial = completed.filter((s) => s.result?.verdict === "partial").length;
    const failure = completed.filter((s) => s.result?.verdict === "failure").length;
    const blocked = completed.filter((s) => s.result?.verdict === "blocked").length;
    const avgFulfillment = completedCount > 0
      ? completed.reduce((sum, s) => sum + (s.result?.fulfillmentScore || 0), 0) / completedCount
      : 0;
    const avgQuality = completedCount > 0
      ? completed.reduce((sum, s) => sum + (s.result?.qualityScore || 0), 0) / completedCount
      : 0;
    return { total, completed: completedCount, success, partial, failure, blocked, avgFulfillment, avgQuality };
  }, [filteredScenarios]);

  // ── SSE ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let es: EventSource | null = null;

    const connectSSE = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
        es = new EventSource(`${apiUrl}/eval/stream?token=${token}`);

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleEvent(data);
          } catch (error) {
            console.error("Failed to parse SSE event:", error);
          }
        };

        es.onerror = (error) => {
          console.error("SSE error:", error);
        };
      } catch (error) {
        console.error("Failed to connect:", error);
      }
    };

    connectSSE();
    return () => { if (es) es.close(); };
  }, [getAccessToken]);

  const handleEvent = (event: any) => {
    switch (event.type) {
      case "scenarios_generated": {
        const list: Scenario[] = (event.data.scenarios || []).map((s: any) => ({
          id: s.id,
          need: s.need || s.needId,
          persona: s.persona || s.personaId,
          message: s.message,
          category: s.category || "",
          tools: s.tools || [],
          status: "pending",
        }));
        setScenarios(list);
        setGlobalStatus("idle");
        break;
      }

      case "scenario_started":
        setScenarios((prev) =>
          prev.map((s) =>
            s.id === event.data.scenarioId
              ? { ...s, status: "running", conversation: [{ role: "user", content: event.data.initialMessage }] }
              : s
          )
        );
        break;

      case "turn_completed":
        setScenarios((prev) =>
          prev.map((s) => {
            if (s.id !== event.data.scenarioId) return s;
            const conv = [...(s.conversation || [])];
            if (!conv.find((m) => m.role === "assistant" && m.content === event.data.agentResponse)) {
              conv.push({ role: "assistant", content: event.data.agentResponse });
            }
            if (event.data.userMessage && event.data.turnNumber > 1) {
              conv.push({ role: "user", content: event.data.userMessage });
            }
            return { ...s, conversation: conv };
          })
        );
        break;

      case "scenario_completed":
        setScenarios((prev) =>
          prev.map((s) =>
            s.id === event.data.scenarioId
              ? {
                  ...s,
                  status: "completed" as const,
                  conversation: event.data.conversation || s.conversation || [],
                  result: {
                    verdict: event.data.verdict,
                    fulfillmentScore: event.data.fulfillmentScore,
                    qualityScore: event.data.qualityScore,
                    reasoning: event.data.reasoning,
                    successSignals: event.data.successSignals,
                    failureSignals: event.data.failureSignals,
                    turns: event.data.turns,
                    duration: event.data.duration,
                  },
                }
              : s
          )
        );
        break;

      case "suite_completed":
        setGlobalStatus("completed");
        break;
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────────

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

  const loadScenarios = async () => {
    try {
      setGlobalStatus("loading");
      const token = await getAccessToken();
      if (!token) { alert("Please log in"); setGlobalStatus("idle"); return; }

      const response = await fetch(`${apiUrl}/eval/generate-scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load scenarios");

      const data = await response.json();
      const list: Scenario[] = (data.scenarios || []).map((s: any) => ({
        id: s.id,
        need: s.needId,
        persona: s.personaId,
        message: s.message,
        category: s.category || "",
        tools: s.tools || [],
        status: "pending",
      }));

      setScenarios(list);
      setGlobalStatus("idle");
    } catch (error) {
      console.error("Failed to load scenarios:", error);
      alert("Failed to load scenarios");
      setGlobalStatus("idle");
    }
  };

  const runScenario = async (scenarioId: string) => {
    try {
      const token = await getAccessToken();
      if (!token) { alert("Please log in"); return; }

      setScenarios((prev) =>
        prev.map((s) => (s.id === scenarioId ? { ...s, status: "running", conversation: [] } : s))
      );

      const response = await fetch(`${apiUrl}/eval/run-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) throw new Error("Failed to run scenario");
    } catch (error) {
      console.error("Failed to run scenario:", error);
      setScenarios((prev) => prev.map((s) => (s.id === scenarioId ? { ...s, status: "error" } : s)));
    }
  };

  const runFiltered = async () => {
    const pending = filteredScenarios.filter((s) => s.status === "pending" || s.status === "error");
    if (pending.length === 0) return;

    cancelRef.current = false;
    setGlobalStatus("running");

    const token = await getAccessToken();
    if (!token) { alert("Please log in"); setGlobalStatus("idle"); return; }

    // Run filtered scenarios sequentially (each fires SSE events)
    for (const scenario of pending) {
      if (cancelRef.current) break;

      setScenarios((prev) =>
        prev.map((s) => (s.id === scenario.id ? { ...s, status: "running", conversation: [] } : s))
      );

      try {
        const response = await fetch(`${apiUrl}/eval/run-scenario`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ scenarioId: scenario.id }),
        });
        if (!response.ok) throw new Error("Failed");

        // Wait for this scenario to finish before starting next
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            setScenarios((prev) => {
              const s = prev.find((x) => x.id === scenario.id);
              if (s && (s.status === "completed" || s.status === "error")) {
                clearInterval(check);
                resolve();
              }
              return prev;
            });
          }, 500);
        });
      } catch {
        setScenarios((prev) =>
          prev.map((s) => (s.id === scenario.id ? { ...s, status: "error" } : s))
        );
      }
    }

    setGlobalStatus("completed");
  };

  const stopAll = () => {
    cancelRef.current = true;
    setGlobalStatus("idle");
    getAccessToken().then((token) => {
      if (token) {
        fetch(`${apiUrl}/eval/stop`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      }
    });
  };

  const restartAll = () => {
    cancelRef.current = true;
    setScenarios([]);
    setSelectedScenarioId(null);
    setFilterPersona("all");
    setFilterCategory("all");
    setFilterTool("all");
    setGlobalStatus("idle");
  };

  const exportFiltered = () => {
    const completed = filteredScenarios.filter((s) => s.status === "completed");
    if (completed.length === 0) { alert("No completed scenarios to export"); return; }

    const exportData = {
      exportedAt: new Date().toISOString(),
      filters: { persona: filterPersona, category: filterCategory, tool: filterTool },
      summary: {
        total: metrics.total,
        completed: metrics.completed,
        success: metrics.success,
        partial: metrics.partial,
        failure: metrics.failure,
        blocked: metrics.blocked,
        avgFulfillment: metrics.avgFulfillment,
        avgQuality: metrics.avgQuality,
        successRate: metrics.completed > 0 ? (metrics.success / metrics.completed) * 100 : 0,
      },
      scenarios: completed.map((s) => ({
        id: s.id, need: s.need, persona: s.persona, category: s.category, tools: s.tools,
        initialMessage: s.message, conversation: s.conversation, result: s.result,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eval-results-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Circle className="w-3 h-3 text-gray-400" />;
      case "running": return <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />;
      case "completed": return <CheckCircle2 className="w-3 h-3 text-green-600" />;
      case "error": return <XCircle className="w-3 h-3 text-red-600" />;
      default: return <Circle className="w-3 h-3 text-gray-400" />;
    }
  };

  const verdictStyles: Record<string, { bg: string; text: string; Icon: any }> = {
    success: { bg: "bg-green-100", text: "text-green-800", Icon: CheckCircle2 },
    partial: { bg: "bg-yellow-100", text: "text-yellow-800", Icon: AlertCircle },
    failure: { bg: "bg-red-100", text: "text-red-800", Icon: XCircle },
    blocked: { bg: "bg-gray-100", text: "text-gray-800", Icon: Square },
    misunderstood: { bg: "bg-purple-100", text: "text-purple-800", Icon: AlertCircle },
  };

  const getVerdictBadge = (verdict: string) => {
    const s = verdictStyles[verdict] || verdictStyles.failure;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${s.bg} ${s.text}`}>
        <s.Icon className="w-3 h-3" />
        {verdict}
      </span>
    );
  };

  const pendingInView = filteredScenarios.filter((s) => s.status === "pending" || s.status === "error").length;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar — title + load/restart */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Agent Evaluation</h1>
        <div className="flex items-center gap-2">
          {scenarios.length === 0 ? (
            <button
              onClick={loadScenarios}
              disabled={globalStatus === "loading"}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {globalStatus === "loading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : <><Play className="w-4 h-4" /> Load Scenarios</>}
            </button>
          ) : (
            <button
              onClick={restartAll}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left sidebar: filters + run controls + list ── */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

          {/* Filters */}
          {scenarios.length > 0 && (
            <div className="p-3 border-b border-gray-200 flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setFilterPersona("all"); setFilterCategory("all"); setFilterTool("all"); }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All categories</option>
                {filterOptions.categories.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
              <select
                value={filterPersona}
                onChange={(e) => setFilterPersona(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All personas</option>
                {filterOptions.personas.map((p) => (
                  <option key={p} value={p}>{p.replace(/_/g, " ").toLowerCase()}</option>
                ))}
              </select>
              <select
                value={filterTool}
                onChange={(e) => setFilterTool(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All tools</option>
                {filterOptions.tools.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Run controls — scoped to filtered set */}
          {scenarios.length > 0 && (
            <div className="p-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                {globalStatus !== "running" ? (
                  <button
                    onClick={runFiltered}
                    disabled={pendingInView === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm font-medium"
                  >
                    <Play className="w-4 h-4" />
                    Run {hasActiveFilters ? `${pendingInView} filtered` : `all ${pendingInView}`}
                  </button>
                ) : (
                  <button
                    onClick={stopAll}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                )}
                <button
                  onClick={exportFiltered}
                  disabled={metrics.completed === 0}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg disabled:opacity-40"
                  title="Export completed scenarios"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>

              {/* Inline metrics */}
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>{metrics.total} scenarios</span>
                {metrics.completed > 0 && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-green-600 font-medium">{metrics.success} pass</span>
                    {metrics.partial > 0 && <span className="text-yellow-600 font-medium">{metrics.partial} partial</span>}
                    {metrics.failure > 0 && <span className="text-red-600 font-medium">{metrics.failure} fail</span>}
                    {metrics.blocked > 0 && <span className="text-gray-500 font-medium">{metrics.blocked} blocked</span>}
                  </>
                )}
              </div>
              {metrics.completed > 0 && (
                <div className="mt-1.5 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                  {metrics.success > 0 && <div className="bg-green-500 h-full" style={{ width: `${(metrics.success / metrics.total) * 100}%` }} />}
                  {metrics.partial > 0 && <div className="bg-yellow-400 h-full" style={{ width: `${(metrics.partial / metrics.total) * 100}%` }} />}
                  {metrics.failure > 0 && <div className="bg-red-500 h-full" style={{ width: `${(metrics.failure / metrics.total) * 100}%` }} />}
                  {metrics.blocked > 0 && <div className="bg-gray-400 h-full" style={{ width: `${(metrics.blocked / metrics.total) * 100}%` }} />}
                </div>
              )}
            </div>
          )}

          {/* Scenario list */}
          {scenarios.length === 0 ? (
            <div className="p-8 text-center text-gray-500 flex-1 flex items-center justify-center">
              <p className="text-sm">Load scenarios to begin</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
              {filteredScenarios.map((scenario, idx) => (
                <div
                  key={scenario.id}
                  className={`flex items-start gap-2 hover:bg-gray-50 transition-colors cursor-pointer ${
                    selectedScenarioId === scenario.id ? "bg-blue-50 border-l-4 border-l-blue-600" : ""
                  }`}
                >
                  <button
                    onClick={() => setSelectedScenarioId(scenario.id)}
                    className="flex-1 text-left px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getStatusIcon(scenario.status)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
                          {scenario.result && <span className="text-xs">{getVerdictBadge(scenario.result.verdict)}</span>}
                        </div>
                        <p className="text-sm text-gray-800 line-clamp-2 mb-1">{scenario.message}</p>
                        <div className="flex items-center gap-1 flex-wrap text-xs text-gray-500">
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded">{scenario.category?.replace(/_/g, " ") || "—"}</span>
                          <span className="text-gray-300">·</span>
                          <span>{scenario.persona?.replace(/_/g, " ").toLowerCase()}</span>
                        </div>
                        {scenario.result && (
                          <div className="mt-1 text-xs text-gray-500">
                            {(scenario.result.fulfillmentScore * 100).toFixed(0)}% · {scenario.result.turns} turns
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  {(scenario.status === "pending" || scenario.status === "error") && globalStatus !== "running" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); runScenario(scenario.id); }}
                      className="mt-3 mr-3 p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Run this scenario"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel: detail view ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedScenario ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Circle className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                <p>Select a scenario to view details</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">Scenario Details</h2>
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded font-medium text-xs">
                        {selectedScenario.category?.replace(/_/g, " ") || "—"}
                      </span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium text-xs">
                        {selectedScenario.need}
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-medium text-xs">
                        {selectedScenario.persona?.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(selectedScenario.status)}
                        <span className="text-gray-600 capitalize text-xs">{selectedScenario.status}</span>
                      </span>
                    </div>
                    {selectedScenario.tools && selectedScenario.tools.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <span className="text-xs text-gray-500">Expected tools:</span>
                        {selectedScenario.tools.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-mono border border-amber-200">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedScenario.result && (
                    <div className="text-right">
                      {getVerdictBadge(selectedScenario.result.verdict)}
                      <div className="mt-2 text-sm text-gray-600">
                        {(selectedScenario.result.fulfillmentScore * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Initial Query</div>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-900">{selectedScenario.message}</div>
                </div>
              </div>

              {/* Conversation */}
              {selectedScenario.conversation && selectedScenario.conversation.length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Conversation ({selectedScenario.conversation.length} messages)
                  </h3>
                  <div className="space-y-4">
                    {selectedScenario.conversation.map((msg, idx) => (
                      <div key={idx}>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                          {msg.role === "user" ? "User" : "Agent"}
                        </div>
                        <div
                          className={`p-4 rounded-lg text-sm ${
                            msg.role === "user"
                              ? "bg-blue-50 border border-blue-200 text-gray-900"
                              : "bg-green-50 border border-green-200 text-gray-900"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Conversation</h3>
                  <div className="text-gray-500 text-center py-8 text-sm">
                    {selectedScenario.status === "running" ? "Waiting for agent responses..." : "No conversation data yet"}
                  </div>
                </div>
              )}

              {/* Results */}
              {selectedScenario.result && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Evaluation Results</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Fulfillment</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {(selectedScenario.result.fulfillmentScore * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Quality</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {(selectedScenario.result.qualityScore * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Duration</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {(selectedScenario.result.duration / 1000).toFixed(1)}s
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-gray-900 mb-2">Reasoning</div>
                      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-700 leading-relaxed">
                        {selectedScenario.result.reasoning}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {selectedScenario.result.successSignals && selectedScenario.result.successSignals.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-green-800 mb-2">Success Signals</div>
                          <div className="space-y-1.5">
                            {selectedScenario.result.successSignals.map((signal, i) => (
                              <div key={i} className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                                {signal}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedScenario.result.failureSignals && selectedScenario.result.failureSignals.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-red-800 mb-2">Failure Signals</div>
                          <div className="space-y-1.5">
                            {selectedScenario.result.failureSignals.map((signal, i) => (
                              <div key={i} className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                                {signal}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
