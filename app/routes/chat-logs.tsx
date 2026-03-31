import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/chat-logs";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Chat Logs – Admin Panel" }];
}

interface ChatLog {
  id: number;
  session_id: string;
  user_message: string;
  bot_response: string;
  source: "nlp" | "llm" | "escalation";
  confidence: number;
  intent_id: string | null;
  created_at: string;
}

interface ChatStats {
  total: string;
  nlp_count: string;
  llm_count: string;
  escalation_count: string;
  unique_sessions: string;
  avg_confidence: string;
  last_24h: string;
  last_7d: string;
}

const SOURCE_COLORS: Record<string, string> = {
  nlp: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  llm: "bg-violet-100 text-violet-800 border border-violet-300",
  escalation: "bg-red-100 text-red-800 border border-red-300",
};

const SOURCE_FILTERS = [
  { label: "All", value: "" },
  { label: "NLP", value: "nlp" },
  { label: "LLM", value: "llm" },
  { label: "Escalation", value: "escalation" },
];

export default function ChatLogs() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = 50;

  const fetchLogs = async (off = 0, src = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: limit.toString(), offset: off.toString() });
      if (src) params.append("source", src);
      const token = await getToken();
      const res = await fetch(`/api/chat-logs?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setStats(data.stats || null);
    } catch (e: any) {
      setError(e.message || "Failed to load chat logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    fetchLogs(offset, sourceFilter);
  }, [isAuthorized, offset, sourceFilter]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500" />
      </div>
    );
  }

  if (!isAuthorized) return null;

  const totalFromStats = stats ? parseInt(stats.total) : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />

      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-['Clash_Display'] text-4xl font-bold text-neutral-900 md:text-5xl">
            Chat Logs
          </h1>
          <p className="mt-2 font-['Satoshi'] text-neutral-500">
            Support conversations from the chat widget — last 30 days
          </p>
        </motion.div>

        {/* Stats */}
        {stats && (
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {[
              { label: "Total (30d)", value: stats.total, color: "bg-violet-500" },
              { label: "Last 24h", value: stats.last_24h, color: "bg-pink-500" },
              { label: "Last 7d", value: stats.last_7d, color: "bg-amber-500" },
              { label: "Sessions", value: stats.unique_sessions, color: "bg-teal-500" },
              { label: "NLP", value: stats.nlp_count, color: "bg-emerald-500" },
              { label: "LLM", value: stats.llm_count, color: "bg-blue-500" },
              { label: "Escalated", value: stats.escalation_count, color: "bg-red-500" },
              { label: "Avg Conf.", value: parseFloat(stats.avg_confidence || "0").toFixed(2), color: "bg-orange-500" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-2xl border-2 border-neutral-900 ${stat.color} p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`}
              >
                <div className="font-['Clash_Display'] text-2xl font-bold text-white">{stat.value}</div>
                <div className="font-['Satoshi'] text-xs font-medium text-white/80">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setSourceFilter(f.value); setOffset(0); }}
                className={`rounded-lg border-2 px-3 py-1.5 font-['Satoshi'] text-sm font-medium transition-all ${
                  sourceFilter === f.value
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchLogs(offset, sourceFilter)}
            disabled={loading}
            className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 font-['Satoshi'] text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !logs.length ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-2xl border-2 border-neutral-200 bg-white p-12 text-center">
            <p className="font-['Satoshi'] text-neutral-400">No chat logs found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                  {["Time", "Session", "Source", "Conf.", "User Message", "Bot Response"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className={`cursor-pointer border-b border-neutral-100 transition-colors last:border-0 ${
                        isExpanded ? "bg-violet-50" : "hover:bg-neutral-50"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-['Satoshi'] text-xs text-neutral-500">
                        {new Date(log.created_at).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-400">
                        {log.session_id.slice(0, 18)}…
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 font-['Satoshi'] text-xs font-semibold ${SOURCE_COLORS[log.source] || "bg-neutral-100 text-neutral-600"}`}>
                          {log.source.toUpperCase()}
                          {log.intent_id && ` · ${log.intent_id}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-600">
                        {(log.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <p className={`font-['Satoshi'] text-sm text-neutral-900 ${isExpanded ? "" : "line-clamp-1"}`}>
                          {log.user_message}
                        </p>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className={`font-['Satoshi'] text-sm text-neutral-600 ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-1"}`}>
                          {log.bot_response}
                        </p>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalFromStats > limit && (
          <div className="mt-4 flex items-center justify-between">
            <p className="font-['Satoshi'] text-sm text-neutral-500">
              Showing {offset + 1}–{Math.min(offset + limit, totalFromStats)} of {totalFromStats}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= totalFromStats}
                className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
