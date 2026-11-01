import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/tickets";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Tickets – Admin Panel" }];
}

interface TicketRow {
  id: number;
  user_id: string;
  user_email: string;
  user_name: string | null;
  category: string;
  priority: "high" | "normal" | "low";
  status: "open" | "in_progress" | "resolved" | "wont_fix";
  source: string;
  context: Record<string, any> | null;
  assignee_email: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  first_message: string;
  message_count: number;
}

interface Stats {
  total: string;
  open: string;
  high_open: string;
  in_progress: string;
  resolved_7d: string;
}

const STATUS_FILTERS = [
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
  { label: "Won't fix", value: "wont_fix" },
  { label: "All", value: "all" },
];

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  normal: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-neutral-100 text-neutral-700 border-neutral-300",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-300",
  in_progress: "bg-violet-100 text-violet-800 border-violet-300",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wont_fix: "bg-neutral-100 text-neutral-700 border-neutral-300",
};

const CATEGORY_LABELS: Record<string, string> = {
  campaign_broken: "Campaign broken",
  campaign_changes: "Campaign changes",
  website_broken: "Site broken",
  info_request: "Info request",
  other: "Other",
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function TicketsList() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      const res = await fetch(`/api/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(data.tickets || []);
      setStats(data.stats || null);
    } catch (e: any) {
      setError(e.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    if (isAuthorized) fetchTickets();
  }, [isAuthorized, fetchTickets]);

  useEffect(() => {
    if (!isAuthorized) return;
    const id = setInterval(fetchTickets, 30000);
    return () => clearInterval(id);
  }, [isAuthorized, fetchTickets]);

  if (isPending) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">Tickets</h1>
              <p className="text-sm text-neutral-500 mt-1">
                User-raised tickets from the support chat and outreach
                dashboard. Auto-refreshes every 30s.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchTickets}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatTile label="Open" value={stats?.open} amber={Number(stats?.open) > 0} />
            <StatTile label="High open" value={stats?.high_open} red={Number(stats?.high_open) > 0} />
            <StatTile label="In progress" value={stats?.in_progress} />
            <StatTile label="Resolved 7d" value={stats?.resolved_7d} />
            <StatTile label="Total" value={stats?.total} />
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    statusFilter === f.value
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700"
            >
              <option value="all">Any priority</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {loading && tickets.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">Loading…</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                No tickets in this filter.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="text-left px-4 py-3">When</th>
                    <th className="text-left px-4 py-3">Priority</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Preview</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      className={`hover:bg-violet-50/40 transition-colors ${
                        t.priority === "high" && t.status === "open"
                          ? "bg-red-50/30"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 align-top">
                        <Link
                          to={`/tickets/${t.id}`}
                          className="block text-neutral-700"
                        >
                          <div>{relativeTime(t.created_at)}</div>
                          <div className="text-xs text-neutral-400">#{t.id}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                            PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.normal
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link to={`/tickets/${t.id}`} className="block">
                          <div className="font-semibold text-neutral-900">
                            {CATEGORY_LABELS[t.category] || t.category}
                          </div>
                          <div className="text-xs text-neutral-500">
                            via {t.source.replace("_", " ")}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link to={`/tickets/${t.id}`} className="block">
                          <div className="text-neutral-900">
                            {t.user_name || t.user_email}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {t.user_email}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top max-w-[400px]">
                        <Link
                          to={`/tickets/${t.id}`}
                          className="block text-neutral-700 line-clamp-2"
                        >
                          {t.first_message}
                        </Link>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          {t.message_count} message{t.message_count === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                            STATUS_BADGE[t.status] || STATUS_BADGE.open
                          }`}
                        >
                          {t.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  amber,
  red,
}: {
  label: string;
  value: string | undefined;
  amber?: boolean;
  red?: boolean;
}) {
  const border = red
    ? "border-red-400 ring-2 ring-red-200"
    : amber
      ? "border-amber-400 ring-2 ring-amber-200"
      : "border-neutral-200";
  return (
    <div className={`rounded-xl border bg-white px-4 py-3 ${border}`}>
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-2xl font-bold text-neutral-900 mt-0.5">{value ?? "–"}</div>
    </div>
  );
}
