// Old vs new (the owner, 15 Nov 2026: "analytics of my previous product versus the new B2C product, comparing our
// ratios, purchases, replies, every single ratio, visitor to sign up, everything ... Take the best day of the previous
// and compare it"). The retired student product (to 2 Nov 2026) against Stu (from 3 Nov 2026): a scoreboard of every
// ratio against an old baseline the admin picks, the best days face to face, both funnels, the whole history on one
// axis, month by month, channels, and what does not compare. Its own controls; read only (/api/compare,
// app/lib/compare). Stu's numbers are the ones the Stu pages show; the old ones are read from the old tables.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { AdminHeader } from "~/components";
import { KIT_CSS, Seg, istTime } from "~/components/stu/overview-kit";
import { CARD, DrillModal, type DrillPeople, channelLabel } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { type Cell, addDays, fmtDur, fmtN, todayIst } from "~/lib/stu/model";
import { fetchCompare } from "~/lib/compare/client";
import {
  type BaseKind, type BestBy, type CompareEnvelope, type FaceRow, type FunnelStep, type Kind, type PCell, type Row, type TimelinePoint, type WinMetrics,
  ATTRIBUTION_FROM, FACE_METRICS, HORIZON_DAYS, RELAUNCH_DAY, USD_INR, change, dayText, monthText, pct, winText,
} from "~/lib/compare/model";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function meta() {
  return [{ title: "Old vs new · Stu · Studojo Admin" }];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
type RangeKey = "launch" | "7d" | "14d" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "launch", label: "Since 3 Nov" }, { key: "7d", label: "7 days" }, { key: "14d", label: "14 days" }, { key: "custom", label: "Custom" },
];
const BASES: { key: BaseKind; label: string }[] = [
  { key: "best", label: "Best stretch of the same length" },
  { key: "last", label: "Last days before the switch-off" },
  { key: "lifetime", label: "Lifetime per-day average" },
  { key: "month", label: "Best month (or pick one)" },
  { key: "custom", label: "Custom old range" },
];
const OLD_COLOR = "#f59e0b";
const NEW_COLOR = "#8b5cf6";

// ------------------------------------------------------------------ formatting

const dec = (v: number): string => (Math.abs(v) >= 100 ? fmtN(v) : Math.abs(v) >= 10 ? v.toFixed(1) : v === 0 ? "0" : v.toFixed(2));
const inr = (paise: number): string => {
  const r = paise / 100;
  return Math.abs(r) >= 100 || r === 0 ? `₹${fmtN(r)}` : `₹${r.toFixed(2)}`;
};
function fmtVal(kind: Kind, v: number | null | undefined): string {
  if (v == null) return "n/a";
  if (kind === "pct") return `${v}%`;
  if (kind === "inr") return inr(v);
  if (kind === "ms") return fmtDur(v) || "0s";
  if (kind === "count") return fmtN(v);
  return dec(v);
}
const daysText = (n: number) => (Number.isInteger(n) ? `${n} day${n === 1 ? "" : "s"}` : `${n.toFixed(1)} days`);

// ------------------------------------------------------------------ pieces

