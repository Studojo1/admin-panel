// Visitors (the owner, 4 Nov 2026: "how many real users, how many crawlers and from what source etc, and how many
// real visitors to sign up if they didnt signup whats the most common drop off point across each"). Real visitors
// against likely bots and declared crawlers, every real visitor's first touch, the funnel per source from the page to
// paid, where those who did not sign up stopped (per source and, on the homepage, per section). Counts only, no
// person. Its own range and device controls; read only (/api/visitors, app/lib/visitors).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminHeader, StatCard } from "~/components";
import { KIT_CSS, Seg, dayLabel, istShort, istTime } from "~/components/stu/overview-kit";
import { CARD } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { addDays, fmtN, todayIst } from "~/lib/stu/model";
import { fetchVisitors } from "~/lib/visitors/client";
import {
  BOT_GROUPS, BOT_GROUP_LABEL, DEVICES, DROPS, type DeviceFilter, type DropRow, ENGAGED_S, FUNNEL, SCROLL_PCT, type SourceRow, type VisitorsEnvelope, pct,
} from "~/lib/visitors/model";

export function meta() {
  return [{ title: "Visitors · Stu · Studojo Admin" }];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Stu went live on studojo.com on this IST day. */
const LAUNCH_DAY = "2026-11-03";
type RangeKey = "today" | "yesterday" | "7d" | "30d" | "launch" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" }, { key: "launch", label: "Since launch" }, { key: "custom", label: "Custom" },
];
/** Drop-off columns in the order a visit goes: the nearest stop first. */
const DROP_COLS = [...DROPS].reverse();

const pctText = (p: number | null) => (p == null ? "" : `${p}%`);

