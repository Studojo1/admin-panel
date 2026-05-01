import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
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
  type FunnelStageKey,
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

// 11-stage funnel (quiz_started removed — never had a backfill signal and
// adds no analytic value going forward). Keep in sync with FUNNEL_STAGES
// in api/routes_admin.py. Used for the per-user "journey" dot-strip.
const FUNNEL_STAGE_KEYS: { key: FunnelStageKey; short: string }[] = [
  { key: "resume_uploaded",       short: "Resume" },
  { key: "quiz_completed",        short: "Quiz" },
  { key: "leads_generated",       short: "Leads" },
  { key: "payment_page_reached",  short: "Pay➝" },
  { key: "payment_made",          short: "Paid" },
  { key: "gmail_connected",       short: "Gmail" },
  { key: "email_style_selected",  short: "Style" },
  { key: "campaign_setup",        short: "Setup" },
  { key: "campaign_launched",     short: "Launch" },
  { key: "campaign_paused",       short: "Pause" },
  { key: "campaign_completed",    short: "Done" },
];

// Funnel-stage badge colours for the Status column. Maps the latest
// reached stage to a colour pair so the eye can scan progress at a glance.
const STAGE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  resume_uploaded:      { bg: "bg-gray-100",    text: "text-gray-700"    },
  quiz_completed:       { bg: "bg-orange-100",  text: "text-orange-700"  },
  leads_generated:      { bg: "bg-cyan-100",    text: "text-cyan-700"    },
  payment_page_reached: { bg: "bg-yellow-100",  text: "text-yellow-700"  },
  payment_made:         { bg: "bg-lime-100",    text: "text-lime-700"    },
  gmail_connected:      { bg: "bg-violet-100",  text: "text-violet-700"  },
  email_style_selected: { bg: "bg-fuchsia-100", text: "text-fuchsia-700" },
  campaign_setup:       { bg: "bg-amber-100",   text: "text-amber-700"   },
  campaign_launched:    { bg: "bg-green-100",   text: "text-green-700"   },
  campaign_paused:      { bg: "bg-orange-100",  text: "text-orange-700"  },
  campaign_completed:   { bg: "bg-emerald-100", text: "text-emerald-700" },
};

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
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OutreachOverview | null>(null);
  const [users, setUsers] = useState<OutreachUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [requestedOffset, setRequestedOffset] = useState(0);
  // Synchronous guard against double-loading when the IntersectionObserver
  // fires multiple times before React reflects the loading state. Refs are
  // updated atomically; useState is async/batched.
  const loadingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  const limit = 50;
  // Filter change → reset (combined into a single key so we can wipe + refetch atomically)
  const filterKey = `${search}|${statusFilter}`;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  useEffect(() => {
    if (isAuthorized) {
      loadOverview();
    }
  }, [isAuthorized, loadOverview]);

  // Reset accumulated rows whenever the filter changes
  useEffect(() => {
    setUsers([]);
    setRequestedOffset(0);
    setHasMore(true);
    loadingRef.current = false;
  }, [filterKey]);

  // Single fetch effect — fires on filter reset (offset back to 0) and on
  // every subsequent loadMore() call (which bumps requestedOffset by limit).
  useEffect(() => {
    if (!isAuthorized) return;
    let cancelled = false;
    setUsersLoading(true);
    loadingRef.current = true;
    listOutreachUsers(limit, requestedOffset, search || undefined, statusFilter || undefined)
      .then((data) => {
        if (cancelled) return;
        const fetched = data.users || [];
        setUsers((prev) => (requestedOffset === 0 ? fetched : [...prev, ...fetched]));
        setTotal(data.total || 0);
        setHasMore(requestedOffset + fetched.length < (data.total || 0));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message || "Failed to load users");
        setHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
        loadingRef.current = false;
      });
    return () => { cancelled = true; };
  }, [isAuthorized, requestedOffset, filterKey]);

  // Infinite scroll — observe a sentinel row at the bottom of the scroll
  // container; when it intersects, request the next chunk. rootMargin of
  // 200px pre-fetches before the user actually hits the bottom.
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setRequestedOffset((prev) => prev + limit);
  }, [hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); },
      { root, rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore, users.length]);

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

  // 12-stage funnel data straight from the backend. Each entry has the
  // count of distinct users who reached that stage plus drop-off vs the
  // previous active stage (computed server-side).
  const funnelStages = overview?.funnel ?? [];
  const funnelLabels = funnelStages.map((s) => s.label);
  const funnelData = funnelStages.map((s) => s.users_reached);
  // Violet-fade for the main flow, amber/red for paused/done so the eye
  // separates the linear funnel from the terminal off-ramps.
  const funnelColors = funnelStages.map((s) => {
    if (s.stage === "campaign_paused") return "#f59e0b";
    if (s.stage === "campaign_completed") return "#10b981";
    return "#8b5cf6";
  });

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
              {/* Top-of-funnel: distinct users who uploaded a resume.
                  Replaces the old "Active Orders" stat which only counted
                  mid-flight statuses and so undercounted the real funnel. */}
              <StatCard
                value={overview.funnel?.find(s => s.stage === "resume_uploaded")?.users_reached ?? overview.active_orders}
                label="Funnel Entries"
                color="orange"
                delay={0}
              />
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
              {/* 12-Stage Funnel */}
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8">
                <h2 className="mb-1 font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl">
                  Funnel — 12 Stages
                </h2>
                <p className="mb-4 font-['Satoshi'] text-xs text-neutral-500">
                  Distinct users who reached each stage. Drop-off % is vs the previous main-flow stage.
                </p>
                <div className="h-[420px]">
                  {funnelLabels.length > 0 ? (
                    <Bar
                      data={{
                        labels: funnelLabels,
                        datasets: [
                          {
                            label: "Users",
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
                            callbacks: {
                              label: (ctx) => {
                                const stage = funnelStages[ctx.dataIndex];
                                if (!stage) return `${ctx.parsed.x} users`;
                                const lines = [`${stage.users_reached} users`];
                                if (stage.drop_off_from_prev !== null && stage.drop_off_pct_from_prev !== null) {
                                  lines.push(
                                    `Drop-off: ${stage.drop_off_from_prev} (${stage.drop_off_pct_from_prev}%)`
                                  );
                                }
                                return lines;
                              },
                            },
                          },
                        },
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="font-['Satoshi'] text-sm text-neutral-500">
                        No funnel data yet (run the backfill script)
                      </p>
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
                onChange={(val) => { setSearch(val); }}
                placeholder="Search by name or email..."
              />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); }}
                className="rounded-2xl border-2 border-neutral-900 bg-white px-4 py-3 font-['Satoshi'] text-base font-normal text-neutral-900 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]"
              >
                <option value="">All Statuses</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{formatStatus(s)}</option>
                ))}
              </select>
            </motion.div>

            {/* Users Table — only show the centered spinner on the FIRST
                load (no rows yet). For subsequent infinite-scroll fetches
                the table stays mounted so its scroll position is preserved;
                the in-table sentinel row handles its own loading state. */}
            {usersLoading && users.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
                  <p className="font-['Satoshi'] text-sm text-gray-600">Loading users...</p>
                </div>
              </div>
            ) : users.length > 0 ? (
              <>
                {/* Bounded-height container with internal scroll. The
                    table thead is sticky so headers stay visible while
                    rows scroll past, and a sentinel <tr> at the bottom
                    triggers an infinite-scroll fetch via IntersectionObserver. */}
                <div
                  ref={scrollContainerRef}
                  className="overflow-x-auto overflow-y-auto max-h-[640px] rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                >
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[0_2px_0_0_rgba(25,26,35,1)]">
                      <tr className="bg-neutral-50">
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">User</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Status</th>
                        <th className="px-3 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Journey</th>
                        <th className="px-3 py-4 text-center font-['Satoshi'] text-sm font-bold text-neutral-950">Alert</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Leads</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Emails</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Revenue</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Last Active</th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950"></th>
                      </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => {
                          // Status badge shows the LATEST funnel stage the user
                          // actually reached (Resume Uploaded / Quiz Completed /
                          // ... / Campaign Completed) — not the raw OutreachOrder
                          // status enum, which doesn't capture pre-order stages.
                          const stageKey = u.current_stage ?? null;
                          const stageLabel = u.current_stage_label ?? null;
                          const stageColor = stageKey ? STAGE_BADGE_COLORS[stageKey] : null;
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
                                {stageLabel && stageColor ? (
                                  <span className={`inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${stageColor.bg} ${stageColor.text}`}>
                                    {stageLabel}
                                  </span>
                                ) : (
                                  <span className="font-['Satoshi'] text-xs text-neutral-400">No stage reached</span>
                                )}
                              </td>
                              <td className="px-3 py-4">
                                {/* 12-stage dot strip — filled if reached, hollow if not.
                                    Lets the admin see at a glance where each user dropped. */}
                                <div className="flex items-center gap-1">
                                  {FUNNEL_STAGE_KEYS.map(({ key, short }) => {
                                    const ts = u.stage_timestamps?.[key];
                                    const reached = !!ts;
                                    const isPause = key === "campaign_paused";
                                    const isDone = key === "campaign_completed";
                                    const fill = reached
                                      ? isDone ? "bg-emerald-500 border-emerald-700"
                                        : isPause ? "bg-amber-500 border-amber-700"
                                        : "bg-violet-500 border-violet-700"
                                      : "bg-white border-neutral-300";
                                    return (
                                      <span
                                        key={key}
                                        title={`${short}${ts ? `: ${new Date(ts).toLocaleString()}` : " — not reached"}`}
                                        className={`inline-block h-2.5 w-2.5 rounded-full border ${fill}`}
                                      />
                                    );
                                  })}
                                </div>
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
                              <td className="px-4 py-4">
                                {u.active_order_status === "campaign_running" && u.active_campaign_id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/outreach-campaign?campaign_id=${u.active_campaign_id}&user_id=${u.user_id}`);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border-2 border-violet-900 bg-violet-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                                  >
                                    View Campaign →
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      {/* Sentinel row — invisible, used by IntersectionObserver
                          to detect when the user has scrolled near the bottom
                          and trigger fetching the next chunk. */}
                      {hasMore && (
                        <tr ref={sentinelRef}>
                          <td colSpan={9} className="py-6 text-center">
                            {usersLoading ? (
                              <span className="font-['Satoshi'] text-sm text-neutral-500">
                                Loading more…
                              </span>
                            ) : (
                              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-violet-400 border-r-transparent" />
                            )}
                          </td>
                        </tr>
                      )}
                      {!hasMore && (
                        <tr>
                          <td colSpan={9} className="py-4 text-center font-['Satoshi'] text-xs text-neutral-400">
                            End of list — all {total} users loaded
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer counter — shows progress of how many rows are
                    currently rendered vs total. Updates live as more chunks
                    are streamed in by the infinite-scroll observer. */}
                <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
                  <p className="font-['Satoshi'] text-sm text-neutral-600">
                    Showing <span className="font-bold text-neutral-900">{users.length}</span>
                    {" "}of <span className="font-bold text-neutral-900">{total}</span> users
                    {search && ` matching "${search}"`}
                    {!hasMore && total > 0 && " — scroll to top to view earlier rows"}
                  </p>
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