function Panel({ id, title, sub, right, children }: { id?: string; title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className={`${CARD} min-w-0 scroll-mt-28 overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-['Clash_Display'] text-lg font-semibold leading-tight text-neutral-950">{title}</h2>
          {sub && <p className="mt-0.5 max-w-3xl whitespace-normal text-xs text-neutral-500">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-0.5 max-w-[420px] whitespace-normal text-[11px] leading-snug text-neutral-500">{children}</div>
);

function Pill({ c }: { c: { text: string; tone: string } }) {
  if (!c.text) return null;
  const cls = c.tone === "good" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : c.tone === "bad" ? "border-red-500 bg-red-50 text-red-700" : "border-neutral-300 bg-white text-neutral-600";
  return <span className={`inline-block whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${cls}`}>{c.text}</span>;
}

type Drill = (title: string, cell: PCell) => void;

/** A new-side number that opens the people behind it. */
function Num({ text, cell, title, drill, className = "" }: { text: string; cell?: PCell; title: string; drill: Drill; className?: string }) {
  if (!cell || !cell.users.length) return <span className={className}>{text}</span>;
  return (
    <button type="button" onClick={() => drill(title, cell)} className={`num ${className}`} title={`${cell.users.length} people: click for the list`}>
      {text}
    </button>
  );
}

// ------------------------------------------------------------------ the page

export default function Compare() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const today = todayIst();

  const given = params.get("r") as RangeKey | null;
  const range: RangeKey = RANGES.some((r) => r.key === given) ? given! : "launch";
  const { ns, ne } = useMemo(() => {
    if (range === "7d") return { ns: addDays(today, -6), ne: today };
    if (range === "14d") return { ns: addDays(today, -13), ne: today };
    if (range === "custom") {
      const e = DAY_RE.test(params.get("ne") || "") ? params.get("ne")! : today;
      const s = DAY_RE.test(params.get("ns") || "") ? params.get("ns")! : RELAUNCH_DAY;
      return { ns: s <= e ? s : e, ne: e };
    }
    return { ns: RELAUNCH_DAY, ne: today };
  }, [range, params, today]);
  const base = (BASES.some((b) => b.key === params.get("base")) ? params.get("base") : "best") as BaseKind;
  const by: BestBy = params.get("by") === "revenue" ? "revenue" : "signups";
  const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month")! : "";
  const bs = DAY_RE.test(params.get("bs") || "") ? params.get("bs")! : "2026-05-01";
  const be = DAY_RE.test(params.get("be") || "") ? params.get("be")! : "2026-05-31";
  const horizon = params.get("h") === String(HORIZON_DAYS);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const q = new URLSearchParams({ ns, ne, base, by });
    if (base === "month" && month) q.set("month", month);
    if (base === "custom") {
      q.set("bs", bs);
      q.set("be", be);
    }
    if (horizon) q.set("h", String(HORIZON_DAYS));
    return q.toString();
  }, [ns, ne, base, by, month, bs, be, horizon]);

  const [env, setEnv] = useState<CompareEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState<{ title: string; cell: Cell } | null>(null);
  const [tlMetric, setTlMetric] = useState<string>("signups");
  const [tlBy, setTlBy] = useState<"day" | "week">("week");

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      setEnv(await fetchCompare(new URLSearchParams(query), fresh));
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    if (isAuthorized) load(false);
  }, [isAuthorized, load]);

  const people: DrillPeople = useMemo(() => {
    const users: DrillPeople["users"] = [];
    for (const [k, v] of Object.entries(env?.people ?? {})) users[Number(k)] = v;
    return { users, visitors: [] };
  }, [env]);
  const openDrill: Drill = (title, cell) => setDrill({ title, cell: { v: cell.v, users: cell.users } });

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const r = env?.report;
  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · <Link to="/" className="hover:underline">Overview</Link></div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Old vs new</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              The old student product (studojo.com, switched off 2 Nov 2026 at 03:55 IST) against Stu (counted from 3 Nov 2026). Days are IST.
              Rates are per day, so windows of different lengths compare; totals sit under them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
            {env && <span>Updated {istTime(Date.parse(env.generatedAt))} IST · old data read {istTime(Date.parse(env.oldReadAt))} IST (kept 12 hours)</span>}
            <button type="button" onClick={() => load(true)} disabled={loading} className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-2.5 py-1 font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50">
              {loading ? "Reading" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border-2 border-neutral-900 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-purple-700">New: Stu window</div>
            <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1" role="group" aria-label="New window">
              {RANGES.map((x) => (
                <button key={x.key} type="button" aria-pressed={range === x.key}
                  onClick={() => setParam(x.key === "custom" ? { r: x.key, ns, ne } : { r: x.key === "launch" ? null : x.key, ns: null, ne: null })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${range === x.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
                  {x.label}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <input aria-label="New from" type="date" value={ns} min={RELAUNCH_DAY} max={ne} onChange={(e) => e.target.value && setParam({ ns: e.target.value })} className="rounded-lg border-2 border-neutral-300 px-2 py-1" />
                <span className="text-neutral-500">to</span>
                <input aria-label="New to" type="date" value={ne} min={ns} max={today} onChange={(e) => e.target.value && setParam({ ne: e.target.value })} className="rounded-lg border-2 border-neutral-300 px-2 py-1" />
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              <span className="font-semibold">Count a step</span>
              <Seg label="Count a step" value={horizon ? "7" : "all"} onChange={(v) => setParam({ h: v === "7" ? String(HORIZON_DAYS) : null })}
                options={[{ v: "all", l: "Any time" }, { v: "7", l: `Within ${HORIZON_DAYS} days of sign-up` }]} />
            </div>
            <p className="mt-1 max-w-md text-[11px] leading-snug text-neutral-500">
              Old sign-ups had months to reach a step, Stu's only days. Within {HORIZON_DAYS} days is the fair cohort comparison; Any time matches the Stu Funnel.
            </p>
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">Old: baseline</div>
            <select aria-label="Old baseline" value={base} onChange={(e) => setParam({ base: e.target.value === "best" ? null : e.target.value })}
              className="w-full max-w-sm rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5 text-sm font-semibold">
              {BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              {(base === "best" || (base === "month" && !month)) && (
                <>
                  <span className="font-semibold">Best by</span>
                  <Seg label="Best by" value={by} onChange={(v) => setParam({ by: v === "signups" ? null : v })} options={[{ v: "signups", l: "Sign-ups" }, { v: "revenue", l: "Revenue" }]} />
                </>
              )}
              {base === "month" && (
                <select aria-label="Old month" value={month} onChange={(e) => setParam({ month: e.target.value || null })} className="rounded-lg border-2 border-neutral-300 bg-white px-2 py-1 text-sm">
                  <option value="">The best month</option>
                  {(r?.monthList ?? []).map((m) => <option key={m} value={m}>{monthText(m)}</option>)}
                </select>
              )}
              {base === "custom" && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <input aria-label="Old from" type="date" value={bs} max={be} onChange={(e) => e.target.value && setParam({ bs: e.target.value })} className="rounded-lg border-2 border-neutral-300 px-2 py-1" />
                  <span className="text-neutral-500">to</span>
                  <input aria-label="Old to" type="date" value={be} min={bs} max="2026-11-02" onChange={(e) => e.target.value && setParam({ be: e.target.value })} className="rounded-lg border-2 border-neutral-300 px-2 py-1" />
                </div>
              )}
            </div>
            {r && <p className="mt-2 max-w-md text-[11px] leading-snug text-neutral-500">{r.base.label}: {r.base.why}.</p>}
          </div>
        </div>

        {r && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border-2 border-purple-500 bg-purple-50 px-2.5 py-1 font-semibold text-purple-800">
              New: {winText(r.newWin)} · {daysText(Math.round(r.newDays * 10) / 10)}{r.newWin.end === today ? " (today so far)" : ""}
            </span>
            <span className="rounded-full border-2 border-amber-500 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
              Old: {winText(r.base)} · {daysText(r.baseDays)}
            </span>
            {r.horizon != null && <span className="rounded-full border-2 border-neutral-400 bg-white px-2.5 py-1 font-semibold text-neutral-700">Steps within {r.horizon} days of sign-up</span>}
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">Could not read the comparison: {error}</div>}
        {env && !env.present && <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">This database holds no old product data ({env.env}): the old side is empty.</div>}
        {env?.visitors.error && (
          <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            Visitors not available from PostHog ({env.visitors.error.slice(0, 160)}). Old visitors and the PostHog rows show n/a; everything else is read from the databases.
          </div>
        )}
        {!env && !error && <div className="mt-6 h-40 animate-pulse rounded-2xl border-2 border-neutral-900 bg-white" />}

        {env && r && (
          <div className="fade mt-6 flex flex-col gap-6" style={{ opacity: loading ? 0.6 : 1 }}>
            <Headline rows={r.rows} drill={openDrill} />
            <Panel id="scoreboard" title="Scoreboard" sub={<>Old ({winText(r.base)}) against new ({winText(r.newWin)}). Green: Stu does better; red: worse. Per-day rows divide by the days in each window (today counts as the part gone by). Click a Stu number for the people.</>}>
              <Scoreboard rows={r.rows} baseLabel={r.base.label} drill={openDrill} />
            </Panel>
            <Panel id="best-day" title="Best day face-off" sub="Each side's best single IST day, Stu's today and yesterday, and the per-day averages. The old average is its lifetime, every whole day it ran.">
              <FaceOff rows={r.face} today={today} />
            </Panel>
            <Panel id="ratios" title="Every step, both funnels" sub={<>People who signed up in each window, each counted once per step{r.horizon != null ? `, a step counted only within ${r.horizon} days of sign-up` : ", any time after"}. Of step before: of those who did the step above, the share who did this one too.</>}>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
                <FunnelTable title={`Old: signed up ${winText(r.base)}`} steps={r.funnels.old} color="amber" drill={openDrill} />
                <FunnelTable title={`Stu: signed up ${winText(r.newWin)}`} steps={r.funnels.neu} color="purple" drill={openDrill} />
              </div>
            </Panel>
            <Panel id="timeline" title="The whole history" sub="Every day (or week) from the old product's first account to today, on one axis. Old in amber, Stu in purple; the line is the relaunch."
              right={<div className="flex flex-wrap gap-2">
                <Seg label="Metric" value={tlMetric} onChange={setTlMetric} options={FACE_METRICS.map((m) => ({ v: m.key, l: m.label }))} />
                <Seg label="By" value={tlBy} onChange={(v) => setTlBy(v as "day" | "week")} options={[{ v: "day", l: "Daily" }, { v: "week", l: "Weekly" }]} />
              </div>}>
              <Timeline points={tlBy === "day" ? r.timeline.day : r.timeline.week} metric={tlMetric} by={tlBy} />
            </Panel>
            <Panel id="months" title="Month by month" sub="Every month of the old product, its last two days, then Stu so far. Ratios are of that month's sign-ups (steps any time); return on day 7 counts only sign-ups whose day 7 came before the switch-off.">
              <Months env={env} />
            </Panel>
            <Panel id="channels" title="Where sign-ups came from" sub={<>First touch by channel. The old product kept a first touch only from {dayText(ATTRIBUTION_FROM)} 2026, so its column is {winText(r.channels.oldWin)} ({fmtN(r.channels.oldTotal)} sign-ups); Stu's is the new window ({fmtN(r.channels.newTotal)}). Paid and revenue: those sign-ups, any time.</>}>
              <Channels env={env} drill={openDrill} />
            </Panel>
            <Panel id="notes" title="What does not compare, and how it is counted">
              <Notes env={env} />
            </Panel>
          </div>
        )}
      </div>
      {drill && <DrillModal title={drill.title} cell={drill.cell} data={people} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ headline

function Headline({ rows, drill }: { rows: Row[]; drill: Drill }) {
  const pick = ["signups_day", "visit_signup", "signup_paid", "revenue_day"].map((k) => rows.find((x) => x.key === k)).filter((x): x is Row => !!x);
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {pick.map((row) => {
        const c = change(row, row.old.v, row.neu.v);
        return (
          <div key={row.key} className={`${CARD} min-w-0 p-4`}>
            <div className="text-xs font-semibold text-neutral-500">{row.label}</div>
            <div className="mt-1 font-['Clash_Display'] text-2xl font-bold text-neutral-950 md:text-3xl">
              <Num text={fmtVal(row.kind, row.neu.v)} cell={row.neu.cell} title={`${row.label}, Stu`} drill={drill} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
              <span>old {fmtVal(row.kind, row.old.v)}</span>
              <Pill c={c} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ scoreboard

const SCORE_GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_150px_150px_100px]";

function Scoreboard({ rows, baseLabel, drill }: { rows: Row[]; baseLabel: string; drill: Drill }) {
  let group = "";
  const total = (row: Row, v: Row["old"]) => (row.perDay && v.total != null ? `${fmtVal(row.kind === "num" ? "count" : row.kind, v.total)} in all` : "");
  return (
    <div className="tnum text-sm">
      <div className={`${SCORE_GRID} hidden pb-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-500 md:grid`}>
        <div>Metric</div>
        <div className="text-right text-amber-700">{baseLabel.replace(/^Old: /, "Old, ")}</div>
        <div className="text-right text-purple-700">New, Stu</div>
        <div className="text-right">Change</div>
      </div>
      {rows.map((row) => {
        const head = row.group !== group;
        group = row.group;
        const c = change(row, row.old.v, row.neu.v);
        return (
          <Fragment key={row.key}>
            {head && <div className="mt-1 bg-violet-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-800">{row.group}</div>}
            <div className={`${SCORE_GRID} row-hover border-t-2 border-neutral-100 px-1 py-1.5`}>
              <div className="col-span-3 min-w-0 md:col-span-1">
                <div className="font-medium text-neutral-900">{row.label}</div>
                {row.def && <Note>{row.def}</Note>}
                {row.oldDef && <Note><b className="text-amber-700">Old:</b> {row.oldDef}</Note>}
                {row.newDef && <Note><b className="text-purple-700">New:</b> {row.newDef}</Note>}
              </div>
              <div className="min-w-0 md:text-right">
                <span className="mr-1 text-[10px] font-bold uppercase text-amber-700 md:hidden">Old</span>
                <span className="font-bold text-neutral-800">{fmtVal(row.kind, row.old.v)}</span>
                <div className="text-[11px] text-neutral-500">{[total(row, row.old), row.old.note].filter(Boolean).join(", ")}</div>
              </div>
              <div className="min-w-0 md:text-right">
                <span className="mr-1 text-[10px] font-bold uppercase text-purple-700 md:hidden">New</span>
                <span className="font-bold text-neutral-950"><Num text={fmtVal(row.kind, row.neu.v)} cell={row.neu.cell} title={`${row.label}, Stu`} drill={drill} /></span>
                <div className="text-[11px] text-neutral-500">{[total(row, row.neu), row.neu.note].filter(Boolean).join(", ")}</div>
              </div>
              <div className="text-right"><Pill c={c} /></div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ best day

function FaceOff({ rows, today }: { rows: FaceRow[]; today: string }) {
  const v = (f: FaceRow, x: number | null | undefined) => (x == null ? "n/a" : f.inr ? inr(x) : Number.isInteger(x) ? fmtN(x) : dec(x));
  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 overflow-x-auto">
        <table className="tnum w-full min-w-[760px] text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-1 pb-1.5">Metric</th>
              <th className="px-1 pb-1.5 text-right text-amber-700">Old best day</th>
              <th className="px-1 pb-1.5 text-right text-purple-700">Stu best day</th>
              <th className="px-1 pb-1.5 text-right">Best vs best</th>
              <th className="px-1 pb-1.5 text-right">Stu today, so far</th>
              <th className="px-1 pb-1.5 text-right">Stu yesterday</th>
              <th className="px-1 pb-1.5 text-right">Stu per day</th>
              <th className="px-1 pb-1.5 text-right">Old per day, lifetime</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.key} className="row-hover border-t-2 border-neutral-100">
                <td className="px-1 py-1.5 font-medium text-neutral-900">{f.label}</td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right"><b>{v(f, f.oldBest?.v)}</b> <span className="text-[11px] text-neutral-500">{f.oldBest ? `${dayText(f.oldBest.day)} ${f.oldBest.day.slice(0, 4)}` : ""}</span></td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right"><b>{v(f, f.newBest?.v)}</b> <span className="text-[11px] text-neutral-500">{f.newBest ? `${dayText(f.newBest.day)}${f.newBest.soFar ? " (today)" : ""}` : ""}</span></td>
                <td className="px-1 py-1.5 text-right"><Pill c={f.bestVsBest} /></td>
                <td className="px-1 py-1.5 text-right">{v(f, f.today)}</td>
                <td className="px-1 py-1.5 text-right">{v(f, f.yesterday)}</td>
                <td className="px-1 py-1.5 text-right font-semibold">{v(f, f.newAvg)}</td>
                <td className="px-1 py-1.5 text-right">{v(f, f.oldAvg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="tnum w-full min-w-[640px] text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-1 pb-1.5">Per day, over</th>
              <th className="px-1 pb-1.5 text-right text-amber-700">Old best 7 days</th>
              <th className="px-1 pb-1.5 text-right text-purple-700">Stu best 7 days</th>
              <th className="px-1 pb-1.5 text-right text-amber-700">Old best month</th>
              <th className="px-1 pb-1.5 text-right text-purple-700">Stu since 3 Nov</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.key} className="row-hover border-t-2 border-neutral-100">
                <td className="px-1 py-1.5 font-medium text-neutral-900">{f.label}</td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right"><b>{v(f, f.oldWeek?.perDay)}</b> <span className="text-[11px] text-neutral-500">{f.oldWeek ? winText({ start: f.oldWeek.start, end: f.oldWeek.end }) : ""}</span></td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right"><b>{v(f, f.newWeek?.perDay)}</b> <span className="text-[11px] text-neutral-500">{f.newWeek ? `${dayText(f.newWeek.start)} to ${dayText(f.newWeek.end)}` : "under 7 whole days"}</span></td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right"><b>{v(f, f.oldMonth?.perDay)}</b> <span className="text-[11px] text-neutral-500">{f.oldMonth ? monthText(f.oldMonth.month) : ""}</span></td>
                <td className="px-1 py-1.5 text-right font-semibold">{v(f, f.newAvg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-snug text-neutral-500">
        Best 7 days: seven whole days in a row; Stu's leaves out today ({dayText(today)}), which is not over. Payers per day count each person once a day; revenue is money kept, dollars at ₹{USD_INR}.
        Old visitors: PostHog, from 1 Apr 2026. Activated: old leads generated, Stu onboarded.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ funnels

function FunnelTable({ title, steps, color, drill }: { title: string; steps: FunnelStep[]; color: "amber" | "purple"; drill: Drill }) {
  const neu = color === "purple";
  return (
    <div className="min-w-0">
      <div className={`mb-2 text-sm font-bold ${neu ? "text-purple-700" : "text-amber-700"}`}>{title}</div>
      <div className="-mx-1 overflow-x-auto">
        <table className="tnum w-full min-w-[480px] text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-1 pb-1.5">Step</th>
              <th className="px-1 pb-1.5 text-right">People</th>
              <th className="px-1 pb-1.5 text-right">Of sign-ups</th>
              <th className="px-1 pb-1.5 text-right">Of step before</th>
              <th className="px-1 pb-1.5 text-right" title="Median time from the step before, people who did both in that order">Time from before</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={s.key} className="row-hover border-t-2 border-neutral-100 align-top">
                <td className="px-1 py-1.5">
                  <div className="font-medium text-neutral-900">{i + 1}. {s.label}</div>
                  {(s.from || s.note) && <Note>{[s.from ? `tracked from ${dayText(s.from)} ${s.from.slice(0, 4)}${s.partial ? ": reads low here, and the next step is measured from the one before" : ""}` : "", s.note ?? ""].filter(Boolean).join("; ")}</Note>}
                </td>
                <td className="px-1 py-1.5 text-right font-bold">{neu ? <Num text={fmtN(s.people.v)} cell={s.people} title={`${s.label}, Stu`} drill={drill} /> : fmtN(s.people.v)}</td>
                <td className="px-1 py-1.5 text-right">{s.ofSignups == null ? "n/a" : `${s.ofSignups}%`}</td>
                <td className="px-1 py-1.5 text-right">{s.ofPrev == null ? "" : `${s.ofPrev}%`}</td>
                <td className="px-1 py-1.5 text-right text-neutral-600">{s.fromPrev == null ? "" : fmtDur(s.fromPrev) || "0s"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ timeline

/** The relaunch line: a dashed rule before the first Stu bar. */
const relaunchLine = {
  id: "relaunchLine",
  afterDatasetsDraw(chart: any) {
    const at = chart.options.plugins?.relaunchLine?.index;
    if (at == null || at < 0) return;
    const x0 = chart.scales.x.getPixelForValue(at - 1);
    const x1 = chart.scales.x.getPixelForValue(at);
    const x = at > 0 ? (x0 + x1) / 2 : x1;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#171717";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#171717";
    ctx.font = "600 11px Satoshi, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Relaunch, 3 Nov", x - 4, top + 10);
    ctx.restore();
  },
};

function Timeline({ points, metric, by }: { points: TimelinePoint[]; metric: string; by: "day" | "week" }) {
  const def = FACE_METRICS.find((m) => m.key === metric) ?? FACE_METRICS[1];
  const isInr = "inr" in def && def.inr;
  const labels = points.map((p) => (by === "week" ? `wk ${dayText(p.at)}${p.at.slice(0, 4) === "2026" ? "" : ` ${p.at.slice(0, 4)}`}` : `${dayText(p.at)}`));
  const val = (p: TimelinePoint) => {
    const x = p.v[def.key];
    return x == null ? null : isInr ? Math.round(x / 100) : x;
  };
  const relaunch = points.findIndex((p) => p.side === "new");
  const data = {
    labels,
    datasets: [
      { label: "Old", data: points.map((p) => (p.side === "old" ? val(p) : null)), backgroundColor: OLD_COLOR, stack: "s", maxBarThickness: 18 },
      { label: "Stu", data: points.map((p) => (p.side === "new" ? val(p) : null)), backgroundColor: NEW_COLOR, stack: "s", maxBarThickness: 18 },
    ],
  };
  const options: any = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      relaunchLine: { index: relaunch },
      tooltip: {
        backgroundColor: "#fff", borderColor: "#171717", borderWidth: 1, titleColor: "#525252", bodyColor: "#171717", padding: 8,
        filter: (c: any) => c.parsed.y != null,
        callbacks: {
          title: (items: any[]) => {
            const p = points[items[0]?.dataIndex];
            return p ? `${by === "week" ? "Week of " : ""}${dayText(p.at)} ${p.at.slice(0, 4)}${p.part ? " (part week)" : ""}` : "";
          },
          label: (c: any) => ` ${c.dataset.label}: ${isInr ? `₹${fmtN(c.parsed.y)}` : fmtN(c.parsed.y)}${def.key === "visitors" && by === "week" ? " a day" : ""}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: "#737373", maxTicksLimit: 8, maxRotation: 0, font: { size: 11 } } },
      y: { stacked: true, beginAtZero: true, grid: { color: "#e5e5e5" }, border: { display: false }, ticks: { color: "#737373", maxTicksLimit: 5, font: { size: 11 }, callback: (v: any) => (isInr ? `₹${fmtN(Number(v))}` : fmtN(Number(v))) } },
    },
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: OLD_COLOR }} />Old product</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: NEW_COLOR }} />Stu</span>
        <span className="text-neutral-500">{by === "week" ? "Weeks start Monday; the week of 2 Nov is split at the relaunch. Visitors: average a day; payers: people, once a week." : "IST days."}</span>
      </div>
      <div className="h-[280px]"><Bar data={data as any} options={options} plugins={[relaunchLine]} /></div>
    </div>
  );
}

