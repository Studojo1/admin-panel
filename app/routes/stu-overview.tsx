// Stu Overview: the admin root and the landing page after login. Rebuilt on
// 2 Nov 2026 in the old admin's look (owner: "streamline it better for me to
// view"): what needs action, five headline cards, what is going on, one 30-day
// chart, a short funnel and the top sources, then links to the deep pages.
// Calls, engagement, power users, retention, the drop-off detail and the live
// feed moved to /usage (app/routes/stu-usage.tsx). Same API (/api/stu/overview,
// one section per call, re-read every 60 s), same numbers, and every number
// opens the people behind it.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { AdminHeader, StatCard } from "~/components";
import { CARD, DrillModal } from "~/components/stu/ui";
import {
  type Drill, type Env, type SectionState, Card, KIT_CSS, N, PALETTE, Seg, crosshair, dayLabel, drillPeople, istTime, useSections,
} from "~/components/stu/overview-kit";
import { getToken } from "~/lib/api";
import { useAdminGuard } from "~/lib/auth-guard";
import { type Cell, addDays, fmtInr, fmtN, pct, todayIst } from "~/lib/stu/model";
import type { Alert, FunnelBar, Insight, KpiTile, OvSection, SourceRow } from "~/lib/stu/overview";
import type { VendorsReport } from "~/lib/vendors/model";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip, Filler);

export function meta() {
  return [{ title: "Overview · Stu · Studojo Admin" }];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Stu went live on studojo.com on this IST day. */
const LAUNCH_DAY = "2026-11-03";
const SECTIONS: readonly OvSection[] = ["kpis", "alerts", "insights", "trends", "usage", "funnel", "sources"];

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "launch" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" }, { key: "launch", label: "Since launch" }, { key: "custom", label: "Custom" },
];

/** The five headline cards, in the old Overview's colours. */
const HEADLINE: { key: string; color: "purple" | "green" | "orange" | "pink" | "yellow" }[] = [
  { key: "revenue", color: "purple" }, { key: "signups", color: "green" }, { key: "onboarded", color: "orange" },
  { key: "active", color: "pink" }, { key: "paid", color: "yellow" },
];
/** The other KPI tiles, kept as one line under the cards. */
const ALSO = ["visitors", "job_opens", "apply_clicks", "outreach"];

/** The short funnel: one step per stage, visitor to paid. */
const FUNNEL_STEPS = ["visited_home", "signed_up", "call_started", "onboarded", "saw_jobs", "outreach_started", "paid"];

/** Insight links point at Overview anchors; the panels that moved now live on /usage. */
const OVERVIEW_ANCHORS = new Set(["#kpis", "#funnel", "#sources", "#trends"]);

const PAGES = [
  { to: "/daily", label: "Daily", note: "Every number, day by day" },
  { to: "/funnel", label: "Funnel", note: "All steps and the time between them" },
  { to: "/drop-offs", label: "Drop-offs", note: "Where people stop, and why" },
  { to: "/sources", label: "Sources", note: "Funnel and revenue per channel" },
  { to: "/journeys", label: "Journeys", note: "Each person, step by step" },
  { to: "/retention", label: "Retention", note: "Who comes back, by week joined" },
  { to: "/ratios", label: "Ratios", note: "The headline conversions" },
  { to: "/usage", label: "Usage", note: "Engagement, power users, calls, live feed", fresh: true },
];

const SERIES = { signups: "#10b981", onboarded: "#f59e0b", active: "#ec4899", paid: "#a855f7" };

// ------------------------------------------------------------------- page

