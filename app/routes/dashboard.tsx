import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { AdminHeader, StatCard } from "~/components";
import { SourceBreakdown } from "~/components/source-breakdown";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

type Triple = { inr: number; usd: number; b2b: number; revenue: number; orders: number };
type Period = { rev: Triple; signups: number; outreach: number };
type Overview = {
  fxRate: number;
  today: string;
  periods: Record<"today" | "yesterday" | "last7" | "last30" | "allTime", Period>;
  daily: { day: string; revenue: number; signups: number; orders: number }[];
};

type PeriodKey = keyof Overview["periods"] | "custom";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "allTime", label: "Lifetime" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 days" },
  { key: "last30", label: "30 days" },
  { key: "custom", label: "Custom" },
];

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

async function phQuery(query: string) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}

export default function Dashboard() {
  const { isAuthorized } = useAdminGuard();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("allTime");
  const todayIso = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const [cStart, setCStart] = useState(todayIso);
  const [cEnd, setCEnd] = useState(todayIso);
  const [visits, setVisits] = useState<number | null>(null);
  const [tickets, setTickets] = useState<{ open: number; high: number } | null>(null);

  // Open support tickets — drives the red alert bar.
  useEffect(() => {
    if (!isAuthorized) return;
    (async () => {
      const token = await getToken();
      fetch(`/api/tickets?status=open`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then((r) => r.json())
        .then((d) => setTickets({ open: Number(d?.stats?.open) || 0, high: Number(d?.stats?.high_open) || 0 }))
        .catch(() => setTickets(null));
    })();
  }, [isAuthorized]);

  // IST date N days ago (matches the API's day bucketing).
  const istShift = (days: number) => new Date(Date.now() + 5.5 * 3600 * 1000 - days * 86400000).toISOString().slice(0, 10);
  // Date range for the selected period. Undefined = lifetime (no time filter).
  const rangeFor = (pk: PeriodKey): { start?: string; end?: string } => {
    switch (pk) {
      case "today": return { start: todayIso, end: todayIso };
      case "yesterday": { const y = istShift(1); return { start: y, end: y }; }
      case "last7": return { start: istShift(6), end: todayIso };
      case "last30": return { start: istShift(29), end: todayIso };
      case "custom": return cStart && cEnd ? { start: cStart, end: cEnd } : {};
      default: return {}; // allTime
    }
  };
  const { start: srcStart, end: srcEnd } = rangeFor(period);

  // Visits (unique people with a pageview) for the selected period — from PostHog.
  useEffect(() => {
    if (!isAuthorized) return;
    const IST = "toDate(timestamp + INTERVAL 330 MINUTE)";
    const tw = srcStart && srcEnd ? `AND ${IST} >= toDate('${srcStart}') AND ${IST} <= toDate('${srcEnd}')` : "";
    setVisits(null);
    phQuery(`SELECT uniq(person_id) FROM events WHERE event='$pageview' ${tw}`)
      .then((res) => setVisits(+(res.results?.[0]?.[0]) || 0))
      .catch(() => setVisits(null));
  }, [isAuthorized, period, srcStart, srcEnd]);

  const load = async (start?: string, end?: string) => {
    const qs = start && end ? `?start=${start}&end=${end}` : "";
    const token = await getToken();
    fetch(`/api/overview${qs}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : (setData(d), setErr(""))))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    if (!isAuthorized) return;
    load();
  }, [isAuthorized]);

  const applyCustom = () => {
    if (cStart && cEnd && cStart <= cEnd) load(cStart, cEnd);
  };

  const p = period === "custom" ? (data?.periods as any)?.custom : data?.periods[period as keyof Overview["periods"]];

  const trend = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.daily.map((d) => d.day.slice(5)),
      datasets: [
        {
          label: "Revenue (₹)", data: data.daily.map((d) => d.revenue), yAxisID: "y",
          borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.12)", fill: true, tension: 0.35, pointRadius: 0,
        },
        {
          label: "Signups", data: data.daily.map((d) => d.signups), yAxisID: "y1",
          borderColor: "#10b981", backgroundColor: "transparent", borderDash: [5, 4], tension: 0.35, pointRadius: 0,
        },
      ],
    };
  }, [data]);

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        {tickets && tickets.open > 0 && (
          <Link
            to="/tickets"
            className="mb-6 flex items-center justify-between gap-3 rounded-2xl border-2 border-red-700 bg-red-600 px-5 py-4 text-white shadow-[4px_4px_0px_0px_rgba(127,29,29,1)] transition-transform hover:-translate-y-0.5"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">!</span>
              <span className="font-['Clash_Display'] text-lg font-bold">
                {tickets.open} open support ticket{tickets.open === 1 ? "" : "s"}
                {tickets.high > 0 && <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold align-middle">{tickets.high} high priority</span>}
              </span>
            </span>
            <span className="text-sm font-semibold whitespace-nowrap">View tickets →</span>
          </Link>
        )}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">
              Overview
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Revenue and signups, IST · matches the MSL dashboard{data ? ` · FX ₹${data.fxRate}/$` : ""}
            </p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
            {PERIODS.map((pp) => (
              <button
                key={pp.key}
                onClick={() => setPeriod(pp.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  period === pp.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {pp.label}
              </button>
            ))}
          </div>
        </div>

        {period === "custom" && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border-2 border-neutral-900 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
            <div>
              <label className="block text-xs font-semibold text-neutral-500">From</label>
              <input type="date" value={cStart} max={cEnd} onChange={(e) => setCStart(e.target.value)}
                className="mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500">To</label>
              <input type="date" value={cEnd} min={cStart} max={todayIso} onChange={(e) => setCEnd(e.target.value)}
                className="mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm" />
            </div>
            <button onClick={applyCustom}
              className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              Apply
            </button>
            {p && (p as any).start && (
              <span className="text-xs text-neutral-500">{(p as any).start} → {(p as any).end}</span>
            )}
          </div>
        )}

        {err && (
          <div className="mt-6 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        )}
        {!data && !err && <div className="mt-10 text-center text-neutral-400">Loading…</div>}
        {period === "custom" && !p && !err && (
          <div className="mt-6 text-sm text-neutral-500">Pick a date range and hit Apply.</div>
        )}

        {p && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border-2 border-neutral-900 bg-purple-500 p-6 text-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Revenue</div>
                <div className="mt-1 font-['Clash_Display'] text-3xl font-semibold md:text-4xl">{inr(p.rev.revenue)}</div>
                <div className="mt-2 space-y-0.5 text-[11px] leading-tight opacity-90">
                  <div>{inr(p.rev.inr)} INR · {usd(p.rev.usd)} USD</div>
                  {p.rev.b2b > 0 && <div>+ {inr(p.rev.b2b)} B2B</div>}
                </div>
              </div>
              <StatCard value={p.rev.orders} label="Paid Orders" color="orange" />
              <StatCard value={p.signups.toLocaleString("en-IN")} label="Signups" color="green" />
              <StatCard value={p.outreach} label="Outreach Orders" color="pink" />
              <StatCard value={visits === null ? "…" : visits.toLocaleString("en-IN")} label={period === "allTime" ? "Lifetime Visits" : "Visits"} color="yellow" />
            </div>

            <div className="mt-6 rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <h2 className="mb-4 font-['Clash_Display'] text-xl font-medium text-neutral-950">Last 30 days</h2>
              {trend && (
                <div className="h-72">
                  <Line
                    data={trend}
                    options={{
                      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
                      plugins: { legend: { position: "top" } },
                      scales: {
                        y: { position: "left", title: { display: true, text: "Revenue (₹)" }, beginAtZero: true },
                        y1: { position: "right", title: { display: true, text: "Signups" }, beginAtZero: true, grid: { drawOnChartArea: false } },
                      },
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mt-6"><SourceBreakdown start={srcStart} end={srcEnd} /></div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { to: "/funnel", label: "Funnel" },
                { to: "/analytics", label: "Analytics" },
                { to: "/outreach-orders", label: "Outreach Orders" },
                { to: "/paid-users", label: "Paid Users" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-xl border-2 border-neutral-900 bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-900 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:-translate-y-0.5"
                >
                  {l.label} →
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
