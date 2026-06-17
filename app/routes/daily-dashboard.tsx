import { useEffect, useState, useCallback } from "react";
import { AdminHeader } from "~/components";

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

type Day = { day: string; visitors: number; signups: number; orders: number; emails: number; replies: number; paid: number };
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

// colour a cell by change vs the previous bucket
function changeClass(cur: number, prev: number | null) {
  if (prev === null || prev === undefined) return "";
  if (cur === prev) return "bg-neutral-100 text-neutral-500";
  const ch = prev === 0 ? 1 : (cur - prev) / Math.abs(prev);
  if (cur > prev) return ch > 0.2 ? "bg-emerald-200 text-emerald-900" : "bg-emerald-50 text-emerald-800";
  return ch < -0.2 ? "bg-red-200 text-red-900" : "bg-red-50 text-red-800";
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
      const [dbRes, visRes] = await Promise.all([
        fetch(`/api/dashboard?start=${start}&end=${end}`, { credentials: "include" }).then((r) => r.json()),
        phQuery(`SELECT toDate(timestamp) AS day, uniq(person_id) AS v FROM events WHERE event='$pageview' AND timestamp >= toDateTime('${start} 00:00:00') AND timestamp <= toDateTime('${end} 23:59:59') GROUP BY day`),
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
    const emails = sum("emails"); const replies = sum("replies");
    buckets.push({
      label: group === 1 ? niceDay(chunk[0].day) : `${niceDay(chunk[0].day)}–${niceDay(chunk[chunk.length - 1].day)}`,
      data: { visitors: sum("visitors"), signups: sum("signups"), orders: sum("orders"), emails, replies, paid: sum("paid"), replyRate: emails ? Math.round((replies / emails) * 1000) / 10 : 0 },
    });
  }

  // totals
  const T = (k: string) => daily.reduce((a, r) => a + ((r as any)[k] || 0), 0);
  const totEmails = T("emails"); const totReplies = T("replies");
  const cards = [
    { label: "Total Visitors", v: fmt(T("visitors")) },
    { label: "Total Signups", v: fmt(T("signups")) },
    { label: "Outreach Orders", v: fmt(T("orders")) },
    { label: "Emails Sent", v: fmt(totEmails) },
    { label: "Replies", v: fmt(totReplies) },
    { label: "Avg Reply Rate", v: `${totEmails ? Math.round((totReplies / totEmails) * 1000) / 10 : 0}%` },
    { label: "Paid Conversions", v: fmt(T("paid")) },
  ];

  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[100rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-bold text-neutral-900">Daily Dashboard</h1>
            <p className="text-sm text-neutral-600 mt-1">Visitors, signups, orders, emails, replies and paid users. Green = up vs previous, red = down (darker = &gt;20%).</p>
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
                    {buckets.map((b, i) => <th key={i} className="px-3 py-3 text-right font-semibold text-neutral-700 border-b border-l border-neutral-200 whitespace-nowrap">{b.label}</th>)}
                  </tr></thead>
                  <tbody>
                    {METRICS.map((m) => (
                      <tr key={m.key}>
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-neutral-900 border-b border-neutral-100 whitespace-nowrap">{m.label}</td>
                        {buckets.map((b, i) => {
                          const cur = b.data[m.key] || 0;
                          const prev = i === 0 ? null : buckets[i - 1].data[m.key] || 0;
                          return (
                            <td key={i} className={`px-3 py-2.5 text-right border-b border-l border-neutral-100 tabular-nums font-semibold ${changeClass(cur, prev)}`}>
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
            <p className="text-xs text-neutral-400 mt-4">Visitors from PostHog (unique people/day). Signups, orders, emails, replies, paid from Postgres. Instagram followers aren't in any system — add an IG integration or a manual entry if you want that row.</p>
          </>
        )}
      </main>
    </div>
  );
}