function Panel({ id, title, sub, right, children }: { id?: string; title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className={`${CARD} scroll-mt-28 overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-['Clash_Display'] text-lg font-semibold leading-tight text-neutral-950">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function Visitors() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const today = todayIst();

  const given = params.get("range");
  const range = (RANGES.some((r) => r.key === given) ? given : DAY_RE.test(params.get("start") || "") ? "custom" : "today") as RangeKey;
  const { start, end } = useMemo(() => {
    if (range === "yesterday") return { start: addDays(today, -1), end: addDays(today, -1) };
    if (range === "7d") return { start: addDays(today, -6), end: today };
    if (range === "30d") return { start: addDays(today, -29), end: today };
    if (range === "launch") return { start: LAUNCH_DAY <= today ? LAUNCH_DAY : today, end: today };
    if (range === "custom") {
      const e = DAY_RE.test(params.get("end") || "") ? params.get("end")! : today;
      const s = DAY_RE.test(params.get("start") || "") ? params.get("start")! : addDays(e, -6);
      return { start: s <= e ? s : e, end: e };
    }
    return { start: today, end: today };
  }, [range, params, today]);
  const internal = params.get("internal") === "1";
  const device = (DEVICES.some((d) => d.key === params.get("device")) ? params.get("device") : "all") as DeviceFilter;

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const setRange = (key: RangeKey) => setParam(key === "custom" ? { range: key, start, end } : { range: key === "today" ? null : key, start: null, end: null });

  const [data, setData] = useState<VisitorsEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"n" | "pct">("n");

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchVisitors({ start, end, device, internal, fresh }));
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [start, end, device, internal]);
  useEffect(() => {
    if (!isAuthorized) return;
    load(false);
    const id = window.setInterval(() => load(false), 60_000);
    return () => window.clearInterval(id);
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const rangeText = start === end ? dayLabel(start) : `${dayLabel(start)} to ${dayLabel(end)}`;
  const qs = new URLSearchParams({ start, end, ...(internal ? { internal: "1" } : {}) }).toString();
  const s = data?.summary;
  const envName = data ? (data.env === "staging" ? "Staging" : data.env === "production" ? "Production" : "Unknown") : "";

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · <Link to={`/?${new URLSearchParams({ range, start, end })}`} className="hover:underline">Overview</Link></div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Visitors</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>{rangeText}, IST · {DEVICES.find((d) => d.key === device)?.label}</span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${data?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>{envName}</span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}
                  title={r.key === "launch" ? "From 3 Nov 2026, the launch" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${range === r.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
              <Seg label="Device" value={device} onChange={(v) => setParam({ device: v === "all" ? null : v })} options={DEVICES.map((d) => ({ v: d.key, l: d.label }))} />
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" className="accent-purple-500" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} />
                Include internal
              </label>
              <button type="button" onClick={() => load(true)} disabled={loading} className="font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:decoration-purple-500 disabled:opacity-50">
                {loading ? "Reading" : "Refresh"}
              </button>
              <span>{data ? `Updated ${istTime(Date.parse(data.generatedAt))} IST` : "Reading"}</span>
            </div>
          </div>
        </div>

        {range === "custom" && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border-2 border-neutral-900 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
            <div>
              <label htmlFor="vi-from" className="block text-xs font-semibold text-neutral-500">From</label>
              <input id="vi-from" type="date" value={start} max={end} onChange={(e) => e.target.value && setParam({ start: e.target.value })} className="mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="vi-to" className="block text-xs font-semibold text-neutral-500">To</label>
              <input id="vi-to" type="date" value={end} min={start} max={today} onChange={(e) => e.target.value && setParam({ end: e.target.value })} className="mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm" />
            </div>
          </div>
        )}

        {error && <div className="mt-6 rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">Could not read the visitors: {error}</div>}
        {!data && !error && <div className="mt-6 h-40 animate-pulse rounded-2xl border-2 border-neutral-900 bg-white" />}

        {data && s && (
          <div className="fade mt-6 flex flex-col gap-6" style={{ opacity: loading ? 0.6 : 1 }}>
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <StatCard value={fmtN(s.real)} label="Real visitors" color="purple" title="A page_view in the range: the page's script ran in a browser"
                note={s.realNoServerRow > 0 ? `${fmtN(s.realNoServerRow)} with no server row that day (cached page)` : "ran the page in a browser"} />
              <StatCard value={fmtN(s.signedUp)} label="Signed up after a tracked visit" color="green" title="Real visitors who joined Stu on or after the first day of the range. The Overview's Sign-ups also counts people whose visit sent no page_view (before tracking began, or a blocked script)"
                note={s.signupPct == null ? "no new real visitors" : `${s.signupPct}% of ${fmtN(s.newVisitors)} new real visitors`} />
              <StatCard value={fmtN(s.likelyBots)} label="Likely bots" color="orange" title="visited_home on our server, and the page's script never ran"
                note="a browser's user agent, no page_view" />
              <StatCard value={s.crawlers == null ? "n/a" : fmtN(s.crawlers)} label="Crawler hits" color="pink" title="Page renders by user agents that name a bot (site_bot_hits)"
                note={s.crawlers == null ? "not recorded on this database yet" : "declared bots, page renders"} />
            </div>

            {s.beforeTracking > 0 && s.pageViewStart != null && (
              <p className="rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                The site sent its first page_view at {istShort(s.pageViewStart)} IST. {fmtN(s.beforeTracking)} visitor{s.beforeTracking === 1 ? "" : "s"} seen only before then cannot be told real or bot, so they are in neither count.
              </p>
            )}
            {(s.noPageView ?? 0) > 0 && (
              <p className="rounded-xl border-2 border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                {fmtN(s.noPageView)} visitor{s.noPageView === 1 ? "" : "s"} with no page_view began sign-up or became an account: people whose page_view did not arrive, so they are not counted as likely bots (and not as real visitors, which need a page_view).
              </p>
            )}
            {data.capped && <p className="text-xs text-amber-700">The range has more journey rows than the page reads at once; the counts stop at the cap. Pick a shorter range.</p>}

            <Panel id="funnel" title="Funnel by source" sub={<>Every real visitor's first touch. A step counts the real visitors who did it (in the range; the Stu steps on or after its first day). Sign-up % is new sign-ups of the real visitors who had no Stu account yet.</>}
              right={<Seg label="Show" value={view} onChange={setView} options={[{ v: "n", l: "Counts" }, { v: "pct", l: "% of real" }]} />}>
              <FunnelTable total={data.total} rows={data.sources} view={view} />
            </Panel>

            <Panel id="drop-offs" title="Where they stopped" sub={<>Real visitors who didn't sign up and had no account, by the furthest step each reached. The most common stop per source is marked.</>}>
              <DropTable total={data.dropTotal} rows={data.drops} />
            </Panel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <Panel id="sections" title="Homepage: last section seen" sub={<>Real visitors who didn't click Start: the last new section on their homepage view that saw the most ({fmtN(data.sectionBase)} visitors).</>}>
                <Sections rows={data.sections} base={data.sectionBase} />
              </Panel>
              <Panel id="bots" title="Likely bots" sub={<>visited_home on our server and no page_view: a browser's user agent, but the page's script never ran. {fmtN(data.bots.total)} in the range.</>}>
                <Bots bots={data.bots} />
              </Panel>
            </div>

            <Panel id="crawlers" title="Declared crawlers" sub={<>Page renders whose user agent names a bot, by bot and section of the site. Hits, not people. Counted by the site from 4 Nov 2026{internal ? "" : "; our own audit bot and the health checks are left out"}.</>}>
              <Crawlers c={data.crawlers} />
            </Panel>

            {data.byDay.length > 1 && (
              <Panel id="by-day" title="By day" sub="IST days.">
                <div className="-mx-1 overflow-x-auto">
                  <table className="tnum w-full text-sm">
                    <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                      <tr><th className="px-1 pb-1.5">Day</th><th className="px-1 pb-1.5 text-right">Real visitors</th><th className="px-1 pb-1.5 text-right" title="After a tracked visit">Signed up</th><th className="px-1 pb-1.5 text-right">Likely bots</th><th className="px-1 pb-1.5 text-right">Crawler hits</th></tr>
                    </thead>
                    <tbody>
                      {data.byDay.map((d) => (
                        <tr key={d.day} className="row-hover border-t-2 border-neutral-100">
                          <td className="px-1 py-1.5 font-medium text-neutral-900">{dayLabel(d.day)}</td>
                          <td className="px-1 py-1.5 text-right font-bold">{fmtN(d.real)}</td>
                          <td className="px-1 py-1.5 text-right">{fmtN(d.signedUp)}</td>
                          <td className="px-1 py-1.5 text-right">{fmtN(d.likelyBots)}</td>
                          <td className="px-1 py-1.5 text-right">{d.crawlers == null ? "n/a" : fmtN(d.crawlers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            <div className="text-xs leading-relaxed text-neutral-500">
              <p>
                <b className="text-neutral-700">How these are counted.</b> Real visitor: a page_view in the range, sent by the page's own script, so a browser ran it.
                Likely bot: a visited_home row (our server, every user agent that does not name a bot) with no page_view. Crawler: a page render whose user agent names a bot,
                which the site counts by IST day, bot and section (no IP, no user agent kept). Engaged: {ENGAGED_S} seconds or more on a page with the tab in view.
                Scrolled: {SCROLL_PCT}% of a page or more. Saw Start: a Start button at least half on screen for half a second.
                Source: the visitor's first touch, in this order: a utm_source tag, a Google or Meta click id, the referrer's site, an app's own browser, else direct by landing page.
              </p>
              <p className="mt-1.5">
                {internal ? "Internal accounts included." : `Left out: visitors linked to staff (admin, ops), @studojo.com, the test accounts and guests${s.excluded ? ` (${fmtN(s.excluded)} in this range)` : ""}; team visits that never signed in cannot be told apart.`}{" "}
                A sign-up on another device than the visit is not linked to it, so it shows as a drop-off. <Link to={`/sources?${qs}`} className="font-semibold text-purple-700 underline underline-offset-2">Sources by channel →</Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tables

function FunnelTable({ total, rows, view }: { total: SourceRow; rows: SourceRow[]; view: "n" | "pct" }) {
  if (!total.counts.real) return <p className="text-sm text-neutral-500">No real visitors in this range.</p>;
  const cell = (r: SourceRow, k: (typeof FUNNEL)[number]["key"]) => {
    const n = r.counts[k];
    if (k === "real" || view === "n") return fmtN(n);
    return pctText(pct(n, r.counts.real)) || "0%";
  };
  const line = (r: SourceRow, isTotal: boolean) => (
    <tr key={r.key} className={`row-hover border-t-2 ${isTotal ? "border-neutral-900 bg-purple-50/60 font-bold" : "border-neutral-100"}`}>
      <td className="sticky left-0 z-[1] max-w-[190px] truncate bg-white px-1 py-1.5 font-medium text-neutral-900" title={r.detail ? `${r.label}: ${r.detail}` : r.label}>
        {r.label}
        {r.detail && !isTotal && <span className="block truncate text-[11px] font-normal text-neutral-500">{r.detail}</span>}
      </td>
      {FUNNEL.map((f) => (
        <td key={f.key} className={`px-1.5 py-1.5 text-right ${f.key === "real" || f.key === "signed_up" ? "font-bold text-neutral-950" : "text-neutral-700"}`}>{cell(r, f.key)}</td>
      ))}
      <td className="px-1.5 py-1.5 text-right font-bold text-emerald-700">{r.signupPct == null ? "n/a" : `${r.signupPct}%`}</td>
      <td className="px-1.5 py-1.5 text-right text-neutral-500">{fmtN(r.returning)}</td>
    </tr>
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="tnum w-full min-w-[980px] text-sm">
        <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="sticky left-0 z-[1] bg-white px-1 pb-1.5">Source (first touch)</th>
            {FUNNEL.map((f) => <th key={f.key} className="px-1.5 pb-1.5 text-right" title={f.hint}>{f.label}</th>)}
            <th className="px-1.5 pb-1.5 text-right" title="New sign-ups of the real visitors who had no Stu account yet">Sign-up %</th>
            <th className="px-1.5 pb-1.5 text-right" title="Real visitors who already had a Stu account before the range">Had an account</th>
          </tr>
        </thead>
        <tbody>
          {line(total, true)}
          {rows.map((r) => line(r, false))}
        </tbody>
      </table>
    </div>
  );
}

function DropTable({ total, rows }: { total: DropRow; rows: DropRow[] }) {
  if (!total.total) return <p className="text-sm text-neutral-500">Nobody who didn't sign up in this range.</p>;
  const line = (r: DropRow, isTotal: boolean) => (
    <tr key={r.key} className={`row-hover border-t-2 ${isTotal ? "border-neutral-900 bg-purple-50/60 font-bold" : "border-neutral-100"}`}>
      <td className="sticky left-0 z-[1] max-w-[190px] truncate bg-white px-1 py-1.5 font-medium text-neutral-900" title={r.label}>{r.label}</td>
      <td className="px-1.5 py-1.5 text-right font-bold text-neutral-950">{fmtN(r.total)}</td>
      {DROP_COLS.map((d) => {
        const n = r.by[d.key];
        const top = r.top === d.key;
        return (
          <td key={d.key} className={`px-1.5 py-1.5 text-right ${top ? "text-red-600" : n ? "text-neutral-700" : "text-neutral-300"}`}>
            {top && <span aria-label="most common">▼ </span>}
            <span className={top ? "font-bold" : ""}>{fmtN(n)}</span>
            {n > 0 && <span className="ml-1 text-[11px]">{pctText(pct(n, r.total))}</span>}
          </td>
        );
      })}
      <td className="px-1.5 py-1.5 text-xs font-semibold text-red-600">{r.top ? DROPS.find((d) => d.key === r.top)?.label : ""}</td>
    </tr>
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="tnum w-full min-w-[900px] text-sm">
        <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="sticky left-0 z-[1] bg-white px-1 pb-1.5">Source (first touch)</th>
            <th className="px-1.5 pb-1.5 text-right">Didn't sign up</th>
            {DROP_COLS.map((d) => <th key={d.key} className="px-1.5 pb-1.5 text-right">{d.label}</th>)}
            <th className="px-1.5 pb-1.5">Most common</th>
          </tr>
        </thead>
        <tbody>
          {line(total, true)}
          {rows.map((r) => line(r, false))}
        </tbody>
      </table>
    </div>
  );
}

function Sections({ rows, base }: { rows: { key: string; label: string; n: number }[]; base: number }) {
  if (!base) return <p className="text-sm text-neutral-500">No homepage views by non-clickers with sections in this range.</p>;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const top = rows.reduce((m, r) => (r.n > m.n ? r : m), rows[0]);
  return (
    <div className="grid grid-cols-[minmax(110px,150px)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
      {rows.map((r) => (
        <Fragment key={r.key}>
          <div className={`truncate ${r.key === top.key ? "font-bold text-red-600" : "text-neutral-700"}`}>{r.label}</div>
          <div className="flex h-6 items-center">
            {r.n > 0 && <div className={`h-[18px] rounded-r-md border-2 border-neutral-900 ${r.key === top.key ? "bg-red-400" : "bg-purple-300"}`} style={{ width: `${(r.n / max) * 90}%`, minWidth: 6 }} />}
          </div>
          <div className="tnum whitespace-nowrap text-right text-xs text-neutral-600"><b className="text-neutral-950">{fmtN(r.n)}</b> {r.n > 0 ? pctText(pct(r.n, base)) : ""}</div>
        </Fragment>
      ))}
    </div>
  );
}

function Bots({ bots }: { bots: VisitorsEnvelope["bots"] }) {
  if (!bots.total) return <p className="text-sm text-neutral-500">No likely bots in this range.</p>;
  return (
    <div className="grid gap-4">
      <div className="-mx-1 overflow-x-auto">
        <table className="tnum w-full text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr><th className="px-1 pb-1.5">Landing page</th><th className="px-1 pb-1.5 text-right">Desktop</th><th className="px-1 pb-1.5 text-right">Mobile</th><th className="px-1 pb-1.5 text-right">Unknown</th><th className="px-1 pb-1.5 text-right">Total</th></tr>
          </thead>
          <tbody>
            {bots.byLanding.map((r) => (
              <tr key={r.key} className="row-hover border-t-2 border-neutral-100">
                <td className="px-1 py-1.5 font-medium text-neutral-900">{r.label}</td>
                <td className="px-1 py-1.5 text-right">{fmtN(r.desktop)}</td>
                <td className="px-1 py-1.5 text-right">{fmtN(r.mobile)}</td>
                <td className="px-1 py-1.5 text-right text-neutral-500">{fmtN(r.other)}</td>
                <td className="px-1 py-1.5 text-right font-bold">{fmtN(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">Where they said they came from</div>
        <ul className="grid gap-0.5 text-sm">
          {bots.bySource.slice(0, 8).map((r) => (
            <li key={r.key} className="flex justify-between gap-3"><span className="truncate text-neutral-700">{r.label}</span><b className="tnum">{fmtN(r.n)}</b></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Crawlers({ c }: { c: VisitorsEnvelope["crawlers"] }) {
  if (!c.recorded) return <p className="text-sm text-neutral-500">Not recorded on this database yet: the site's crawler counter (public.site_bot_hits) is not here.</p>;
  if (!c.total) return <p className="text-sm text-neutral-500">No crawler hits counted in this range.</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="tnum w-full min-w-[560px] text-sm">
        <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-1 pb-1.5">Bot</th>
            {BOT_GROUPS.map((g) => <th key={g} className="px-1.5 pb-1.5 text-right">{BOT_GROUP_LABEL[g]}</th>)}
            <th className="px-1.5 pb-1.5 text-right">Hits</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t-2 border-neutral-900 bg-purple-50/60 font-bold">
            <td className="px-1 py-1.5">All crawlers</td>
            {BOT_GROUPS.map((g) => <td key={g} className="px-1.5 py-1.5 text-right">{fmtN(c.groups[g] ?? 0)}</td>)}
            <td className="px-1.5 py-1.5 text-right">{fmtN(c.total)}</td>
          </tr>
          {c.rows.map((r) => (
            <tr key={r.bot} className="row-hover border-t-2 border-neutral-100">
              <td className="px-1 py-1.5 font-medium text-neutral-900">{r.label}</td>
              {BOT_GROUPS.map((g) => <td key={g} className={`px-1.5 py-1.5 text-right ${r.groups[g] ? "text-neutral-700" : "text-neutral-300"}`}>{fmtN(r.groups[g] ?? 0)}</td>)}
              <td className="px-1.5 py-1.5 text-right font-bold">{fmtN(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
