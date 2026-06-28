import { useEffect, useState, useCallback } from "react";
import { getToken } from "~/lib/api";
import { AdminHeader } from "~/components";
import { SourceBreakdown } from "~/components/source-breakdown";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

async function phQuery(query: string) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (n: number) => (Math.round(n) ?? 0).toLocaleString("en-US");
const niceDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Day = { day: string; visitors: number; signups: number; orders: number; emails: number; replies: number; paid: number; reached: number };
const METRICS = [
  { key: "visitors", label: "Visitors" },
  { key: "signups", label: "Signups" },
  { key: "orders", label: "Outreach Orders" },
  { key: "emails", label: "Emails Sent" },
  { key: "replies", label: "Replies" },
  { key: "replyRate", label: "Reply Rate %", rate: true },
  { key: "paid", label: "Paid Users" },
] as const;
const PRESETS = [14, 30, 90] as const;
const GROUPS = [{ g: 1, label: "Daily" }, { g: 3, label: "3-day" }, { g: 7, label: "Weekly" }] as const;

// Colour a whole chronological series. An uptick = green (reset). Anything that's
// NOT growth (flat OR down) = red, getting progressively darker the longer it stays
// without an uptick — so prolonged stagnation deepens to red, only broken by a green.
const REDS = [
  "bg-red-50 text-red-700", "bg-red-100 text-red-800", "bg-red-200 text-red-900",
  "bg-red-300 text-red-900", "bg-red-400 text-white", "bg-red-500 text-white",
];
function colorSeries(vals: number[]): string[] {
  const out: string[] = [];
  let streak = 0; // consecutive buckets with no growth
  for (let i = 0; i < vals.length; i++) {
    if (i === 0) { out.push(""); continue; }
    const cur = vals[i], prev = vals[i - 1];
    if (cur > prev) {
      streak = 0;
      const ch = prev === 0 ? 1 : (cur - prev) / Math.abs(prev);
      out.push(ch > 0.2 ? "bg-emerald-200 text-emerald-900" : "bg-emerald-100 text-emerald-800");
    } else {
      out.push(REDS[Math.min(streak, REDS.length - 1)]);
      streak++;
    }
  }
  return out;
}

