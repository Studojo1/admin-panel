// REACH-PAGE on the Overview (15 Nov 2026): "Reached twice this week", the share of students with 2 or more messages
// delivered in the last 7 days on WhatsApp or email (REACH-EMAIL, 17 Nov 2026), whatever the Overview's range. The lists and the trend are on /reach. Its own
// read (/api/reach?view=summary, cached on the server for a few minutes), so the Overview's sections never wait for it.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { fmtN } from "~/lib/stu/model";
import { fetchReachSummary } from "~/lib/reach/client";
import type { ReachSummary } from "~/lib/reach/model";
import { CARD } from "./ui";

const REFRESH_MS = 60_000;

export function ReachTile({ internal, enabled }: { internal: boolean; enabled: boolean }) {
  const [data, setData] = useState<ReachSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await fetchReachSummary({ internal })).summary);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, [internal]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  const href = internal ? "/reach?internal=1" : "/reach";
  return (
    <section className={`${CARD} overflow-hidden`} aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-['Clash_Display'] text-lg font-semibold leading-tight text-neutral-950">Reached twice this week</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Students with 2 or more messages delivered on WhatsApp or email in the last 7 days, whatever the range above.</p>
        </div>
        <Link to={href} className="whitespace-nowrap text-xs font-semibold text-purple-700 underline underline-offset-2">Reach detail →</Link>
      </div>
      <div className="p-4">
        {error && !data && <div className="text-xs text-red-600">Could not read: {error}</div>}
        {!data && !error && <div className="h-[64px] animate-pulse rounded-lg bg-neutral-100" />}
        {data && (
          <div className="fade grid gap-4 sm:grid-cols-3" style={{ opacity: loading ? 0.6 : 1 }}>
            <Link to={href} className="block min-w-0 rounded-lg hover:bg-purple-50">
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">All students</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="tnum font-['Clash_Display'] text-4xl font-semibold text-neutral-950">{data.all.pct == null ? "n/a" : `${data.all.pct}%`}</span>
                <span className="tnum text-sm text-neutral-600">{fmtN(data.all.n)} of {fmtN(data.all.of)}</span>
              </div>
            </Link>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">WhatsApp linked</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="tnum font-['Clash_Display'] text-2xl font-semibold text-neutral-950">{data.linked.pct == null ? "n/a" : `${data.linked.pct}%`}</span>
                <span className="tnum text-sm text-neutral-600">{fmtN(data.linked.n)} of {fmtN(data.linked.of)}</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Not reached twice</div>
              <div className="tnum mt-1 text-sm text-neutral-700">
                <b className="text-neutral-950">{fmtN(data.zero)}</b> at 0 and <b className="text-neutral-950">{fmtN(data.one)}</b> at 1 (linked),{" "}
                <b className="text-neutral-950">{fmtN(data.notLinked)}</b> not linked, under 2
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
