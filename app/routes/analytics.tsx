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
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { toast } from "sonner";
import type { Route } from "./+types/analytics";

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

export function meta(_: Route.MetaArgs) {
  return [{ title: "Analytics — Studojo Admin" }];
}

// ── PostHog proxy helpers ──────────────────────────────────────────────────

async function phQuery(query: object) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}

async function phGet(type: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ type, ...params }).toString();
  const res = await fetch(`/api/posthog?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`PostHog ${type} failed: ${res.status}`);
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "funnels" | "sessions" | "users" | "cohorts";
type Range = "7d" | "30d" | "90d";

interface OverviewStats {
  visitors: number;
  signups: number;
  payments: number;
  campaigns: number;
}

interface DailyPoint {
  day: string;
  visitors: number;
  signups: number;
  payments: number;
  campaigns: number;
}

interface TopPage {
  url: string;
  views: number;
}

interface FunnelStep {
  name: string;
  event: string;
  count: number;
  pct_from_start: number;
  pct_from_prev: number;
}

interface Session {
  id: string;
  person?: { name?: string; properties?: { email?: string } };
  recording_duration: number;
  click_count: number;
  active_seconds: number;
  start_time: string;
  viewed: boolean;
}

interface Person {
  id: number;
  uuid: string;
  name: string;
  distinct_ids: string[];
  properties: Record<string, any>;
  created_at: string;
}

interface Cohort {
  id: number;
  name: string;
  count: number;
  description?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rangeToInterval(r: Range) {
  return r === "7d" ? "INTERVAL 7 DAY" : r === "30d" ? "INTERVAL 30 DAY" : "INTERVAL 90 DAY";
}

function fmtDuration(secs: number) {
  if (!secs) return "0s";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const chartOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.85)",
      padding: 10,
      titleFont: { family: "'Satoshi', sans-serif", size: 13, weight: "bold" as const },
      bodyFont: { family: "'Satoshi', sans-serif", size: 12 },
      borderColor: "#171717",
      borderWidth: 1,
      cornerRadius: 6,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { family: "'Satoshi', sans-serif", size: 11 }, color: "#6b7280" },
      border: { color: "#e5e7eb" },
    },
    y: {
      grid: { color: "#f3f4f6" },
      ticks: { font: { family: "'Satoshi', sans-serif", size: 11 }, color: "#6b7280" },
      border: { color: "#e5e7eb" },
      beginAtZero: true,
    },
  },
};

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "funnels", label: "Funnels" },
  { id: "sessions", label: "Sessions" },
  { id: "users", label: "User Profiles" },
  { id: "cohorts", label: "Cohorts" },
];

// ── Main component ─────────────────────────────────────────────────────────

export default function Analytics() {
  const { isAuthorized } = useAdminGuard();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("30d");

  // Overview
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Funnels
  const [funnelA, setFunnelA] = useState<FunnelStep[]>([]);
  const [funnelB, setFunnelB] = useState<FunnelStep[]>([]);
  const [funnelC, setFunnelC] = useState<FunnelStep[]>([]);
  const [funnelsLoading, setFunnelsLoading] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [minDuration, setMinDuration] = useState("");

  // Users
  const [persons, setPersons] = useState<Person[]>([]);
  const [personsTotal, setPersonsTotal] = useState(0);
  const [personSearch, setPersonSearch] = useState("");
  const [personsLoading, setPersonsLoading] = useState(false);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [personEvents, setPersonEvents] = useState<Record<string, any[]>>({});

  // Cohorts
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(false);
  const [expandedCohort, setExpandedCohort] = useState<number | null>(null);
  const [cohortPersons, setCohortPersons] = useState<Record<number, Person[]>>({});

  // ── Overview loader ──────────────────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const interval = rangeToInterval(range);
    try {
      const [statsRes, dailyRes, topRes] = await Promise.all([
        phQuery({
          kind: "HogQLQuery",
          query: `SELECT
            uniq(person_id) as visitors,
            countIf(event = 'resume_uploaded') as signups,
            countIf(event = 'payment_confirmed') as payments,
            countIf(event = 'campaign_started') as campaigns
          FROM events WHERE timestamp > now() - ${interval}`,
        }),
        phQuery({
          kind: "HogQLQuery",
          query: `SELECT
            toDate(timestamp) as day,
            uniqIf(person_id, event = '$pageview') as visitors,
            countIf(event = 'resume_uploaded') as signups,
            countIf(event = 'payment_confirmed') as payments,
            countIf(event = 'campaign_started') as campaigns
          FROM events WHERE timestamp > now() - ${interval}
          GROUP BY day ORDER BY day ASC`,
        }),
        phQuery({
          kind: "HogQLQuery",
          query: `SELECT properties.$current_url as url, count() as views
          FROM events WHERE event = '$pageview' AND timestamp > now() - ${interval}
          AND url IS NOT NULL AND url != ''
          GROUP BY url ORDER BY views DESC LIMIT 10`,
        }),
      ]);

      const row = statsRes?.results?.[0] ?? [0, 0, 0, 0];
      setStats({ visitors: row[0] ?? 0, signups: row[1] ?? 0, payments: row[2] ?? 0, campaigns: row[3] ?? 0 });

      setDaily(
        (dailyRes?.results ?? []).map((r: any[]) => ({
          day: r[0]?.split("T")[0] ?? r[0],
          visitors: r[1] ?? 0,
          signups: r[2] ?? 0,
          payments: r[3] ?? 0,
          campaigns: r[4] ?? 0,
        }))
      );

      setTopPages(
        (topRes?.results ?? []).map((r: any[]) => ({
          url: String(r[0] ?? "").replace(/^https?:\/\/[^/]+/, "") || "/",
          views: r[1] ?? 0,
        }))
      );
    } catch (e: any) {
      toast.error("Failed to load overview: " + e.message);
    } finally {
      setOverviewLoading(false);
    }
  }, [range]);

  // ── Funnels loader ───────────────────────────────────────────────────────
  const loadFunnels = useCallback(async () => {
    setFunnelsLoading(true);
    const interval = rangeToInterval(range);

    async function computeFunnel(steps: { name: string; event: string }[]) {
      // Use HogQL to count unique persons per step within the window
      const selects = steps
        .map((s) => `uniqIf(person_id, event = '${s.event}') as step_${steps.indexOf(s)}`)
        .join(", ");
      const res = await phQuery({
        kind: "HogQLQuery",
        query: `SELECT ${selects} FROM events WHERE timestamp > now() - ${interval}`,
      });
      const row: number[] = res?.results?.[0] ?? steps.map(() => 0);
      const first = row[0] ?? 1;
      return steps.map((s, i) => ({
        name: s.name,
        event: s.event,
        count: row[i] ?? 0,
        pct_from_start: first > 0 ? Math.round(((row[i] ?? 0) / first) * 100) : 0,
        pct_from_prev: i === 0 ? 100 : (row[i - 1] ?? 0) > 0 ? Math.round(((row[i] ?? 0) / (row[i - 1] ?? 1)) * 100) : 0,
      }));
    }

    try {
      const [a, b, c] = await Promise.all([
        computeFunnel([
          { name: "Page View", event: "$pageview" },
          { name: "Resume Uploaded", event: "resume_uploaded" },
          { name: "Payment Confirmed", event: "payment_confirmed" },
          { name: "Campaign Started", event: "campaign_started" },
          { name: "Email Sent", event: "email_sent" },
        ]),
        computeFunnel([
          { name: "Resume Uploaded", event: "resume_uploaded" },
          { name: "Quiz Completed", event: "profile_quiz_completed" },
          { name: "Payment Confirmed", event: "payment_confirmed" },
        ]),
        computeFunnel([
          { name: "Payment Confirmed", event: "payment_confirmed" },
          { name: "Leads Discovered", event: "lead_discovery_completed" },
          { name: "Enrichment Done", event: "enrichment_completed" },
          { name: "Gmail Connected", event: "gmail_connected" },
          { name: "Campaign Started", event: "campaign_started" },
        ]),
      ]);
      setFunnelA(a);
      setFunnelB(b);
      setFunnelC(c);
    } catch (e: any) {
      toast.error("Failed to load funnels: " + e.message);
    } finally {
      setFunnelsLoading(false);
    }
  }, [range]);

  // ── Sessions loader ──────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const params: Record<string, string> = {
        limit: "20",
        offset: String(sessionsOffset),
      };
      if (minDuration) params.min_duration = minDuration;
      const data = await phGet("sessions", params);
      setSessions(data.results ?? []);
      setSessionsTotal(data.count ?? 0);
    } catch (e: any) {
      toast.error("Failed to load sessions: " + e.message);
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionsOffset, minDuration]);

  // ── Persons loader ───────────────────────────────────────────────────────
  const loadPersons = useCallback(async () => {
    setPersonsLoading(true);
    try {
      const params: Record<string, string> = { limit: "50", offset: "0" };
      if (personSearch) params.search = personSearch;
      const data = await phGet("persons", params);
      setPersons(data.results ?? []);
      setPersonsTotal(data.count ?? 0);
    } catch (e: any) {
      toast.error("Failed to load users: " + e.message);
    } finally {
      setPersonsLoading(false);
    }
  }, [personSearch]);

  // ── Cohorts loader ───────────────────────────────────────────────────────
  const loadCohorts = useCallback(async () => {
    setCohortsLoading(true);
    try {
      const data = await phGet("cohorts");
      setCohorts(data.results ?? []);
    } catch (e: any) {
      toast.error("Failed to load cohorts: " + e.message);
    } finally {
      setCohortsLoading(false);
    }
  }, []);

  // ── Tab-based loading ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "overview") loadOverview();
  }, [isAuthorized, tab, range, loadOverview]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "funnels") loadFunnels();
  }, [isAuthorized, tab, range, loadFunnels]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "sessions") loadSessions();
  }, [isAuthorized, tab, sessionsOffset, minDuration, loadSessions]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "users") loadPersons();
  }, [isAuthorized, tab, personSearch, loadPersons]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "cohorts") loadCohorts();
  }, [isAuthorized, tab, loadCohorts]);

  // ── Person events expand ─────────────────────────────────────────────────
  async function togglePerson(uuid: string) {
    if (expandedPerson === uuid) {
      setExpandedPerson(null);
      return;
    }
    setExpandedPerson(uuid);
    if (personEvents[uuid]) return;
    try {
      const data = await phGet("person_events", { person_id: uuid });
      setPersonEvents((prev) => ({ ...prev, [uuid]: data.results ?? [] }));
    } catch {
      // silently fail — events are optional
    }
  }

  // ── Cohort persons expand ────────────────────────────────────────────────
  async function toggleCohort(id: number) {
    if (expandedCohort === id) {
      setExpandedCohort(null);
      return;
    }
    setExpandedCohort(id);
    if (cohortPersons[id]) return;
    try {
      const data = await phGet("cohort_persons", { cohort_id: String(id) });
      setCohortPersons((prev) => ({ ...prev, [id]: data.results ?? [] }));
    } catch {
      // silently fail
    }
  }

  function exportCohortEmails(id: number) {
    const people = cohortPersons[id] ?? [];
    const emails = people
      .map((p) => p.properties?.email ?? p.distinct_ids?.[0] ?? "")
      .filter(Boolean)
      .join(", ");
    if (!emails) { toast.error("No emails found — expand cohort first"); return; }
    navigator.clipboard.writeText(emails).then(() => toast.success("Emails copied to clipboard!"));
  }

  // ── Chart data ──────────────────────────────────────────────────────────
  const dailyLabels = daily.map((d) => d.day.slice(5)); // MM-DD
  const visitorsChart = {
    labels: dailyLabels,
    datasets: [
      {
        label: "Visitors",
        data: daily.map((d) => d.visitors),
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139,92,246,0.12)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#8b5cf6",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
      },
      {
        label: "Signups",
        data: daily.map((d) => d.signups),
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.08)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#10b981",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
      },
    ],
  };

  const paymentsChart = {
    labels: dailyLabels,
    datasets: [
      {
        label: "Payments",
        data: daily.map((d) => d.payments),
        backgroundColor: "rgba(245,158,11,0.8)",
        borderColor: "#f59e0b",
        borderWidth: 2,
        borderRadius: 4,
      },
      {
        label: "Campaigns",
        data: daily.map((d) => d.campaigns),
        backgroundColor: "rgba(6,182,212,0.8)",
        borderColor: "#06b6d4",
        borderWidth: 2,
        borderRadius: 4,
      },
    ],
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="font-['Satoshi'] text-neutral-500">Checking access…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header row */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-['Clash_Display'] text-2xl font-semibold text-neutral-900">
              Analytics
            </h1>
            <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
              Behavioural data powered by PostHog
            </p>
          </div>

          {/* Date range — only for data tabs */}
          {(tab === "overview" || tab === "funnels") && (
            <div className="flex gap-2">
              {(["7d", "30d", "90d"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-lg border-2 border-neutral-900 px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${
                    range === r ? "bg-violet-500 text-white" : "bg-white text-neutral-900"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-2 font-['Satoshi'] text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-violet-500 text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ───────────────────────────────────────────────── */}
        {tab === "overview" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {overviewLoading ? (
              <Spinner />
            ) : (
              <>
                {/* Stat cards */}
                <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Unique Visitors" value={stats?.visitors ?? 0} color="violet" />
                  <StatCard label="Resume Uploads" value={stats?.signups ?? 0} color="emerald" />
                  <StatCard label="Payments" value={stats?.payments ?? 0} color="amber" />
                  <StatCard label="Campaigns Started" value={stats?.campaigns ?? 0} color="cyan" />
                </div>

                {/* Charts */}
                <div className="mb-6 grid gap-4 lg:grid-cols-2">
                  <ChartCard title="Daily Visitors vs Signups">
                    <Line
                      data={visitorsChart}
                      options={{
                        ...chartOpts,
                        plugins: {
                          ...chartOpts.plugins,
                          legend: {
                            display: true,
                            position: "top" as const,
                            labels: {
                              font: { family: "'Satoshi', sans-serif", size: 12 },
                              usePointStyle: true,
                              padding: 12,
                            },
                          },
                        },
                      }}
                    />
                  </ChartCard>
                  <ChartCard title="Daily Payments & Campaigns">
                    <Bar
                      data={paymentsChart}
                      options={{
                        ...chartOpts,
                        plugins: {
                          ...chartOpts.plugins,
                          legend: {
                            display: true,
                            position: "top" as const,
                            labels: {
                              font: { family: "'Satoshi', sans-serif", size: 12 },
                              usePointStyle: true,
                              padding: 12,
                            },
                          },
                        },
                      }}
                    />
                  </ChartCard>
                </div>

                {/* Top pages */}
                <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                  <div className="border-b-2 border-neutral-900 px-6 py-4">
                    <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                      Top Pages
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Page
                          </th>
                          <th className="px-6 py-3 text-right font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Views
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPages.map((p, i) => (
                          <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                            <td className="px-6 py-3 font-['Satoshi'] text-sm text-neutral-700 font-mono">
                              {p.url}
                            </td>
                            <td className="px-6 py-3 text-right font-['Satoshi'] text-sm font-semibold text-neutral-900">
                              {p.views.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {topPages.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400">
                              No data yet — events will appear once users visit the site
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── FUNNELS TAB ────────────────────────────────────────────────── */}
        {tab === "funnels" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {funnelsLoading ? (
              <Spinner />
            ) : (
              <div className="space-y-6">
                <FunnelChart
                  title="Full Product Funnel"
                  subtitle="Visitor → Email Sent — where are people dropping off?"
                  steps={funnelA}
                />
                <FunnelChart
                  title="Onboarding Funnel"
                  subtitle="Resume upload → payment — biggest leak in your onboarding"
                  steps={funnelB}
                />
                <FunnelChart
                  title="Post-Payment Activation"
                  subtitle="Of people who paid, who actually launched a campaign?"
                  steps={funnelC}
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ── SESSIONS TAB ───────────────────────────────────────────────── */}
        {tab === "sessions" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="font-['Satoshi'] text-sm text-neutral-500">Min duration:</span>
              {[
                { label: "Any", value: "" },
                { label: "> 30s", value: "30" },
                { label: "> 1 min", value: "60" },
                { label: "> 3 min", value: "180" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setMinDuration(opt.value); setSessionsOffset(0); }}
                  className={`rounded-lg border-2 border-neutral-900 px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${
                    minDuration === opt.value ? "bg-violet-500 text-white" : "bg-white text-neutral-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <div className="border-b-2 border-neutral-900 px-6 py-4">
                <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                  Session Recordings
                </h2>
                <p className="mt-0.5 font-['Satoshi'] text-xs text-neutral-500">
                  Click "Watch" to open the full replay in PostHog
                </p>
              </div>
              {sessionsLoading ? (
                <div className="flex justify-center py-12"><Spinner inline /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <th className="px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">Person</th>
                        <th className="px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">Duration</th>
                        <th className="px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">Clicks</th>
                        <th className="px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">Active</th>
                        <th className="px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">Time</th>
                        <th className="px-6 py-3 text-right font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">Replay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="px-6 py-3 font-['Satoshi'] text-sm text-neutral-800">
                            {s.person?.properties?.email ?? s.person?.name ?? "Anonymous"}
                          </td>
                          <td className="px-6 py-3 font-['Satoshi'] text-sm text-neutral-600">
                            {fmtDuration(s.recording_duration)}
                          </td>
                          <td className="px-6 py-3 font-['Satoshi'] text-sm text-neutral-600">
                            {s.click_count ?? 0}
                          </td>
                          <td className="px-6 py-3 font-['Satoshi'] text-sm text-neutral-600">
                            {fmtDuration(s.active_seconds)}
                          </td>
                          <td className="px-6 py-3 font-['Satoshi'] text-sm text-neutral-500">
                            {timeAgo(s.start_time)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <a
                              href={`https://eu.posthog.com/project/150589/replay/${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border-2 border-neutral-900 bg-violet-500 px-3 py-1 font-['Satoshi'] text-xs font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
                            >
                              Watch →
                            </a>
                          </td>
                        </tr>
                      ))}
                      {sessions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400">
                            No sessions found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {sessionsTotal > 20 && (
                <div className="flex items-center justify-between border-t border-neutral-200 px-6 py-4">
                  <p className="font-['Satoshi'] text-sm text-neutral-500">
                    {sessionsOffset + 1}–{Math.min(sessionsOffset + 20, sessionsTotal)} of {sessionsTotal}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSessionsOffset(Math.max(0, sessionsOffset - 20))}
                      disabled={sessionsOffset === 0}
                      className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40 transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setSessionsOffset(sessionsOffset + 20)}
                      disabled={sessionsOffset + 20 >= sessionsTotal}
                      className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40 transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── USERS TAB ──────────────────────────────────────────────────── */}
        {tab === "users" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by email or name…"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                className="w-full max-w-sm rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] outline-none focus:border-violet-500"
              />
            </div>

            <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <div className="border-b-2 border-neutral-900 px-6 py-4">
                <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                  User Profiles
                </h2>
                {personsTotal > 0 && (
                  <p className="mt-0.5 font-['Satoshi'] text-xs text-neutral-500">
                    {personsTotal.toLocaleString()} total persons
                  </p>
                )}
              </div>
              {personsLoading ? (
                <div className="flex justify-center py-12"><Spinner inline /></div>
              ) : (
                <div>
                  {persons.map((p) => {
                    const email = p.properties?.email ?? p.distinct_ids?.[0] ?? "Unknown";
                    const paid = p.properties?.total_paid_cents > 0;
                    const isExpanded = expandedPerson === p.uuid;
                    return (
                      <div key={p.uuid} className="border-b border-neutral-100 last:border-0">
                        <div
                          className="flex cursor-pointer items-center gap-4 px-6 py-4 hover:bg-neutral-50"
                          onClick={() => togglePerson(p.uuid)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-['Satoshi'] text-sm font-semibold text-neutral-900">
                              {email}
                            </p>
                            <p className="font-['Satoshi'] text-xs text-neutral-400">
                              First seen {new Date(p.created_at).toLocaleDateString()} · ID {p.uuid.slice(0, 8)}
                            </p>
                          </div>
                          {paid && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-emerald-700">
                              Paid
                            </span>
                          )}
                          <a
                            href={`https://eu.posthog.com/project/150589/person/${p.uuid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded-lg border border-neutral-300 bg-white px-2 py-1 font-['Satoshi'] text-xs text-neutral-600 hover:border-violet-400 hover:text-violet-600"
                          >
                            PostHog ↗
                          </a>
                          <span className="shrink-0 text-neutral-400">{isExpanded ? "▲" : "▼"}</span>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
                                <p className="mb-2 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                  Last 10 Events
                                </p>
                                {personEvents[p.uuid] ? (
                                  personEvents[p.uuid].length > 0 ? (
                                    <div className="space-y-1">
                                      {personEvents[p.uuid].map((ev: any[], i: number) => (
                                        <div key={i} className="flex items-center gap-3">
                                          <span className="font-['Satoshi'] text-xs text-neutral-400 w-36 shrink-0">
                                            {new Date(ev[1]).toLocaleString()}
                                          </span>
                                          <span className="font-['Satoshi'] text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                                            {ev[0]}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="font-['Satoshi'] text-xs text-neutral-400">No events found</p>
                                  )
                                ) : (
                                  <p className="font-['Satoshi'] text-xs text-neutral-400">Loading events…</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                  {persons.length === 0 && (
                    <p className="px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400">
                      No users found
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── COHORTS TAB ────────────────────────────────────────────────── */}
        {tab === "cohorts" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {cohortsLoading ? (
              <Spinner />
            ) : (
              <div className="space-y-3">
                {cohorts.length === 0 ? (
                  <div className="rounded-xl border-2 border-neutral-900 bg-white px-6 py-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                    <p className="font-['Satoshi'] text-sm text-neutral-400">
                      No cohorts found. Create cohorts in PostHog → People &amp; Groups → Cohorts.
                    </p>
                  </div>
                ) : (
                  cohorts.map((c) => {
                    const isExpanded = expandedCohort === c.id;
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                      >
                        <div
                          className="flex cursor-pointer items-center gap-4 px-6 py-4"
                          onClick={() => toggleCohort(c.id)}
                        >
                          <div className="flex-1">
                            <p className="font-['Satoshi'] text-sm font-semibold text-neutral-900">
                              {c.name}
                            </p>
                            {c.description && (
                              <p className="font-['Satoshi'] text-xs text-neutral-400">{c.description}</p>
                            )}
                          </div>
                          <span className="rounded-full bg-violet-100 px-3 py-1 font-['Satoshi'] text-sm font-bold text-violet-700">
                            {(c.count ?? 0).toLocaleString()} users
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); exportCohortEmails(c.id); }}
                            className="rounded-lg border-2 border-neutral-900 bg-amber-400 px-3 py-1 font-['Satoshi'] text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
                          >
                            Export Emails
                          </button>
                          <span className="text-neutral-400">{isExpanded ? "▲" : "▼"}</span>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t-2 border-neutral-200 bg-neutral-50 px-6 py-4">
                                <p className="mb-2 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                  Sample Users (top 10)
                                </p>
                                {cohortPersons[c.id] ? (
                                  cohortPersons[c.id].length > 0 ? (
                                    <div className="space-y-1">
                                      {cohortPersons[c.id].map((p) => (
                                        <div key={p.uuid} className="flex items-center gap-3">
                                          <span className="font-['Satoshi'] text-sm text-neutral-700">
                                            {p.properties?.email ?? p.distinct_ids?.[0] ?? p.uuid.slice(0, 8)}
                                          </span>
                                          <a
                                            href={`https://eu.posthog.com/project/150589/person/${p.uuid}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-['Satoshi'] text-xs text-violet-500 hover:underline"
                                          >
                                            View ↗
                                          </a>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="font-['Satoshi'] text-xs text-neutral-400">No users found in this cohort</p>
                                  )
                                ) : (
                                  <p className="font-['Satoshi'] text-xs text-neutral-400">Loading…</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "violet" | "emerald" | "amber" | "cyan";
}) {
  const colors = {
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
  };
  return (
    <div className={`rounded-xl border-2 border-neutral-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]`}>
      <p className="font-['Satoshi'] text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p className={`mt-1 font-['Clash_Display'] text-3xl font-bold ${colors[color].split(" ")[2]}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
      <div className="border-b-2 border-neutral-900 px-6 py-4">
        <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">{title}</h2>
      </div>
      <div className="p-6" style={{ height: 260 }}>
        {children}
      </div>
    </div>
  );
}

function FunnelChart({
  title,
  subtitle,
  steps,
}: {
  title: string;
  subtitle: string;
  steps: FunnelStep[];
}) {
  if (steps.length === 0) return null;
  const max = steps[0]?.count || 1;
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
      <div className="border-b-2 border-neutral-900 px-6 py-4">
        <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">{title}</h2>
        <p className="mt-0.5 font-['Satoshi'] text-xs text-neutral-400">{subtitle}</p>
      </div>
      <div className="p-6 space-y-4">
        {steps.map((s, i) => {
          const barWidth = max > 0 ? Math.max(4, Math.round((s.count / max) * 100)) : 4;
          const isDrop = s.pct_from_prev < 50 && i > 0;
          return (
            <div key={i} className="flex items-center gap-4">
              <div className="w-40 shrink-0 text-right font-['Satoshi'] text-sm text-neutral-600 truncate">
                {s.name}
              </div>
              <div className="flex-1 h-8 bg-neutral-100 rounded-lg overflow-hidden relative">
                <div
                  className={`h-full rounded-lg transition-all duration-500 ${isDrop ? "bg-red-400" : "bg-violet-400"}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="w-24 shrink-0 text-right">
                <span className="font-['Satoshi'] text-sm font-bold text-neutral-900">
                  {s.count.toLocaleString()}
                </span>
                {i > 0 && (
                  <span className={`ml-2 font-['Satoshi'] text-xs font-semibold ${isDrop ? "text-red-500" : "text-emerald-500"}`}>
                    {s.pct_from_prev}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <p className="font-['Satoshi'] text-xs text-neutral-400 pt-2">
          Overall conversion: {steps[0]?.count > 0 ? Math.round((steps[steps.length - 1].count / steps[0].count) * 100) : 0}%
          &nbsp;({steps[0]?.count.toLocaleString()} → {steps[steps.length - 1]?.count.toLocaleString()})
        </p>
      </div>
    </div>
  );
}

function Spinner({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-violet-500" />
    );
  }
  return (
    <div className="flex justify-center py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-violet-500" />
    </div>
  );
}