// ------------------------------------------------------------------ months

function Months({ env }: { env: CompareEnvelope }) {
  const rows = env.report.months;
  const p = (n: number, d: number | null | undefined) => {
    const x = pct(n, d);
    return x == null ? "n/a" : `${x}%`;
  };
  const cols: { h: string; title?: string; f: (m: WinMetrics) => string }[] = [
    { h: "Days", f: (m) => daysText(Math.round(m.days * 10) / 10) },
    { h: "Visitors / day", f: (m) => (m.visitorsSum == null ? "n/a" : dec(m.visitorsSum / Math.max(m.visitorDays, 0.01))) },
    { h: "Sign-ups", f: (m) => fmtN(m.signups.v) },
    { h: "/ day", f: (m) => dec(m.signups.v / m.days) },
    { h: "Visit to sign-up", f: (m) => p(m.signupsTracked, m.visitors) },
    { h: "First step", title: "Old: uploaded a resume; Stu: call started (of sign-ups)", f: (m) => p(m.actStart.v, m.signups.v) },
    { h: "Activated", title: "Old: leads generated; Stu: onboarded (of sign-ups)", f: (m) => p(m.actValue.v, m.signups.v) },
    { h: "Payers", f: (m) => fmtN(m.payers.v) },
    { h: "Payments", f: (m) => fmtN(m.payments) },
    { h: "Revenue", f: (m) => inr(m.revenue) },
    { h: "/ day", f: (m) => inr(m.revenue / m.days) },
    { h: "Sign-up to paid", f: (m) => p(m.cohortPaid.v, m.signups.v) },
    { h: "Emails", f: (m) => fmtN(m.emails) },
    { h: "Replies", f: (m) => fmtN(m.replies) },
    { h: "Reply rate", title: "Replies over people first emailed", f: (m) => p(m.replies, m.reached) },
    { h: "Day 7 return", f: (m) => p(m.ret.d7.back.v, m.ret.d7.eligible.v) },
    { h: "Daily actives", f: (m) => dec(m.dauSum / m.days) },
  ];
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="tnum w-full min-w-[1100px] text-sm">
        <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="sticky left-0 z-10 bg-white px-1 pb-1.5 align-bottom">Month</th>
            {cols.map((c, i) => <th key={i} className="px-1 pb-1.5 text-right align-bottom leading-tight" title={c.title}>{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.label} className={`row-hover border-t-2 border-neutral-100 ${x.side === "new" ? "bg-purple-50/60 font-semibold" : ""}`}>
              <td className={`sticky left-0 z-10 whitespace-nowrap px-1 py-1.5 ${x.side === "new" ? "bg-purple-50 text-purple-800" : "bg-white text-neutral-900"}`}>{x.label}</td>
              {cols.map((c, i) => <td key={i} className="whitespace-nowrap px-1 py-1.5 text-right">{c.f(x.m)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ channels

function Channels({ env, drill }: { env: CompareEnvelope; drill: Drill }) {
  const c = env.report.channels;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="tnum w-full min-w-[720px] text-sm">
        <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-1 pb-1.5">Channel</th>
            <th className="px-1 pb-1.5 text-right text-amber-700">Old sign-ups</th>
            <th className="px-1 pb-1.5 text-right text-amber-700">Share</th>
            <th className="px-1 pb-1.5 text-right text-amber-700">Paid</th>
            <th className="px-1 pb-1.5 text-right text-amber-700">Revenue</th>
            <th className="px-1 pb-1.5 text-right text-purple-700">Stu sign-ups</th>
            <th className="px-1 pb-1.5 text-right text-purple-700">Share</th>
            <th className="px-1 pb-1.5 text-right text-purple-700">Paid</th>
            <th className="px-1 pb-1.5 text-right text-purple-700">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((row) => (
            <tr key={row.key} className="row-hover border-t-2 border-neutral-100">
              <td className="px-1 py-1.5 font-medium text-neutral-900">{channelLabel(row.key)}</td>
              <td className="px-1 py-1.5 text-right">{fmtN(row.old.signups)}</td>
              <td className="px-1 py-1.5 text-right text-neutral-600">{row.old.share == null ? "" : `${row.old.share}%`}</td>
              <td className="px-1 py-1.5 text-right">{fmtN(row.old.paid)}</td>
              <td className="px-1 py-1.5 text-right">{inr(row.old.revenue)}</td>
              <td className="px-1 py-1.5 text-right font-bold"><Num text={fmtN(row.neu.signups)} cell={row.neu.cell} title={`Stu sign-ups from ${channelLabel(row.key)}`} drill={drill} /></td>
              <td className="px-1 py-1.5 text-right text-neutral-600">{row.neu.share == null ? "" : `${row.neu.share}%`}</td>
              <td className="px-1 py-1.5 text-right">{fmtN(row.neu.paid)}</td>
              <td className="px-1 py-1.5 text-right">{inr(row.neu.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ notes

function Notes({ env }: { env: CompareEnvelope }) {
  const o = env.other;
  const ex = Object.entries(env.excluded).map(([k, n]) => `${k} ${n}`).join(", ");
  return (
    <div className="grid grid-cols-1 gap-5 text-xs leading-relaxed text-neutral-600 lg:grid-cols-2 [&>*]:min-w-0">
      <div>
        <h3 className="mb-1 text-sm font-bold text-neutral-900">Not the same thing on both sides</h3>
        <ul className="list-disc space-y-1 pl-4">
          <li><b>Sign-ups.</b> Old: any new studojo.com account, for any dojo (outreach, resume builder, internships, assignments). Stu: a first Stu sign-in; an older studojo.com account counts as new on its first Stu day (the owner's rule of 2 Nov), so some Stu sign-ups are old users coming back.</li>
          <li><b>Visitors.</b> Old: PostHog (people with a page view), from 1 Apr 2026 (its first whole day on studojo.com). Stu: its own page_view beacon, from 3 Nov 21:58 IST. Two trackers. PostHog still runs on studojo.com, so the "PostHog on both" rows count both sides the same way.</li>
          <li><b>Activation.</b> Two products: old uploaded a resume, then got leads; Stu starts a call, then is onboarded.</li>
          <li><b>Money.</b> Old sold outreach email credits, one-off, in rupees and dollars (dollars here at ₹{USD_INR}); Stu sells packs and autopay (an autopay renewal counts as a repeat purchase). Revenue is money kept, so coupon and credit orders are not money.</li>
          <li><b>Refunds.</b> The old product never wrote refunds to its database (refunded_cents and payment_refunds are empty), so its refund rate is unknown, not zero.</li>
          <li><b>Opens.</b> The old product tracked opens with a pixel from 7 Jul 2026 (a pixel overcounts: mail apps load images). Stu does not track opens.</li>
          <li><b>Time.</b> Old cohorts had months to reach a step; Stu's have days. Use "Within 7 days of sign-up" for a fair cohort ratio.</li>
          <li><b>Coming back.</b> Old: signed in, a page while signed in (PostHog{env.activeFromPosthog ? "" : ", not available now"}), or any step, payment or tool use that day. Stu: did something themselves (the Stu Active count).</li>
          <li><b>Channels.</b> The old product kept a first touch only from 19 Sep 2026.</li>
          <li><b>The old dashboards</b> (/old) counted differently: visitors by distinct browser id on every host by UTC day, sign-ups including staff and B2B accounts, revenue at ₹94 a dollar with B2B deals added and test payments in. This page corrects all of these.</li>
        </ul>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-bold text-neutral-900">Who and what is counted</h3>
        <ul className="list-disc space-y-1 pl-4">
          <li><b>Old people:</b> {fmtN(env.kept)} of {fmtN(env.accounts)} accounts made before 3 Nov 2026. Left out: {ex || "none"} (staff are admin or ops; also @studojo.com, test accounts, guests, example addresses, and accounts also in Sensei, Bob or the B2B partner tables).</li>
          <li><b>Old money:</b> payment_orders paid or completed, above zero, less refunds; {env.money.testPrice} payments at the test prices (₹90, $1) and {env.money.team} by team accounts left out. Plus the Assignment dojo{o.assignment ? `: ${o.assignment.payments} real payment${o.assignment.payments === 1 ? "" : "s"} (${inr(o.assignment.paise)}); ${o.assignment.team} team test payments left out` : ""}.</li>
          <li><b>Stu:</b> the Stu pages' own numbers and exclusions (staff, @studojo.com, test accounts, guests and anyone sharing a browser with them).</li>
          <li><b>Old outreach:</b> emails_sent with is_test false, by the sender's account; replies are leads that replied; reached is leads sent a first (not follow-up) email.</li>
          <li><b>Other old tools</b> (not in the numbers above unless said):{" "}
            {o.resumeBuilder ? `resume builder ${fmtN(o.resumeBuilder.sessions)} sessions by ${fmtN(o.resumeBuilder.people)} people; ` : ""}
            {o.internshipApps ? `internship applications ${fmtN(o.internshipApps.n)} by ${fmtN(o.internshipApps.people)} people; ` : ""}
            {o.resumes ? `saved resumes ${fmtN(o.resumes.n)} by ${fmtN(o.resumes.people)} people; ` : ""}
            {o.dissertations ? `dissertations ${o.dissertations.n} paid, ${inr(o.dissertations.paise)}, ${o.dissertations.from ? dayText(o.dissertations.from) + " " + o.dissertations.from.slice(0, 4) : ""} to ${o.dissertations.to ? dayText(o.dissertations.to) + " " + o.dissertations.to.slice(0, 4) : ""} (a done-for-you service sold mostly before accounts existed, so left out of revenue); ` : ""}
            career coach (its own database, no payments; not read).
          </li>
          <li><b>Sources:</b> old from public (user, outreach_orders, candidates, payment_orders, cp.payments, emails_sent, campaigns, session, user_attribution) and PostHog; Stu from the Stu dataset (career_agent) plus career_emails, career_sequences and career_credit_orders for reach, positive replies, bounces and refunds.</li>
          <li>Read {env.env === "production" ? "production" : env.env}{env.newMissing.length ? `; not readable here: ${env.newMissing.join(", ")}` : ""}. Built in {(env.ms / 1000).toFixed(1)} s.</li>
        </ul>
      </div>
    </div>
  );
}
