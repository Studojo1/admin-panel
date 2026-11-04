// VISITORS on the Overview (4 Nov 2026): real visitors against crawlers and likely bots, the top sources with their
// sign-up rate and the single biggest drop-off, for the Overview's range. The tables are on /visitors.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { fmtN } from "~/lib/stu/model";
import { fetchVisitors } from "~/lib/visitors/client";
import type { VisitorsEnvelope } from "~/lib/visitors/model";
import { CARD } from "./ui";

const REFRESH_MS = 60_000;

export function VisitorsSummary({ start, end, internal, href, enabled }: { start: string; end: string; internal: boolean; href: string; enabled: boolean }) {
  const [data, setData] = useState<VisitorsEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchVisitors({ start, end, internal });
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, [start, end, internal]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  const s = data?.summary;
  return (
    <section className={`${CARD} overflow-hidden`} aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-['Clash_Display'] text-lg font-semibold leading-tight text-neutral-950">Visitors</h2>
          <p className="mt-0.5 text-xs text-neutral-500">People who ran the page in a browser, apart from crawlers and bots. Where they came from and where they stopped.</p>
        </div>
        <Link to={href} className="whitespace-nowrap text-xs font-semibold text-purple-700 underline underline-offset-2">Visitors detail →</Link>
      </div>
      <div className="p-4">
        {error && !s && <div className="text-xs text-red-600">Could not read: {error}</div>}
        {!s && !error && <div className="h-[92px] animate-pulse rounded-lg bg-neutral-100" />}
        {s && (
          <div className="fade grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]" style={{ opacity: loading ? 0.6 : 1 }}>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Real visitors</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="tnum font-['Clash_Display'] text-4xl font-semibold text-neutral-950">{fmtN(s.real)}</span>
                <span className="text-sm text-neutral-600">
                  (crawlers{" "}
                  {s.crawlers == null ? <span className="text-neutral-400" title="This database has no crawler counter yet">not recorded</span> : <><b className="tnum text-neutral-900">{fmtN(s.crawlers)}</b> hits</>}
                  , likely bots <b className="tnum text-neutral-900">{fmtN(s.likelyBots)}</b>)
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {fmtN(s.signedUp)} signed up after a tracked visit{s.signupPct != null ? `, ${s.signupPct}% of ${fmtN(s.newVisitors)} new real visitors` : ""}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Top sources, sign-up %</div>
              {s.top.length ? (
                <ul className="mt-1.5 grid gap-1 text-sm">
                  {s.top.map((t) => (
                    <li key={t.key} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-neutral-800" title={t.label}>{t.label}</span>
                      <span className="tnum whitespace-nowrap text-neutral-600">
                        <b className="text-neutral-950">{fmtN(t.real)}</b> visitors · {t.pct == null ? "n/a" : <b className={t.signedUp > 0 ? "text-emerald-700" : "text-neutral-950"}>{t.pct}%</b>} signed up
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-neutral-500">No real visitors in this range.</p>
              )}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Biggest drop-off</div>
              {s.biggestDrop ? (
                <div className="mt-1.5">
                  <div className="font-semibold text-red-600">{s.biggestDrop.label}</div>
                  <div className="tnum text-sm text-neutral-700">
                    <b className="text-neutral-950">{fmtN(s.biggestDrop.n)}</b> of {fmtN(s.biggestDrop.of)} who didn't sign up{s.biggestDrop.pct != null ? ` (${s.biggestDrop.pct}%)` : ""}
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-neutral-500">Nobody to read yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
