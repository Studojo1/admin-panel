import { useEffect, useState } from "react";
import { getToken } from "~/lib/api";
import { posthogFetch } from "~/lib/posthog-client";
import { CHANNELS, channelOf, type ChannelKey } from "~/lib/utm-dictionary";

/**
 * "Where users come from", by channel, for the daily dashboard.
 *
 * Two cards for one date range:
 *   1. A funnel per channel: visitors, signups, uploaded a resume, got leads,
 *      paid, revenue.
 *   2. Signups per channel in the same date columns as the daily grid.
 *
 * Signups and everything after them come from Postgres (/api/sources: the
 * first-touch record written at signup). Visitors come from PostHog and load
 * on their own, because that query is slower and must not hold up the rest.
 */

type ChannelRow = { key: ChannelKey; label: string; signups: number; resumes: number; leads: number; paid: number; inr: number; usd: number };
type DayRow = { day: string } & Partial<Record<ChannelKey, number>>;
type SourcesData = { channels: ChannelRow[]; daily: DayRow[] };

const fmt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "");
const niceDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const money = (inr: number, usd: number) => {
  const parts: string[] = [];
  if (inr) parts.push(`₹${fmt(inr)}`);
  if (usd) parts.push(`$${fmt(usd)}`);
  return parts.join(" + ");
};

// First touch inside the range, per browser. Event properties, not person
// properties: the person join made a 30 day query on this dashboard run for
// minutes. studojo.com only, so the Sensei app and admin hosts stay out.
function visitorsHogql(start: string, end: string) {
  const IST = "toDate(timestamp + INTERVAL 330 MINUTE)";
  return `
    SELECT src, med, ref, count() AS visitors FROM (
      SELECT distinct_id,
        lower(coalesce(argMin(properties.utm_source, timestamp), '')) AS src,
        lower(coalesce(argMin(properties.utm_medium, timestamp), '')) AS med,
        lower(coalesce(argMin(properties.$referring_domain, timestamp), '')) AS ref
      FROM events
      WHERE event = '$pageview' AND properties.$host IN ('studojo.com', 'www.studojo.com')
        AND ${IST} >= toDate('${start}') AND ${IST} <= toDate('${end}')
      GROUP BY distinct_id
    )
    GROUP BY src, med, ref
    ORDER BY visitors DESC
    LIMIT 2000`;
}

async function loadSources(start: string, end: string): Promise<SourcesData> {
  const token = await getToken();
  const res = await fetch(`/api/sources?start=${start}&end=${end}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Sources ${res.status}`);
  return data;
}

