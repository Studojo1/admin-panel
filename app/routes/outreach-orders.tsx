import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { Bar, Line } from "react-chartjs-2";
import { AdminHeader, StatCard, SearchInput } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import {
  getOutreachOverview,
  listOutreachUsers,
  type OutreachOverview,
  type OutreachUserRow,
} from "~/lib/api";
import { OutreachUserDetailModal } from "~/components/outreach-user-detail-modal";
import { toast } from "sonner";
import type { Route } from "./+types/outreach-orders";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const STATUS_ORDER = [
  "created",
  "profile_complete",
  "leads_generating",
  "leads_ready",
  "enriching",
  "enrichment_complete",
  "campaign_setup",
  "email_connected",
  "campaign_running",
  "completed",
];

const STATUS_COLORS: Record<string, { bg: string; text: string; chart: string }> = {
  created:              { bg: "bg-gray-100",    text: "text-gray-700",    chart: "#9ca3af" },
  profile_complete:     { bg: "bg-orange-100",  text: "text-orange-700",  chart: "#f97316" },
  leads_generating:     { bg: "bg-blue-100",    text: "text-blue-700",    chart: "#3b82f6" },
  leads_ready:          { bg: "bg-cyan-100",    text: "text-cyan-700",    chart: "#06b6d4" },
  enriching:            { bg: "bg-indigo-100",  text: "text-indigo-700",  chart: "#6366f1" },
  enrichment_complete:  { bg: "bg-violet-100",  text: "text-violet-700",  chart: "#8b5cf6" },
  campaign_setup:       { bg: "bg-amber-100",   text: "text-amber-700",   chart: "#f59e0b" },
  email_connected:      { bg: "bg-amber-100",   text: "text-amber-700",   chart: "#d97706" },
  campaign_running:     { bg: "bg-green-100",   text: "text-green-700",   chart: "#22c55e" },
  completed:            { bg: "bg-emerald-100", text: "text-emerald-700", chart: "#10b981" },
};

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrency(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN")}`;
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      padding: 12,
      titleFont: { family: "'Satoshi', sans-serif", size: 14, weight: "bold" as const },
      bodyFont: { family: "'Satoshi', sans-serif", size: 13 },
      borderColor: "#171717",
      borderWidth: 2,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: "'Satoshi', sans-serif", size: 11 }, color: "#6b7280" },
      border: { color: "#e5e7eb", width: 1 },
    },
    y: {
      grid: { color: "#e5e7eb", lineWidth: 1 },
      ticks: { font: { family: "'Satoshi', sans-serif", size: 11 }, color: "#6b7280" },
      border: { color: "#e5e7eb", width: 1 },
    },
  },
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Outreach Orders – Admin Panel" },
    { name: "description", content: "Monitor outreach campaigns and paid users" },
  ];
}

