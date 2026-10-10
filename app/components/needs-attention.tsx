import { useEffect, useState } from "react";
import { getToken } from "~/lib/api";
import type { HealthWatch } from "~/lib/health-watch";

/**
 * "Needs attention" for the daily dashboard: what is broken right now, which
 * no chart on this page shows.
 *
 *   1. Lead discovery. A quiet line while it works, an amber banner when one
 *      or two students are stuck at generating leads, a red one when it is
 *      failing. The stuck students are listed behind the count.
 *   2. Paying customers who have had no email sent, and why.
 *
 * All of it comes from Postgres through /api/health-watch. The card loads on
 * its own and fails soft, so a problem here never takes the rest of /daily
 * down with it.
 */

const IST = "Asia/Kolkata";
const fmt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const count = (n: number, one: string) => `${fmt(n)} ${n === 1 ? one : `${one}s`}`;
const niceDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: IST });
const niceDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
const niceTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });
const money = (amount: number, currency: string) => {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return symbol + amount.toLocaleString("en-IN", { maximumFractionDigits: amount % 1 ? 2 : 0 });
};
// "45 minutes", "7 hours", "6 days"
function span(hours: number) {
  if (hours < 1) return count(Math.round(hours * 60), "minute");
  if (hours < 48) return count(Math.round(hours), "hour");
  return count(Math.round(hours / 24), "day");
}
function ago(iso: string) {
  const hours = Math.max(0, Date.now() - new Date(iso).getTime()) / 3600000;
  return hours * 60 < 1 ? "just now" : `${span(hours)} ago`;
}

async function loadHealthWatch(): Promise<HealthWatch> {
  const token = await getToken();
  const res = await fetch("/api/health-watch", {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  // Anything but the full shape counts as a failure: rendering half an answer
  // could throw and blank the whole dashboard.
  if (!res.ok || data.error || !Array.isArray(data.discovery?.stuck) || !Array.isArray(data.paid_nothing_sent?.rows)) {
    throw new Error(data.error || `Health watch ${res.status}`);
  }
  return data;
}

const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
const th = "px-5 py-2 text-left font-semibold text-neutral-700 border-b border-neutral-200 whitespace-nowrap";
const td = "px-5 py-2 border-b border-neutral-100 whitespace-nowrap";
const summary = "cursor-pointer px-5 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50";

export function NeedsAttention({ className = "" }: { className?: string }) {
  const [data, setData] = useState<HealthWatch | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHealthWatch()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const d = data?.discovery;
  const p = data?.paid_nothing_sent;
  const lastRun = d?.last_success_at ? `Last successful run ${ago(d.last_success_at)}.` : "No successful run on record.";

  return (
    <div className={`overflow-hidden ${card} ${className}`}>
      <div className="px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50">
        <h2 className="font-['Clash_Display'] text-lg font-bold">Needs attention</h2>
      </div>
      {failed ? (
        <p className="px-5 py-3 text-sm text-neutral-400">Could not load.</p>
      ) : !d || !p ? (
        <p className="px-5 py-3 text-sm text-neutral-400">Checking…</p>
      ) : (
        <>
          {d.state === "ok" ? (
            <p className="px-5 py-3 text-sm text-neutral-600">
              {d.completed_24h > 0
                ? `Lead discovery is healthy. ${lastRun}`
                : `Nobody is stuck at generating leads, but no run has finished in the last 24 hours. ${lastRun}`}
            </p>
          ) : (
            <div className={`px-5 py-3 ${d.state === "failing" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
              <p className="text-sm font-bold">
                {d.state === "failing" ? "Lead discovery is failing" : "Lead discovery needs a look"}: {count(d.stuck_count, "student")} stuck
                {d.stuck_since ? ` since ${niceDay(d.stuck_since)}` : ""}
              </p>
              <p className="text-xs mt-0.5">{lastRun} {fmt(d.completed_24h)} finished in the last 24 hours.</p>
            </div>
          )}

          {d.stuck_count > 0 && (
            <details className="border-t border-neutral-200">
              <summary className={summary}>{count(d.stuck_count, "student")} stuck at generating leads</summary>
              <div className="overflow-x-auto border-t border-neutral-200">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-neutral-50">
                    <th className={th}>Student</th>
                    <th className={th}>Order</th>
                    <th className={th}>Stuck since (IST)</th>
                    <th className={th}>For</th>
                  </tr></thead>
                  <tbody>
                    {d.stuck.map((s) => (
                      <tr key={s.order_id}>
                        <td className={`${td} font-medium text-neutral-900`}>{s.email}</td>
                        <td className={`${td} tabular-nums text-neutral-600`}>{s.order_id}</td>
                        <td className={`${td} text-neutral-600`}>{niceTime(s.since)}</td>
                        <td className={`${td} text-neutral-600`}>{span(s.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.stuck_count > d.stuck.length && (
                <p className="px-5 py-2 text-xs text-neutral-400">Showing the newest {fmt(d.stuck.length)}.</p>
              )}
            </details>
          )}

          {p.count > 0 && (
            <details className="border-t border-neutral-200">
              <summary className={summary}>{count(p.count, "paying customer")} with nothing sent</summary>
              <div className="overflow-x-auto border-t border-neutral-200">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-neutral-50">
                    <th className={th}>Customer</th>
                    <th className={th}>Paid on</th>
                    <th className={th}>Amount</th>
                    <th className={th}>Days since</th>
                    <th className={th}>Why</th>
                  </tr></thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr key={r.email}>
                        <td className={`${td} font-medium text-neutral-900`}>{r.email}</td>
                        <td className={`${td} text-neutral-600`}>{niceDate(r.paid_at)}</td>
                        <td className={`${td} tabular-nums text-neutral-600`}>{money(r.amount, r.currency)}</td>
                        <td className={`${td} tabular-nums text-neutral-600`}>{fmt(r.days_since)}</td>
                        <td className={`${td} text-neutral-900`}>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
