import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/ops-alerts";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Ops Alerts – Admin Panel" }];
}

interface OpsAlert {
  id: number;
  namespace: string;
  pod: string;
  container: string;
  restart_count: number;
  last_restart_at: string | null;
  summary: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

interface OpsStats {
  total: string;
  open_count: string;
  last_24h: string;
  last_7d: string;
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Acknowledged", value: "acked" },
];

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function OpsAlerts() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "acked">("open");
  const [acking, setAcking] = useState<number | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams({ status: filter, limit: "100" });
      const res = await fetch(`/api/ops-alerts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
      setStats(data.stats || null);
    } catch (e: any) {
      setError(e.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAuthorized) fetchAlerts();
  }, [isAuthorized, fetchAlerts]);

  // Auto-refresh every 30s while page is open.
  useEffect(() => {
    if (!isAuthorized) return;
    const id = setInterval(fetchAlerts, 30000);
    return () => clearInterval(id);
  }, [isAuthorized, fetchAlerts]);

  const acknowledge = async (id: number) => {
    setAcking(id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/ops-alerts/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAlerts();
    } catch (e: any) {
      setError(e.message || "Failed to acknowledge");
    } finally {
      setAcking(null);
    }
  };

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
              <h1 className="text-3xl font-bold text-neutral-900">Ops Alerts</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Pod restart spikes from the in-cluster watcher. Auto-refreshes every 30s.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAlerts}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatTile label="Open" value={stats?.open_count} highlight={Number(stats?.open_count) > 0} />
            <StatTile label="Last 24h" value={stats?.last_24h} />
            <StatTile label="Last 7d" value={stats?.last_7d} />
            <StatTile label="Total (30d)" value={stats?.total} />
          </div>

          <div className="flex gap-2 mb-4">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value as any)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  filter === f.value
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {loading && alerts.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">Loading…</div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                {filter === "open"
                  ? "No open alerts. Cluster looks healthy."
                  : "No alerts in range."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="text-left px-4 py-3">When</th>
                    <th className="text-left px-4 py-3">Pod</th>
                    <th className="text-left px-4 py-3">Restarts</th>
                    <th className="text-left px-4 py-3">Last restart</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {alerts.map((a) => {
                    const open = !a.acknowledged_at;
                    return (
                      <tr key={a.id} className={open ? "bg-amber-50/40" : "bg-white"}>
                        <td className="px-4 py-3 text-neutral-700">
                          <div>{relativeTime(a.created_at)}</div>
                          <div className="text-xs text-neutral-400">
                            {new Date(a.created_at).toLocaleString("en-GB")}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-neutral-900">
                            {a.namespace}/{a.pod}
                          </div>
                          <div className="font-mono text-[11px] text-neutral-500">
                            container: {a.container}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 text-xs font-bold">
                            {a.restart_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {relativeTime(a.last_restart_at)}
                        </td>
                        <td className="px-4 py-3">
                          {open ? (
                            <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-xs font-bold">
                              Open
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-xs font-bold">
                                Acknowledged
                              </span>
                              <div className="text-[11px] text-neutral-500 mt-0.5">
                                by {a.acknowledged_by} · {relativeTime(a.acknowledged_at)}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {open && (
                            <button
                              type="button"
                              onClick={() => acknowledge(a.id)}
                              disabled={acking === a.id}
                              className="rounded-lg bg-neutral-900 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                            >
                              {acking === a.id ? "..." : "Acknowledge"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
  highlight,
}: {
  label: string;
  value: string | undefined;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3 ${
        highlight ? "border-amber-400 ring-2 ring-amber-200" : "border-neutral-200"
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-2xl font-bold text-neutral-900 mt-0.5">
        {value ?? "–"}
      </div>
    </div>
  );
}
