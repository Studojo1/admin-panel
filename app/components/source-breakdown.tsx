import { useEffect, useState } from "react";

/**
 * "Where users come from" — acquisition-source breakdown.
 *
 * Buckets each person by their first-touch source (PostHog $initial_utm_* /
 * $initial_referring_domain) and counts how many became signed-up users.
 * Same source logic as the User Journeys page, aggregated.
 *
 * Pass an IST date range (start/end as YYYY-MM-DD). Omit both for lifetime.
 */
async function phQuery(query: string) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}

const envWhere = (e: string) => e === "prod" ? "AND properties.$host LIKE '%studojo.com%'" : e === "staging" ? "AND properties.$host LIKE '%studojo.pro%'" : "";

function sourceHogql(start?: string, end?: string, env = "all") {
  const IST = "toDate(timestamp + INTERVAL 330 MINUTE)";
  const timeWhere = start && end ? `${IST} >= toDate('${start}') AND ${IST} <= toDate('${end}')` : "1=1";
  return `
    SELECT
      multiIf(
        medium = 'email' OR position(src_raw, 'email') > 0 OR position(src_raw, 'newsletter') > 0 OR position(ref, 'mail') > 0, 'Email',
        src_raw != '', src_raw,
        ref != '' AND ref != '$direct', ref,
        'Direct'
      ) AS source,
      count() AS visitors,
      countIf(signed_up) AS users
    FROM (
      SELECT person_id,
        lower(coalesce(any(person.properties.$initial_utm_medium), '')) AS medium,
        lower(coalesce(any(person.properties.$initial_utm_source), '')) AS src_raw,
        lower(coalesce(any(person.properties.$initial_referring_domain), '')) AS ref,
        max(person.properties.email != '' AND person.properties.email IS NOT NULL) AS signed_up
      FROM events
      WHERE ${timeWhere} ${envWhere(env)}
      GROUP BY person_id
    )
    GROUP BY source
    ORDER BY users DESC, visitors DESC
    LIMIT 15`;
}

type Src = { source: string; visitors: number; users: number };
const pretty = (s: string) => {
  if (!s) return "Direct";
  if (s === "$direct") return "Direct";
  if (/^[a-z]+$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1); // linkedin → LinkedIn-ish
  return s;
};
const COLORS = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-lime-500", "bg-orange-500"];

export function SourceBreakdown({ start, end, env = "all", className = "" }: { start?: string; end?: string; env?: string; className?: string }) {
  const [rows, setRows] = useState<Src[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    phQuery(sourceHogql(start, end, env))
      .then((res) => { if (!cancelled) setRows((res.results ?? []).map((r: any[]) => ({ source: r[0], visitors: +r[1] || 0, users: +r[2] || 0 }))); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end, env]);

  const totalUsers = rows.reduce((a, r) => a + r.users, 0);
  const max = Math.max(1, ...rows.map((r) => r.users));
  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";

  return (
    <div className={`p-5 md:p-6 ${card} ${className}`}>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-['Clash_Display'] text-xl font-bold">Where users come from</h2>
        {!loading && totalUsers > 0 && <span className="text-xs text-neutral-500">{totalUsers.toLocaleString()} signed-up users</span>}
      </div>
      <p className="text-xs text-neutral-500 mb-4">First-touch source of every signed-up user. Ranked by users.</p>
      {loading ? (
        <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
      ) : error ? (
        <p className="text-sm text-neutral-400 py-4">Couldn't load source data.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-400 py-4">No attribution data in this range.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.source} className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0 text-sm font-semibold truncate" title={pretty(r.source)}>{pretty(r.source)}</div>
              <div className="flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                <div className={`h-full ${COLORS[i % COLORS.length]} flex items-center px-2`} style={{ width: `${Math.max((r.users / max) * 100, r.users > 0 ? 6 : 0)}%` }}>
                  {r.users > 0 && <span className="text-xs font-bold text-white">{r.users.toLocaleString()}</span>}
                </div>
              </div>
              <div className="w-24 text-right text-xs font-semibold text-neutral-500">{totalUsers > 0 ? Math.round((r.users / totalUsers) * 100) : 0}% · {r.visitors.toLocaleString()} visits</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