export default function DailyDashboard() {
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState(1);
  const [daily, setDaily] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (d: number) => {
    setLoading(true); setError("");
    try {
      const end = isoDate(new Date());
      const start = isoDate(new Date(Date.now() - (d - 1) * 86400000));
      const token = await getToken();
      const [dbRes, visRes] = await Promise.all([
        fetch(`/api/dashboard?start=${start}&end=${end}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((r) => r.json()),
        // uniq(distinct_id) not uniq(person_id): person_id forces a person_distinct_id_overrides
        // JOIN that made the 30d pageview query run ~5min and hit the 300s gateway timeout (500),
        // hanging the whole dashboard. distinct_id needs no join — same query returns in ~1.5s.
        phQuery(`SELECT toDate(timestamp) AS day, uniq(distinct_id) AS v FROM events WHERE event='$pageview' AND timestamp >= toDateTime('${start} 00:00:00') AND timestamp <= toDateTime('${end} 23:59:59') GROUP BY day`),
      ]);
      if (dbRes.error) throw new Error(dbRes.error);
      const visMap: Record<string, number> = {};
      for (const r of visRes.results ?? []) visMap[String(r[0]).slice(0, 10)] = +r[1] || 0;
      setDaily((dbRes.daily ?? []).map((r: any) => ({ ...r, visitors: visMap[r.day] || 0 })));
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(days); }, [days, load]);

  // bucket the daily rows into groups of `group`
  const buckets: { label: string; data: Record<string, number> }[] = [];
  for (let i = 0; i < daily.length; i += group) {
    const chunk = daily.slice(i, i + group);
    if (!chunk.length) continue;
    const sum = (k: string) => chunk.reduce((a, r) => a + ((r as any)[k] || 0), 0);
    const emails = sum("emails"); const replies = sum("replies"); const reached = sum("reached");
    buckets.push({
      label: group === 1 ? niceDay(chunk[0].day) : `${niceDay(chunk[0].day)}–${niceDay(chunk[chunk.length - 1].day)}`,
      data: { visitors: sum("visitors"), signups: sum("signups"), orders: sum("orders"), emails, replies, paid: sum("paid"), reached, replyRate: reached ? Math.round((replies / reached) * 1000) / 10 : 0 },
    });
  }

  // Per-metric colour series (chronological), then display newest-first.
  const colorByMetric: Record<string, string[]> = {};
  for (const m of METRICS) colorByMetric[m.key] = colorSeries(buckets.map((b) => b.data[m.key] || 0));
  const order = buckets.map((_, i) => i).reverse(); // newest date on the left

  // totals
  const T = (k: string) => daily.reduce((a, r) => a + ((r as any)[k] || 0), 0);
  const totEmails = T("emails"); const totReplies = T("replies"); const totReached = T("reached");
  const cards = [
    { label: "Total Visitors", v: fmt(T("visitors")) },
    { label: "Total Signups", v: fmt(T("signups")) },
    { label: "Outreach Orders", v: fmt(T("orders")) },
    { label: "Emails Sent", v: fmt(totEmails) },
    { label: "Replies", v: fmt(totReplies) },
    { label: "Avg Reply Rate", v: `${totReached ? Math.round((totReplies / totReached) * 1000) / 10 : 0}%` },
    { label: "Paid Conversions", v: fmt(T("paid")) },
  ];

  // Chart series (chronological, oldest→newest left→right)
  const cl = daily.map((d) => niceDay(d.day));
  const r1 = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const chartData = {
    volume: {
      labels: cl,
      datasets: [
        { label: "Visitors", data: daily.map((d) => d.visitors || 0), yAxisID: "y", borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.12)", fill: true, tension: 0.35, pointRadius: 0 },
        { label: "Signups", data: daily.map((d) => d.signups || 0), yAxisID: "y1", borderColor: "#10b981", tension: 0.35, pointRadius: 0 },
      ],
    },
    conv: {
      labels: cl,
      datasets: [
        { label: "Visitor → Signup %", data: daily.map((d) => r1(d.signups, d.visitors)), borderColor: "#10b981", tension: 0.35, pointRadius: 0 },
        { label: "Signup → Outreach order %", data: daily.map((d) => r1(d.orders, d.signups)), borderColor: "#f59e0b", tension: 0.35, pointRadius: 0 },
        { label: "Order → Paid %", data: daily.map((d) => r1(d.paid, d.orders)), borderColor: "#ec4899", tension: 0.35, pointRadius: 0 },
      ],
    },
    engage: {
      labels: cl,
      datasets: [
        { label: "Emails sent", data: daily.map((d) => d.emails || 0), backgroundColor: "#c4b5fd", yAxisID: "y" },
        { label: "Reply rate %", type: "line" as const, data: daily.map((d) => r1(d.replies, d.emails)), borderColor: "#7c3aed", yAxisID: "y1", tension: 0.35, pointRadius: 0 },
      ],
    },
  };
  const baseOpts = { responsive: true, maintainAspectRatio: false, interaction: { mode: "index" as const, intersect: false }, plugins: { legend: { position: "top" as const } } };

  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[100rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-bold text-neutral-900">Daily Dashboard</h1>
            <p className="text-sm text-neutral-600 mt-1">Newest date first. Green = grew vs the previous day; red = flat or down, getting darker the longer it stays without an uptick.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              {GROUPS.map((x) => <button key={x.g} onClick={() => setGroup(x.g)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${group === x.g ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{x.label}</button>)}
            </div>
            {PRESETS.map((p) => <button key={p} onClick={() => setDays(p)} className={`rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${days === p ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`}>{p}d</button>)}
          </div>
        </div>

        {error && <div className="mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-8">
              {cards.map((c) => (
                <div key={c.label} className={`p-4 ${card}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{c.label}</p>
                  <p className="font-['Clash_Display'] text-2xl lg:text-3xl font-bold text-neutral-900 mt-1">{c.v}</p>
                </div>
              ))}
            </div>

            {/* Metric × bucket grid with change colouring */}
            <div className={`overflow-hidden ${card}`}>
              <div className="px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50 flex items-baseline justify-between">
                <h2 className="font-['Clash_Display'] text-lg font-bold">{GROUPS.find((x) => x.g === group)?.label} view</h2>
                <span className="text-xs text-neutral-500">{buckets.length} columns</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-neutral-50">
                    <th className="sticky left-0 z-10 bg-neutral-50 text-left px-4 py-3 font-semibold text-neutral-700 border-b border-neutral-200 min-w-[150px]">Metric</th>
                    {order.map((ci) => <th key={ci} className="px-3 py-3 text-right font-semibold text-neutral-700 border-b border-l border-neutral-200 whitespace-nowrap">{buckets[ci].label}</th>)}
                  </tr></thead>
                  <tbody>
                    {METRICS.map((m) => (
                      <tr key={m.key}>
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-neutral-900 border-b border-neutral-100 whitespace-nowrap">{m.label}</td>
                        {order.map((ci) => {
                          const cur = buckets[ci].data[m.key] || 0;
                          return (
                            <td key={ci} className={`px-3 py-2.5 text-right border-b border-l border-neutral-100 tabular-nums font-semibold ${colorByMetric[m.key][ci]}`}>
                              {m.rate ? `${cur}%` : fmt(cur)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Trends + conversion metrics */}
            <div className="grid gap-6 lg:grid-cols-2 mt-8">
              <div className={`p-5 ${card}`}>
                <h2 className="font-['Clash_Display'] text-lg font-bold mb-3">Visitors & Signups</h2>
                <div className="h-64"><Line data={chartData.volume} options={{ ...baseOpts, scales: { y: { position: "left", title: { display: true, text: "Visitors" }, beginAtZero: true }, y1: { position: "right", title: { display: true, text: "Signups" }, beginAtZero: true, grid: { drawOnChartArea: false } } } }} /></div>
              </div>
              <div className={`p-5 ${card}`}>
                <h2 className="font-['Clash_Display'] text-lg font-bold mb-1">Conversion rates</h2>
                <p className="text-xs text-neutral-500 mb-3">Where people convert (or leak) step to step.</p>
                <div className="h-64"><Line data={chartData.conv} options={{ ...baseOpts, scales: { y: { beginAtZero: true, title: { display: true, text: "%" } } } }} /></div>
              </div>
              <div className={`p-5 lg:col-span-2 ${card}`}>
                <h2 className="font-['Clash_Display'] text-lg font-bold mb-3">Outreach: emails sent vs reply rate</h2>
                <div className="h-64"><Bar data={chartData.engage as any} options={{ ...baseOpts, scales: { y: { position: "left", title: { display: true, text: "Emails" }, beginAtZero: true }, y1: { position: "right", title: { display: true, text: "Reply %" }, beginAtZero: true, grid: { drawOnChartArea: false } } } }} /></div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mt-4">Newest date first. Green = grew vs the day before; red = flat or down, deepening the longer it stays without growth. Visitors from PostHog (unique people/day); signups, orders, emails, replies, paid from Postgres. Instagram followers aren't in any system — add an IG integration or a manual entry if you want that row.</p>

            <div className="mt-8"><SourceBreakdown start={isoDate(new Date(Date.now() - (days - 1) * 86400000))} end={isoDate(new Date())} /></div>
          </>
        )}
      </main>
    </div>
  );
}
