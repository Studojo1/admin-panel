import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import {
  getOutreachOverview,
  listOutreachUsers,
  type OutreachOverview,
  type OutreachUserRow,
} from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/outreach";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

export function meta({}: Route.MetaArgs) {
  return [{ title: "Outreach – Admin Panel" }];
}

const STATUS_COLORS: Record<string, string> = {
  leads_generating: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  leads_ready: "bg-blue-100 text-blue-800 border border-blue-300",
  enriching: "bg-orange-100 text-orange-800 border border-orange-300",
  enrichment_complete: "bg-teal-100 text-teal-800 border border-teal-300",
  campaign_setup: "bg-purple-100 text-purple-800 border border-purple-300",
  email_connected: "bg-indigo-100 text-indigo-800 border border-indigo-300",
  campaign_running: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  completed: "bg-neutral-100 text-neutral-700 border border-neutral-300",
};

function StatusBadge({ status, stuck }: { status: string | null; stuck?: boolean }) {
  if (!status) return <span className="font-['Satoshi'] text-xs text-neutral-400">—</span>;
  const classes = STATUS_COLORS[status] || "bg-neutral-100 text-neutral-700 border border-neutral-300";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 font-['Satoshi'] text-xs font-semibold ${classes}`}>
        {status.replace(/_/g, " ")}
      </span>
      {stuck && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 font-['Satoshi'] text-xs font-bold text-white">
          STUCK
        </span>
      )}
    </div>
  );
}

export default function Outreach() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [overview, setOverview] = useState<OutreachOverview | null>(null);
  const [users, setUsers] = useState<OutreachUserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const limit = 50;

  useEffect(() => {
    if (!isAuthorized) return;
    setLoading(true);
    getOutreachOverview()
      .then(setOverview)
      .catch((e) => {
        setError(e.message || "Failed to load outreach stats");
        toast.error("Failed to load outreach overview");
      })
      .finally(() => setLoading(false));
  }, [isAuthorized]);

  const fetchUsers = async (off = 0, q = "", sf = "") => {
    setUsersLoading(true);
    try {
      const data = await listOutreachUsers(limit, off, q, sf);
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
    } catch (e: any) {
      toast.error(e.message || "Failed to load outreach users");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    fetchUsers(offset, search, statusFilter);
  }, [isAuthorized, offset, search, statusFilter]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500" />
      </div>
    );
  }

  if (!isAuthorized) return null;

  const chartLabels = overview?.monthly_metrics.map((m) => m.month) || [];
  const emailsChart = {
    labels: chartLabels,
    datasets: [
      {
        label: "Emails Sent",
        data: overview?.monthly_metrics.map((m) => m.emails_sent) || [],
        backgroundColor: "rgba(124, 58, 237, 0.8)",
        borderColor: "rgba(124, 58, 237, 1)",
        borderWidth: 2,
        borderRadius: 6,
      },
      {
        label: "Replies",
        data: overview?.monthly_metrics.map((m) => m.emails_replied) || [],
        backgroundColor: "rgba(16, 185, 129, 0.8)",
        borderColor: "rgba(16, 185, 129, 1)",
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  const ordersChart = {
    labels: chartLabels,
    datasets: [
      {
        label: "Orders Created",
        data: overview?.monthly_metrics.map((m) => m.orders_created) || [],
        backgroundColor: "rgba(245, 158, 11, 0.8)",
        borderColor: "rgba(245, 158, 11, 1)",
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { position: "top" as const }, title: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  const fmtCents = (cents: number) => {
    const inr = cents / 100;
    return inr >= 100000
      ? `₹${(inr / 100000).toFixed(1)}L`
      : inr >= 1000
      ? `₹${(inr / 1000).toFixed(1)}k`
      : `₹${inr.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />

      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="font-['Clash_Display'] text-4xl font-bold text-neutral-900 md:text-5xl">
            Outreach
          </h1>
          <p className="mt-2 font-['Satoshi'] text-neutral-500">
            Campaign overview across all users
          </p>
        </motion.div>

        {error && (
          <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 font-['Satoshi'] text-sm text-red-700">
            {error} — make sure the outreach service is running.
          </div>
        )}

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500" />
          </div>
        ) : overview && (
          <>
            {/* Top stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                { label: "Total Orders", value: overview.total_orders, color: "bg-violet-500" },
                { label: "Active", value: overview.active_orders, color: "bg-amber-500" },
                { label: "Completed", value: overview.completed_orders, color: "bg-emerald-500" },
                { label: "Stuck", value: overview.stuck_orders, color: overview.stuck_orders > 0 ? "bg-red-500" : "bg-neutral-300" },
                { label: "Revenue", value: fmtCents(overview.total_revenue_cents), color: "bg-teal-500" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className={`rounded-2xl border-2 border-neutral-900 ${stat.color} p-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]`}
                >
                  <div className="font-['Clash_Display'] text-3xl font-bold text-white">{stat.value}</div>
                  <div className="font-['Satoshi'] text-sm font-medium text-white/80">{stat.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Email stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Emails Sent", value: overview.total_emails_sent, color: "bg-blue-500" },
                { label: "Replies", value: overview.total_emails_replied, color: "bg-pink-500" },
                { label: "Bounced", value: overview.total_emails_bounced, color: "bg-orange-500" },
                { label: "Reply Rate", value: `${overview.reply_rate_pct}%`, color: "bg-indigo-500" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.07 }}
                  className={`rounded-2xl border-2 border-neutral-900 ${stat.color} p-5 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`}
                >
                  <div className="font-['Clash_Display'] text-3xl font-bold text-white">{stat.value}</div>
                  <div className="font-['Satoshi'] text-sm font-medium text-white/80">{stat.label}</div>
                </motion.div>
              ))}
            </div>

            {/* Charts */}
            {chartLabels.length > 0 && (
              <div className="mb-8 grid gap-6 md:grid-cols-2">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                >
                  <h2 className="mb-4 font-['Clash_Display'] text-xl font-bold text-neutral-900">
                    Emails by Month
                  </h2>
                  <Bar data={emailsChart} options={chartOptions} />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                >
                  <h2 className="mb-4 font-['Clash_Display'] text-xl font-bold text-neutral-900">
                    Orders by Month
                  </h2>
                  <Bar data={ordersChart} options={chartOptions} />
                </motion.div>
              </div>
            )}
          </>
        )}

        {/* Users table */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-['Clash_Display'] text-2xl font-bold text-neutral-900">Users</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              placeholder="Search name / email..."
              className="rounded-xl border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
              className="rounded-xl border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="">All statuses</option>
              {["leads_generating", "leads_ready", "enriching", "enrichment_complete", "campaign_setup", "email_connected", "campaign_running", "completed"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>

        {usersLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border-2 border-neutral-200 bg-white p-12 text-center">
            <p className="font-['Satoshi'] text-neutral-400">No outreach users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                  {["User", "Orders", "Status", "Credits", "Sent", "Replied", "Leads", "Spent"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <motion.tr
                    key={u.user_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-['Satoshi'] text-sm font-semibold text-neutral-900">{u.user_name}</div>
                      <div className="font-['Satoshi'] text-xs text-neutral-400">{u.user_email}</div>
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">{u.total_orders}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.active_order_status} stuck={u.is_stuck} />
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">
                      {u.used_credits}/{u.total_credits}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">{u.total_emails_sent}</td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">
                      {u.total_emails_replied}
                      {u.total_emails_sent > 0 && (
                        <span className="ml-1 text-xs text-neutral-400">
                          ({((u.total_emails_replied / u.total_emails_sent) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">{u.total_leads}</td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">
                      {fmtCents(u.total_paid_cents)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {usersTotal > limit && (
          <div className="mt-4 flex items-center justify-between">
            <p className="font-['Satoshi'] text-sm text-neutral-500">
              Showing {offset + 1}–{Math.min(offset + limit, usersTotal)} of {usersTotal}
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
                disabled={offset + limit >= usersTotal}
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