export default function StuOverview() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const today = todayIst();

  const range = (RANGES.some((r) => r.key === params.get("range")) ? params.get("range") : "today") as RangeKey;
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

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const setRange = (key: RangeKey) => setParam(key === "custom" ? { range: key, start, end } : { range: key === "today" ? null : key, start: null, end: null });

  const { S, load, loading, generated, anyEnv } = useSections(SECTIONS, start, end, internal, Boolean(isAuthorized));
  const [drill, setDrill] = useState<{ title: string; cell: Cell; env: Env } | null>(null);
  const openDrill: Drill = (title, cell, env) => setDrill({ title, cell, env });

  // Open support tickets and vendor credits: read as the old Overview and the Vendors page do.
  const [tickets, setTickets] = useState<{ open: number; high: number } | null>(null);
  const [vendors, setVendors] = useState<VendorsReport | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    let live = true;
    (async () => {
      const token = await getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      fetch("/api/tickets?status=open", { credentials: "include", headers })
        .then((r) => r.json())
        .then((d) => live && setTickets({ open: Number(d?.stats?.open) || 0, high: Number(d?.stats?.high_open) || 0 }))
        .catch(() => live && setTickets(null));
      fetch("/api/vendors", { credentials: "include", headers })
        .then((r) => r.json())
        .then((d) => live && setVendors(d?.error ? null : (d as VendorsReport)))
        .catch(() => live && setVendors(null));
    })();
    return () => {
      live = false;
    };
  }, [isAuthorized]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const local = host === "localhost" || host === "127.0.0.1";
  const envName = anyEnv ? (anyEnv.env === "staging" ? "Staging" : anyEnv.env === "production" ? "Production" : "Unknown") : "";
  const qs = new URLSearchParams({ start, end, ...(internal ? { internal: "1" } : {}) }).toString();
  const rangeText = start === end ? dayLabel(start) : `${dayLabel(start)} to ${dayLabel(end)}`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <Attention tickets={tickets} alerts={S("alerts")} vendors={vendors} drill={openDrill} />

        {/* Title and range */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Overview</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>Stu · {rangeText}, IST</span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${anyEnv?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>
                  {local ? `Local, ${envName.toLowerCase()} data` : envName}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                  title={r.key === "launch" ? "From 3 Nov 2026, when the counts were reset" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${range === r.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" className="accent-purple-500" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} />
                Include internal
              </label>
              <button type="button" onClick={() => load(true)} disabled={loading} className="font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:decoration-purple-500 disabled:opacity-50">
                {loading ? "Reading" : "Refresh"}
              </button>
              <span title="The page re-reads every 60 s">{generated ? `Updated ${istTime(generated)} IST` : "Reading"}</span>
            </div>
          </div>
        </div>

        {range === "custom" && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border-2 border-neutral-900 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
            <div>
              <label htmlFor="ov-from" className="block text-xs font-semibold text-neutral-500">From</label>
              <input id="ov-from" type="date" value={start} max={end} onChange={(e) => e.target.value && setParam({ start: e.target.value })} className="mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="ov-to" className="block text-xs font-semibold text-neutral-500">To</label>
              <input id="ov-to" type="date" value={end} min={start} max={today} onChange={(e) => e.target.value && setParam({ end: e.target.value })} className="mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm" />
            </div>
          </div>
        )}

        <div id="kpis" className="scroll-mt-28"><Headline s={S("kpis")} drill={openDrill} range={range} today={today} end={end} /></div>

        <div className="mt-6"><Insights s={S("insights")} drill={openDrill} qs={qs} /></div>

        <div id="trends" className="mt-6 scroll-mt-28">
          <TrendChart trends={S("trends")} usage={S("usage")} kpis={S("kpis")} start={start} end={end} drill={openDrill} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div id="funnel" className="scroll-mt-28"><ShortFunnel s={S("funnel")} drill={openDrill} qs={qs} /></div>
          <div id="sources" className="scroll-mt-28"><TopSources s={S("sources")} drill={openDrill} qs={qs} /></div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PAGES.map((l) => (
            <Link
              key={l.to}
              to={`${l.to}?${qs}`}
              className={`rounded-xl border-2 border-neutral-900 px-4 py-3 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] ${l.fresh ? "bg-purple-50" : "bg-white"}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                {l.label} <span aria-hidden>→</span>
                {l.fresh && <span className="rounded-full bg-purple-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">{l.note}</div>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-xs text-neutral-500">
          {internal ? "Internal accounts included." : "Excluded: staff (admin, ops), @studojo.com, the test accounts, guests."} People counts are the people who joined Stu in the range unless a card says otherwise. Every number opens the people behind it.
        </p>
      </div>
      {drill && <DrillModal title={drill.title} cell={drill.cell} data={drillPeople(drill.env)} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ------------------------------------------------------------ needs action

function Attention({ tickets, alerts, vendors, drill }: { tickets: { open: number; high: number } | null; alerts: SectionState; vendors: VendorsReport | null; drill: Drill }) {
  const list = (alerts.env?.body as Alert[] | undefined) ?? [];
  // Vendors: out of credits, a rejected key, or under 7 days left at the current pace.
  const vend = (vendors?.next ?? []).filter((x) => x.level === "critical" || (x.level === "warning" && x.inDays < 7));
  const hasTickets = Boolean(tickets && tickets.open > 0);
  if (!hasTickets && !list.length && !vend.length) return null;
  const row = (level: "critical" | "warning") =>
    level === "critical"
      ? "border-red-700 bg-red-600 text-white shadow-[4px_4px_0px_0px_rgba(127,29,29,1)]"
      : "border-neutral-900 bg-amber-200 text-neutral-950 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
  const mark = <span aria-hidden className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/30 text-xs font-bold">!</span>;
  return (
    <div className="mb-6 flex flex-col gap-2" role="region" aria-label="Needs attention">
      {hasTickets && tickets && (
        <Link to="/tickets" className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 transition-transform hover:-translate-y-0.5 ${row("critical")}`}>
          <span className="flex min-w-0 items-center gap-3">
            {mark}
            <span className="font-['Clash_Display'] text-base font-semibold md:text-lg">
              {tickets.open} open support ticket{tickets.open === 1 ? "" : "s"}
              {tickets.high > 0 && <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 align-middle text-xs font-bold">{tickets.high} high priority</span>}
            </span>
          </span>
          <span className="whitespace-nowrap text-sm font-semibold">View tickets →</span>
        </Link>
      )}
      {list.map((a) => (
        <div key={a.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 px-4 py-2.5 text-sm ${row(a.level)}`}>
          {mark}
          <span className="min-w-0 flex-1 font-medium">{a.text}</span>
          {a.cell && a.cell.users.length > 0 && alerts.env && (
            <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => drill(a.text, a.cell!, alerts.env!)}>People</button>
          )}
          {a.href && <Link to={a.href} className="whitespace-nowrap text-xs font-semibold underline underline-offset-2">Open →</Link>}
        </div>
      ))}
      {vend.map((v) => (
        <Link key={`${v.vendor}-${v.text}`} to="/vendors" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 px-4 py-2.5 text-sm transition-transform hover:-translate-y-0.5 ${row(v.level === "critical" ? "critical" : "warning")}`}>
          {mark}
          <span className="min-w-0 flex-1 font-medium">{v.text}</span>
          <span className="whitespace-nowrap text-xs font-semibold underline underline-offset-2">Vendors →</span>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------- headline cards

function change(cur: number, prev: number | null, inr: boolean | undefined, vs: string): string {
  if (prev == null) return "no earlier data";
  const diff = cur - prev;
  if (diff === 0) return `no change ${vs}`;
  const p = prev > 0 ? `${Math.abs(Math.round((diff / prev) * 100))}%` : inr ? fmtInr(Math.abs(diff)) : fmtN(Math.abs(diff));
  return `${diff > 0 ? "▲ +" : "▼ -"}${p} ${vs}`;
}

function Headline({ s, drill, range, today, end }: { s: SectionState; drill: Drill; range: RangeKey; today: string; end: string }) {
  const body = s.env?.body as { tiles: KpiTile[]; testPayments: Cell; prevStart: string; prevEnd: string } | undefined;
  const days = body ? Math.round((Date.parse(body.prevEnd) - Date.parse(body.prevStart)) / 86_400_000) + 1 : 1;
  const vs = days === 1 ? (range === "yesterday" || end !== today ? "vs the day before" : "vs yesterday") : `vs the ${days} days before`;
  const tile = (key: string) => body?.tiles.find((x) => x.key === key);
  return (
    <div className="mt-6">
      {s.error && !body && <div className="mb-3 rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">Could not read the numbers: {s.error}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5" aria-busy={s.loading}>
        {HEADLINE.map((h, k) => {
          const t = tile(h.key);
          if (!t || !s.env) {
            return <div key={h.key} className={`h-[156px] animate-pulse rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] ${k === 0 ? "col-span-2 sm:col-span-1" : ""}`} />;
          }
          const env = s.env;
          const people = t.cell.users.length + (t.cell.visitors?.length ?? 0);
          const test = h.key === "revenue" && body!.testPayments.v > 0 ? body!.testPayments.v : 0;
          return (
            <div key={h.key} className={`fade ${k === 0 ? "col-span-2 sm:col-span-1" : ""}`} style={{ opacity: s.loading ? 0.6 : 1 }}>
              <StatCard
                value={t.cell.na ? "n/a" : t.inr ? fmtInr(t.cell.v) : fmtN(t.cell.v)}
                label={t.label}
                color={h.color}
                delay={k * 0.05}
                title={`${t.sub ? `${t.sub}. ` : ""}Source: ${t.source}${people ? ". Click for the people." : ""}`}
                onClick={people ? () => drill(t.label, t.cell, env) : undefined}
                note={
                  <>
                    {t.cell.na ? "not tracked here yet" : change(t.cell.v, t.prev, t.inr, vs)}
                    {test > 0 && <><br />Excludes {test} test payment{test === 1 ? "" : "s"}</>}
                  </>
                }
              />
            </div>
          );
        })}
      </div>
      {body && s.env && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-xl border-2 border-neutral-900 bg-white px-4 py-2.5 text-sm shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">Also in range</span>
          {ALSO.map((key) => {
            const t = tile(key);
            if (!t) return null;
            const c = t.cell.na || t.prev == null ? "" : change(t.cell.v, t.prev, t.inr, "").replace(/^▲ /, "").replace(/^▼ /, "").trim();
            return (
              <span key={key} className="whitespace-nowrap text-neutral-700" title={t.sub ? `${t.sub}. Source: ${t.source}` : `Source: ${t.source}`}>
                {t.label} <N cell={t.cell} env={s.env!} drill={drill} title={t.label} className="font-bold text-neutral-950" />
                {c && !c.startsWith("no ") && <span className={`ml-1 text-xs ${t.cell.v >= (t.prev ?? 0) ? "text-emerald-700" : "text-red-600"}`}>{c}</span>}
              </span>
            );
          })}
          {body.testPayments.v > 0 && (
            <span className="whitespace-nowrap text-neutral-700">
              Test payments <N cell={body.testPayments} env={s.env} drill={drill} title="Test payments" className="font-bold text-neutral-950" />
              <span className="ml-1 text-xs text-neutral-500">left out of revenue</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ what is going on

function Insights({ s, drill, qs }: { s: SectionState; drill: Drill; qs: string }) {
  const href = (h: string) => (h.startsWith("#") && !OVERVIEW_ANCHORS.has(h) ? `/usage?${qs}${h}` : h);
  return (
    <Card title="What's going on" sub="By rules, most important first" s={s} minH={72}>
      {(env) => {
        const list = ((env.body as Insight[]) ?? []).slice(0, 5);
        if (!list.length) return <p className="text-sm text-neutral-500">Nothing to report for this range.</p>;
        return (
          <ol className="grid gap-x-8 gap-y-2 text-[14px] leading-snug lg:grid-cols-2">
            {list.map((x, k) => (
              <li key={x.key} className="flex items-start gap-2.5">
                <span className="tnum mt-[1px] inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-neutral-900 bg-purple-500 text-[11px] font-bold text-white">{k + 1}</span>
                <span className="min-w-0 text-neutral-800">
                  {x.text}{" "}
                  {href(x.href).startsWith("#") ? (
                    <a href={x.href} className="whitespace-nowrap text-xs font-semibold text-purple-700 underline underline-offset-2">See it</a>
                  ) : (
                    <Link to={href(x.href)} className="whitespace-nowrap text-xs font-semibold text-purple-700 underline underline-offset-2">Open</Link>
                  )}
                  {x.cell && x.cell.users.length > 0 && (
                    <button type="button" className="num ml-2 text-xs" onClick={() => drill(x.text, x.cell!, env)}>{x.cell.users.length} people</button>
                  )}
                </span>
              </li>
            ))}
          </ol>
        );
      }}
    </Card>
  );
}

// ------------------------------------------------------------------ chart

interface TrendsBody { days: string[]; series: { key: string; label: string; na: boolean; cells: Cell[] }[] }
interface UsageTrend { trend: { day: string; dau: Cell }[] }

/** Shades the days of the picked range. */
const rangeBand = {
  id: "ovRange",
  beforeDatasetsDraw(chart: any) {
    const o = chart.options.plugins?.ovRange;
    if (!o || o.from < 0 || o.to < o.from) return;
    const x = chart.scales.x;
    const { top, bottom, left, right } = chart.chartArea;
    const n = chart.data.labels?.length ?? 1;
    const step = n > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : right - left;
    const a = Math.max(left, x.getPixelForValue(o.from) - step / 2);
    const b = Math.min(right, x.getPixelForValue(o.to) + step / 2);
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(168,85,247,0.10)";
    ctx.fillRect(a, top, b - a, bottom - top);
    ctx.restore();
  },
};

function TrendChart({ trends, usage, kpis, start, end, drill }: { trends: SectionState; usage: SectionState; kpis: SectionState; start: string; end: string; drill: Drill }) {
  const tb = trends.env?.body as TrendsBody | undefined;
  const ub = usage.env?.body as UsageTrend | undefined;
  const ready = Boolean(tb && ub && trends.env && usage.env);
  const error = trends.error || usage.error;
  const t = PALETTE;

  let content: React.ReactNode = null;
  if (ready) {
    const days = tb!.days;
    const cellsOf = (key: string) => tb!.series.find((x) => x.key === key)?.cells ?? days.map(() => ({ v: 0, users: [] }) as Cell);
    const active = new Map(ub!.trend.map((x) => [x.day, x.dau]));
    const lines: { key: keyof typeof SERIES; label: string; cells: Cell[]; env: Env }[] = [
      { key: "signups", label: "Sign-ups", cells: cellsOf("signups"), env: trends.env! },
      { key: "onboarded", label: "Onboarded", cells: cellsOf("onboarded"), env: trends.env! },
      { key: "active", label: "Active students", cells: days.map((d) => active.get(d) ?? ({ v: 0, users: [] } as Cell)), env: usage.env! },
    ];
    const paid = { label: "Paid (people)", cells: cellsOf("paid"), env: trends.env! };
    // Revenue by day exists for the last 14 days (the KPI section); shown in the tooltip where known.
    const revSpark = (kpis.env?.body as { tiles: KpiTile[] } | undefined)?.tiles.find((x) => x.key === "revenue")?.spark ?? [];
    const revenue = new Map(revSpark.map((p) => [p.day, p.v]));
    const from = days.findIndex((d) => d >= start);
    const to = days.reduce((m, d, i) => (d <= end ? i : m), -1);
    const all = [...lines.map((l) => ({ ...l, kind: "line" as const })), { ...paid, key: "paid" as const, kind: "bar" as const }];
    const data = {
      labels: days.map(dayLabel),
      datasets: [
        ...lines.map((l) => ({
          type: "line" as const, label: l.label, data: l.cells.map((c) => (c.na ? null : c.v)), borderColor: SERIES[l.key], backgroundColor: SERIES[l.key],
          borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: "#fff", cubicInterpolationMode: "monotone" as const, spanGaps: true, order: 1,
        })),
        {
          type: "bar" as const, label: paid.label, data: paid.cells.map((c) => (c.na ? null : c.v)), backgroundColor: "rgba(168,85,247,0.35)",
          borderColor: SERIES.paid, borderWidth: 1.5, borderRadius: 3, maxBarThickness: 16, order: 2,
        },
      ],
    };
    const options: any = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        ovCrosshair: { color: t.axis },
        ovRange: { from, to },
        tooltip: {
          backgroundColor: "#fff", borderColor: t.ink, borderWidth: 2, titleColor: t.ink, bodyColor: t.ink, footerColor: t.ink2, padding: 10, boxWidth: 10, boxHeight: 10,
          callbacks: {
            label: (c: any) => ` ${c.parsed.y == null ? "n/a" : fmtN(c.parsed.y)}  ${c.dataset.label}`,
            footer: (items: any[]) => {
              const day = days[items[0]?.dataIndex];
              return revenue.has(day) ? `Revenue ${fmtInr(revenue.get(day)!)}` : "";
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.ink, width: 2 }, ticks: { color: t.muted, maxTicksLimit: 8, maxRotation: 0, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 } } },
      },
      onClick: (evt: any, _els: any, chart: any) => {
        const hit = chart.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true)[0];
        if (!hit) return;
        const sr = all[hit.datasetIndex];
        const cell = sr?.cells[hit.index];
        if (cell && (cell.users.length || cell.visitors?.length)) drill(`${sr.label}, ${dayLabel(days[hit.index])}`, cell, sr.env);
      },
    };
    const total = (cells: Cell[]) => cells.reduce((a, c) => a + c.v, 0);
    content = (
      <div className="fade" style={{ opacity: trends.loading || usage.loading ? 0.6 : 1 }}>
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-700">
          {lines.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-5 rounded" style={{ background: SERIES[l.key] }} />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border-[1.5px]" style={{ background: "rgba(168,85,247,0.35)", borderColor: SERIES.paid }} />
            {paid.label} <span className="text-neutral-500">{fmtN(total(paid.cells))} in 30 days</span>
          </span>
          {from >= 0 && <span className="flex items-center gap-1.5 text-neutral-500"><span className="inline-block h-3 w-4 rounded-sm" style={{ background: "rgba(168,85,247,0.18)" }} />your range</span>}
        </div>
        <div className="h-64 md:h-72"><Chart type="bar" data={data as any} options={options} plugins={[crosshair, rangeBand]} /></div>
      </div>
    );
  }

  return (
    <section className={`${CARD} overflow-hidden`} aria-busy={trends.loading || usage.loading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
        <h2 className="font-['Clash_Display'] text-lg font-semibold text-neutral-950">Last 30 days to {dayLabel(end)}</h2>
        <span className="text-xs text-neutral-500">People a day, IST. Click a day for its people.</span>
      </div>
      <div className="p-4">
        {error && !ready && <div className="text-xs text-red-600">Could not read: {error}</div>}
        {content ?? (!error && <div className="h-64 animate-pulse rounded-lg bg-neutral-100 md:h-72" />)}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ short funnel

function ShortFunnel({ s, drill, qs }: { s: SectionState; drill: Drill; qs: string }) {
  return (
    <Card title="Funnel" sub="People who joined in range; each step counts those who passed the steps before it. % is of the step above." s={s} minH={230}>
      {(env) => {
        const body = env.body as { key: FunnelBar[]; cohort: number };
        const bars = FUNNEL_STEPS.map((k) => body.key.find((b) => b.key === k)).filter((b): b is FunnelBar => Boolean(b));
        // % of the shown step above (the nearest tracked one).
        let prev: FunnelBar | null = null;
        const rows = bars.map((b, i) => {
          const from = b.untracked ? null : prev;
          const p = from && !from.cell.na && !b.cell.na ? pct(b.cell.v, from.cell.v) : null;
          // A step at zero with people at a later step is a missing beacon, not a drop.
          const gap = b.cell.v === 0 && bars.slice(i + 1).some((x) => x.cell.v > 0);
          if (!b.untracked) prev = b;
          return { b, p, canDrop: p != null && from != null && from.cell.v > 0 && !gap };
        });
        const drop = rows.filter((r) => r.canDrop).reduce<(typeof rows)[number] | null>((m, r) => (m == null || r.p! < m.p! ? r : m), null);
        const dropKey = drop && drop.p! < 100 ? drop.b.key : null;
        const max = Math.max(1, ...bars.map((b) => (b.cell.na ? 0 : b.cell.v)));
        return (
          <div>
            <div className="grid grid-cols-[minmax(84px,130px)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
              {rows.map(({ b, p }) => {
                const isDrop = b.key === dropKey;
                return (
                  <div key={b.key} className="contents">
                    <div className="truncate text-neutral-700" title={b.anon ? `${b.label}: visitor ids in range` : b.label}>{b.label}</div>
                    <div className="flex h-6 items-center">
                      {b.untracked ? (
                        <span className="text-xs text-neutral-400">not tracked yet</span>
                      ) : (
                        <>
                          {b.cell.v > 0 && !b.cell.na && (
                            <div className={`h-[18px] rounded-r-md border-2 border-neutral-900 ${b.anon ? "bg-purple-200" : "bg-purple-500"}`} style={{ width: `${(b.cell.v / max) * 78}%`, minWidth: 6 }} />
                          )}
                          <span className="ml-2 font-bold text-neutral-950"><N cell={b.cell} env={env} drill={drill} title={`${b.label}, ${b.anon ? "visitor ids in range" : "joined in range"}`} /></span>
                        </>
                      )}
                    </div>
                    <div className={`tnum whitespace-nowrap text-right text-xs ${isDrop ? "font-bold text-red-600" : "text-neutral-500"}`}>
                      {b.untracked ? "" : p == null ? (b.anon ? "start" : "") : <>{isDrop && <span aria-label="biggest drop">▼ </span>}{p}%</>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
              <span>
                <span className="mr-1 inline-block h-2.5 w-3 rounded-sm border border-neutral-900 bg-purple-200 align-middle" />visitor ids
                <span className="ml-3 mr-1 inline-block h-2.5 w-3 rounded-sm border border-neutral-900 bg-purple-500 align-middle" />joined in range ({fmtN(body.cohort)})
                {dropKey && <span className="ml-3 font-semibold text-red-600">▼ biggest drop</span>}
              </span>
              <Link to={`/funnel?${qs}`} className="font-semibold text-purple-700 underline underline-offset-2">All steps →</Link>
            </div>
          </div>
        );
      }}
    </Card>
  );
}

// ------------------------------------------------------------- top sources

function TopSources({ s, drill, qs }: { s: SectionState; drill: Drill; qs: string }) {
  const [by, setBy] = useState<"source" | "campaign">("source");
  return (
    <Card
      title="Top sources"
      sub="First touch of the people who joined in range."
      s={s}
      minH={230}
      right={<Seg label="Split by" value={by} onChange={setBy} options={[{ v: "source", l: "Source" }, { v: "campaign", l: "Campaign" }]} />}
    >
      {(env) => {
        const { rows } = (env.body as Record<"source" | "campaign", { rows: SourceRow[]; total: number }>)[by];
        if (!rows.length) return <p className="text-sm text-neutral-500">Nobody joined in this range.</p>;
        return (
          <div>
            <div className="-mx-1 overflow-x-auto">
              <table className="tnum w-full text-sm">
                <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-1 pb-1.5">{by === "source" ? "Source / medium" : "Campaign"}</th>
                    <th className="px-1 pb-1.5 text-right">Sign-ups</th>
                    <th className="px-1 pb-1.5 text-right">Onboarded</th>
                    <th className="px-1 pb-1.5 text-right">Paid</th>
                    <th className="px-1 pb-1.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="row-hover border-t-2 border-neutral-100">
                      <td className="max-w-[160px] truncate px-1 py-1.5 font-medium text-neutral-900" title={r.key}>{r.key}{r.other ? <span className="text-neutral-500"> ({r.other})</span> : null}</td>
                      <td className="px-1 py-1.5 text-right font-bold"><N cell={r.signups} env={env} drill={drill} title={`Sign-ups from ${r.key}`} /></td>
                      <td className="px-1 py-1.5 text-right"><N cell={r.onboarded} env={env} drill={drill} title={`Onboarded from ${r.key}`} /></td>
                      <td className="px-1 py-1.5 text-right"><N cell={r.paid} env={env} drill={drill} title={`Paid from ${r.key}`} /></td>
                      <td className="px-1 py-1.5 text-right"><N cell={r.revenue} env={env} drill={drill} title={`Revenue from ${r.key}`} fmt={fmtInr} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end text-xs">
              <Link to={`/sources?${qs}`} className="font-semibold text-purple-700 underline underline-offset-2">Channels and more →</Link>
            </div>
          </div>
        );
      }}
    </Card>
  );
}