async function loadVisitors(start: string, end: string): Promise<Partial<Record<ChannelKey, number>>> {
  const res = await posthogFetch("/api/posthog?type=query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: visitorsHogql(start, end) } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  const data = await res.json();
  const out: Partial<Record<ChannelKey, number>> = {};
  for (const r of (data.results ?? []) as any[][]) {
    const key = channelOf(r[0], r[1], r[2]);
    out[key] = (out[key] ?? 0) + (+r[3] || 0);
  }
  return out;
}

const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
const th = "px-3 py-3 text-right font-semibold text-neutral-700 border-b border-l border-neutral-200 whitespace-nowrap";
const td = "px-3 py-2.5 text-right border-b border-l border-neutral-100 tabular-nums";

// Darker the more signups a cell holds, relative to the busiest cell in its row.
function tint(v: number, max: number) {
  if (!v) return "text-neutral-300";
  const share = v / Math.max(1, max);
  if (share > 0.66) return "bg-violet-200 text-violet-950 font-bold";
  if (share > 0.33) return "bg-violet-100 text-violet-900 font-semibold";
  return "bg-violet-50 text-violet-900 font-semibold";
}

export function ChannelSources({ start, end, group = 1, className = "" }: { start: string; end: string; group?: number; className?: string }) {
  const [data, setData] = useState<SourcesData | null>(null);
  const [error, setError] = useState("");
  const [visitors, setVisitors] = useState<Partial<Record<ChannelKey, number>> | null>(null);
  const [visitorsFailed, setVisitorsFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(""); setVisitors(null); setVisitorsFailed(false);
    loadSources(start, end)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Could not load sources"); });
    loadVisitors(start, end)
      .then((v) => { if (!cancelled) setVisitors(v); })
      .catch(() => { if (!cancelled) setVisitorsFailed(true); });
    return () => { cancelled = true; };
  }, [start, end]);

  if (error) {
    return <div className={`rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700 ${className}`}>Sources: {error}</div>;
  }
  if (!data) {
    return <div className={`flex justify-center py-12 ${card} ${className}`}><div className="h-6 w-6 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>;
  }

  // Every channel that has signups or visitors, busiest first.
  const byKey = new Map(data.channels.map((c) => [c.key, c]));
  const rows = CHANNELS
    .map((c) => ({
      key: c.key, label: c.label,
      signups: byKey.get(c.key)?.signups ?? 0, resumes: byKey.get(c.key)?.resumes ?? 0,
      leads: byKey.get(c.key)?.leads ?? 0, paid: byKey.get(c.key)?.paid ?? 0,
      inr: byKey.get(c.key)?.inr ?? 0, usd: byKey.get(c.key)?.usd ?? 0,
      visitors: visitors?.[c.key] ?? 0,
    }))
    .filter((r) => r.signups > 0 || r.visitors > 0)
    .sort((a, b) => b.signups - a.signups || b.visitors - a.visitors);

  const total = rows.reduce(
    (t, r) => ({ visitors: t.visitors + r.visitors, signups: t.signups + r.signups, resumes: t.resumes + r.resumes, leads: t.leads + r.leads, paid: t.paid + r.paid, inr: t.inr + r.inr, usd: t.usd + r.usd }),
    { visitors: 0, signups: 0, resumes: 0, leads: 0, paid: 0, inr: 0, usd: 0 },
  );
  const visitorCell = (n: number) => (visitorsFailed ? "n/a" : visitors === null ? "…" : fmt(n));
  const withShare = (n: number, of: number) => (
    <>{fmt(n)}{n > 0 && of > 0 && <span className="ml-1 text-xs font-normal text-neutral-400">{pct(n, of)}</span>}</>
  );

  // Same buckets as the daily grid above: chronological chunks of `group` days.
  const signupRows = rows.filter((r) => r.signups > 0);
  const buckets: { label: string; data: Partial<Record<ChannelKey, number>>; total: number }[] = [];
  for (let i = 0; i < data.daily.length; i += group) {
    const chunk = data.daily.slice(i, i + group);
    if (!chunk.length) continue;
    const sums: Partial<Record<ChannelKey, number>> = {};
    let all = 0;
    for (const day of chunk) {
      for (const r of signupRows) {
        const v = day[r.key] ?? 0;
        sums[r.key] = (sums[r.key] ?? 0) + v;
        all += v;
      }
    }
    buckets.push({
      label: group === 1 ? niceDay(chunk[0].day) : `${niceDay(chunk[0].day)} to ${niceDay(chunk[chunk.length - 1].day)}`,
      data: sums, total: all,
    });
  }
  const order = buckets.map((_, i) => i).reverse(); // newest date on the left

  return (
    <div className={`space-y-8 ${className}`}>
      <div className={`overflow-hidden ${card}`}>
        <div className="px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50">
          <h2 className="font-['Clash_Display'] text-lg font-bold">Where users come from</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Everyone who signed up in this period, by the source that first brought them, and how far they got.</p>
        </div>
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-neutral-400">No signups or visitors in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-neutral-50">
                <th className="text-left px-4 py-3 font-semibold text-neutral-700 border-b border-neutral-200 min-w-[220px]">Source</th>
                <th className={th}>Visitors</th>
                <th className={th}>Signups</th>
                <th className={th}>Visitor to signup</th>
                <th className={th}>Uploaded resume</th>
                <th className={th}>Got leads</th>
                <th className={th}>Paid</th>
                <th className={th}>Revenue</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 border-b border-neutral-100 whitespace-nowrap">{r.label}</td>
                    <td className={`${td} text-neutral-600`}>{visitorCell(r.visitors)}</td>
                    <td className={`${td} font-bold text-neutral-900`}>{fmt(r.signups)}</td>
                    <td className={`${td} text-neutral-600`}>{visitors && r.visitors > 0 ? pct(r.signups, r.visitors) : ""}</td>
                    <td className={`${td} font-semibold`}>{withShare(r.resumes, r.signups)}</td>
                    <td className={`${td} font-semibold`}>{withShare(r.leads, r.signups)}</td>
                    <td className={`${td} font-bold ${r.paid > 0 ? "bg-emerald-100 text-emerald-900" : "text-neutral-300"}`}>{withShare(r.paid, r.signups)}</td>
                    <td className={`${td} font-semibold ${r.inr || r.usd ? "text-emerald-800" : "text-neutral-300"}`}>{money(r.inr, r.usd) || "0"}</td>
                  </tr>
                ))}
                <tr className="bg-neutral-50">
                  <td className="px-4 py-2.5 font-bold text-neutral-900 border-t-2 border-neutral-900">All sources</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{visitorCell(total.visitors)}</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{fmt(total.signups)}</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{visitors && total.visitors > 0 ? pct(total.signups, total.visitors) : ""}</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{withShare(total.resumes, total.signups)}</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{withShare(total.leads, total.signups)}</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{withShare(total.paid, total.signups)}</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{money(total.inr, total.usd) || "0"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-xs text-neutral-400 border-t border-neutral-200">
          Source is the first touch saved at signup. Resume, leads, paid and revenue count what those same people have done since, real money only.
          Visitors are browsers whose first page view in this period came from that source (studojo.com only), so a signup can belong to a visit from before the period.
          "Unknown (lost at Google sign-in)" is signups before 29 Sep whose source was overwritten by the sign-in redirect. "Not captured" is signups from before sources were recorded (19 Sep).
        </p>
      </div>

      {signupRows.length > 0 && (
        <div className={`overflow-hidden ${card}`}>
          <div className="px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50 flex items-baseline justify-between">
            <h2 className="font-['Clash_Display'] text-lg font-bold">Signups by source</h2>
            <span className="text-xs text-neutral-500">{buckets.length} columns, newest first</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-neutral-50">
                <th className="sticky left-0 z-10 bg-neutral-50 text-left px-4 py-3 font-semibold text-neutral-700 border-b border-neutral-200 min-w-[220px]">Source</th>
                <th className={th}>Total</th>
                {order.map((ci) => <th key={ci} className={th}>{buckets[ci].label}</th>)}
              </tr></thead>
              <tbody>
                {signupRows.map((r) => {
                  const max = Math.max(1, ...buckets.map((b) => b.data[r.key] ?? 0));
                  return (
                    <tr key={r.key}>
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-neutral-900 border-b border-neutral-100 whitespace-nowrap">{r.label}</td>
                      <td className={`${td} font-bold text-neutral-900`}>{fmt(r.signups)}</td>
                      {order.map((ci) => {
                        const v = buckets[ci].data[r.key] ?? 0;
                        return <td key={ci} className={`${td} ${tint(v, max)}`}>{fmt(v)}</td>;
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-neutral-50">
                  <td className="sticky left-0 z-10 bg-neutral-50 px-4 py-2.5 font-bold text-neutral-900 border-t-2 border-neutral-900">All sources</td>
                  <td className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{fmt(total.signups)}</td>
                  {order.map((ci) => <td key={ci} className={`${td} border-t-2 border-t-neutral-900 font-bold`}>{fmt(buckets[ci].total)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