export default function OutreachOrders() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [overview, setOverview] = useState<OutreachOverview | null>(null);
  const [users, setUsers] = useState<OutreachUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const limit = 50;

  const loadOverview = useCallback(async () => {
    try {
      const data = await getOutreachOverview();
      setOverview(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const data = await listOutreachUsers(limit, offset, search || undefined, statusFilter || undefined);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load users");
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [offset, search, statusFilter]);

  useEffect(() => {
    if (isAuthorized) {
      loadOverview();
    }
  }, [isAuthorized, loadOverview]);

  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
    }
  }, [isAuthorized, loadUsers]);

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
          <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) return null;

  // Chart data
  const funnelLabels = STATUS_ORDER.filter((s) => overview?.orders_by_status?.[s]);
  const funnelData = funnelLabels.map((s) => overview?.orders_by_status?.[s] ?? 0);
  const funnelColors = funnelLabels.map((s) => STATUS_COLORS[s]?.chart ?? "#9ca3af");

  const monthlyLabels = (overview?.monthly_metrics ?? []).map((m) => formatMonth(m.month));
  const monthlyEmailsSent = (overview?.monthly_metrics ?? []).map((m) => m.emails_sent);
  const monthlyReplied = (overview?.monthly_metrics ?? []).map((m) => m.emails_replied);

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
            Outreach Orders
          </h1>
          <p className="mt-2 font-['Satoshi'] text-base font-normal leading-6 text-gray-600">
            Monitor paid outreach campaigns and user activity
          </p>
        </motion.div>

        {loading ? (
          <div className="mt-12 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
              <p className="font-['Satoshi'] text-sm text-gray-600">Loading overview...</p>
            </div>
          </div>
        ) : overview && (
          <div className="space-y-10">
            {/* Stat Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard value={overview.active_orders} label="Active Orders" color="orange" delay={0} />
              <StatCard
                value={overview.stuck_orders}
                label="Stuck Orders"
                color="pink"
                delay={0.1}
              />
              <StatCard
                value={formatCurrency(overview.total_revenue_cents)}
                label="Total Revenue"
                color="green"
                delay={0.2}
              />
              <StatCard
                value={`${overview.reply_rate_pct}%`}
                label="Reply Rate"
                color="purple"
                delay={0.3}
              />
            </motion.div>

            {/* Charts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-1 gap-6 md:grid-cols-2"
            >
              {/* Pipeline Funnel */}
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8">
                <h2 className="mb-6 font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl">
                  Pipeline Funnel
                </h2>
                <div className="h-64">
                  {funnelLabels.length > 0 ? (
                    <Bar
                      data={{
                        labels: funnelLabels.map(formatStatus),
                        datasets: [
                          {
                            label: "Orders",
                            data: funnelData,
                            backgroundColor: funnelColors,
                            borderColor: "#171717",
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        ...chartOptions,
                        indexAxis: "y" as const,
                        plugins: {
                          ...chartOptions.plugins,
                          tooltip: {
                            ...chartOptions.plugins.tooltip,
                            callbacks: { label: (ctx) => `${ctx.parsed.x} orders` },
                          },
                        },
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="font-['Satoshi'] text-sm text-neutral-500">No orders yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Email Trend */}
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8">
                <h2 className="mb-6 font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl">
                  Email Trend (12 Months)
                </h2>
                <div className="h-64">
                  {monthlyLabels.length > 0 ? (
                    <Line
                      data={{
                        labels: monthlyLabels,
                        datasets: [
                          {
                            label: "Sent",
                            data: monthlyEmailsSent,
                            borderColor: "#8b5cf6",
                            backgroundColor: "rgba(139,92,246,0.1)",
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: "#8b5cf6",
                            pointBorderColor: "#171717",
                            pointBorderWidth: 2,
                          },
                          {
                            label: "Replied",
                            data: monthlyReplied,
                            borderColor: "#10b981",
                            backgroundColor: "rgba(16,185,129,0.1)",
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: "#10b981",
                            pointBorderColor: "#171717",
                            pointBorderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        ...chartOptions,
                        plugins: {
                          ...chartOptions.plugins,
                          legend: {
                            display: true,
                            position: "top" as const,
                            labels: {
                              font: { family: "'Satoshi', sans-serif", size: 12 },
                              usePointStyle: true,
                              padding: 15,
                            },
                          },
                        },
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="font-['Satoshi'] text-sm text-neutral-500">No email data yet</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Search + Filter */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="flex flex-col gap-4 md:flex-row md:items-center"
            >
              <SearchInput
                value={search}
                onChange={(val) => { setSearch(val); setOffset(0); }}
                placeholder="Search by name or email..."
              />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
                className="rounded-2xl border-2 border-neutral-900 bg-white px-4 py-3 font-['Satoshi'] text-base font-normal text-neutral-900 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]"
              >
                <option value="">All Statuses</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{formatStatus(s)}</option>
                ))}
              </select>
            </motion.div>

            {/* Users Table */}
            {usersLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
                  <p className="font-['Satoshi'] text-sm text-gray-600">Loading users...</p>
                </div>
              </div>
            ) : users.length > 0 ? (
              <>
                <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">User</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Status</th>
                        <th className="px-3 py-4 text-center font-['Satoshi'] text-sm font-bold text-neutral-950">Alert</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Leads</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Emails</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Revenue</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => {
                          const sc = u.active_order_status
                            ? STATUS_COLORS[u.active_order_status] ?? STATUS_COLORS.created
                            : null;
                          return (
                            <tr
                              key={u.user_id}
                              onClick={() => { setSelectedUserId(u.user_id); setIsModalOpen(true); }}
                              className="cursor-pointer border-b border-neutral-200 transition-colors hover:bg-neutral-50"
                            >
                              <td className="px-4 py-4">
                                <div className="font-['Satoshi'] text-sm font-medium text-neutral-950">{u.user_name || "—"}</div>
                                <div className="font-['Satoshi'] text-xs text-neutral-500">{u.user_email}</div>
                              </td>
                              <td className="px-4 py-4">
                                {u.active_order_status ? (
                                  <span className={`inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${sc!.bg} ${sc!.text}`}>
                                    {formatStatus(u.active_order_status)}
                                  </span>
                                ) : (
                                  <span className="font-['Satoshi'] text-xs text-neutral-400">No active order</span>
                                )}
                              </td>
                              <td className="px-3 py-4 text-center">
                                {u.is_stuck && (
                                  <span className="inline-block h-3 w-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" title="Stuck — no update in 6h+" />
                                )}
                              </td>
                              <td className="px-4 py-4 font-['Satoshi'] text-sm text-neutral-700">
                                {u.total_leads.toLocaleString()}
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-['Satoshi'] text-sm text-neutral-700">
                                  {u.total_emails_sent} sent
                                </div>
                                <div className="font-['Satoshi'] text-xs text-neutral-500">
                                  {u.total_emails_replied} replied / {u.total_emails_bounced} bounced
                                </div>
                              </td>
                              <td className="px-4 py-4 font-['Satoshi'] text-sm font-medium text-neutral-900">
                                {formatCurrency(u.total_paid_cents)}
                              </td>
                              <td className="px-4 py-4 font-['Satoshi'] text-sm text-neutral-600">
                                {timeAgo(u.active_order_updated_at)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="mt-6 flex items-center justify-between">
                  <p className="font-['Satoshi'] text-sm text-neutral-600">
                    Showing {users.length} of {total} users
                    {search && ` matching "${search}"`}
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      disabled={offset === 0}
                      className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:cursor-not-allowed disabled:opacity-50 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setOffset(offset + limit)}
                      disabled={offset + limit >= total}
                      className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:cursor-not-allowed disabled:opacity-50 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
              >
                <p className="font-['Satoshi'] text-base text-neutral-600">
                  {search || statusFilter
                    ? "No users found matching your filters"
                    : "No outreach users yet"}
                </p>
              </motion.div>
            )}
          </div>
        )}

        <OutreachUserDetailModal
          userId={selectedUserId}
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setSelectedUserId(null); }}
        />
      </main>
    </>
  );
}