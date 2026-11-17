// Reach (15 Nov 2026, the owner: "Add '% reached twice this week' to the admin panel, with the list of students who
// weren't"). Whether every student gets at least 2 messages a week, on WhatsApp or email (REACH-EMAIL, 17 Nov 2026, as
// the product counts since EMAIL-CH): the headline (all students, linked or not,
// onboarded or not), the last 14 days with the floor lane's start marked, the students at 0 and at 1 with what is
// stopping them, and Meta's limits. Same rule as the product's floor lane (REACH, live 15 Nov 2026 18:38 IST): a
// delivered business message in the last 7 days. Read only (/api/reach, app/lib/reach).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { AdminHeader, StatCard } from "~/components";
import { KIT_CSS, PALETTE, Seg, crosshair, dayLabel, istTime } from "~/components/stu/overview-kit";
import { CARD } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { fmtN } from "~/lib/stu/model";
import { fetchReach } from "~/lib/reach/client";
import {
  type MetaDayIn, type Ratio, type ReachEnvelope, type ReachPerson, type ReachReport, type ReasonKey, type TrendDay,
  REACH_DAYS, REASONS, REASON_LABEL, istDay, istText,
} from "~/lib/reach/model";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip);

export function meta() {
  return [{ title: "Reach · Stu · Studojo Admin" }];
}

const REFRESH_MS = 60_000;
const LANE_COLORS = { other: "#a3a3a3", floor: "#8b5cf6", catchup: "#f59e0b", email: "#10b981" };
const LINE_COLOR = "#8b5cf6";
type Tab = "zero" | "one" | "notLinked";
const PAGE_ROWS = 50;

const pctText = (r: Ratio) => (r.pct == null ? "n/a" : `${r.pct}%`);
const ofText = (r: Ratio, what = "students") => `${fmtN(r.n)} of ${fmtN(r.of)} ${what}`;

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

/**
 * The floor lane's start, a dashed line at its time. Bars (deliveries during a day): within the day's slot. The line (each
 * point the state at its day's end, ends: true): between the day before's point and the day's.
 */
const floorMark = {
  id: "reachFloor",
  afterDatasetsDraw(chart: any) {
    const o = chart.options.plugins?.reachFloor;
    if (!o || o.index < 0) return;
    const x = chart.scales.x;
    const n = chart.data.labels?.length ?? 1;
    const { top, bottom, left, right } = chart.chartArea;
    const step = n > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : right - left;
    const px = o.ends ? x.getPixelForValue(o.index - 1) + step * o.frac : x.getPixelForValue(o.index) - step / 2 + step * o.frac;
    if (px < left || px > right) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 3]);
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 11px Satoshi, ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = PALETTE.ink;
    const flip = px > right - 70;
    ctx.textAlign = flip ? "right" : "left";
    ctx.fillText("Floor on", flip ? px - 4 : px + 4, top + 10);
    ctx.restore();
  },
};

// ------------------------------------------------------------------ the page

export default function Reach() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const internal = params.get("internal") === "1";
  const [env, setEnv] = useState<ReachEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("zero");

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    try {
      setEnv(await fetchReach({ internal, fresh }));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [internal]);

  useEffect(() => {
    if (!isAuthorized) return;
    load(false);
    const id = window.setInterval(() => load(false), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const r = env?.report;
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const local = host === "localhost" || host === "127.0.0.1";
  const envName = env ? (env.env === "staging" ? "Staging" : env.env === "production" ? "Production" : "Unknown") : "";
  const openList = (t: Tab) => {
    setTab(t);
    document.getElementById("lists")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · <Link to="/" className="hover:underline">Overview</Link></div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Reach</h1>
            <p className="mt-1 flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>Did every student get at least 2 messages from us, on WhatsApp or email, in the last {REACH_DAYS} days?</span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${env?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>
                  {local ? `Local, ${envName.toLowerCase()} data` : envName}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="accent-purple-500" checked={internal}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.checked) next.set("internal", "1");
                  else next.delete("internal");
                  setParams(next, { replace: true });
                }} />
              Include internal
            </label>
            <button type="button" onClick={() => load(true)} disabled={loading} className="font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:decoration-purple-500 disabled:opacity-50">
              {loading ? "Reading" : "Refresh"}
            </button>
            <span title="The page re-reads every 60 s; the server keeps a copy for up to 3 minutes">{env ? `Updated ${istTime(Date.parse(env.generatedAt))} IST` : "Reading"}</span>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">Could not read reach: {error}</div>}
        {env?.missing && <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">This database has no WhatsApp or send ledger tables ({env.env}): nothing to count.</div>}
        {!env && !error && <div className="mt-6 h-40 animate-pulse rounded-2xl border-2 border-neutral-900 bg-white" />}

        {r && (
          <div className="fade mt-6 flex flex-col gap-6" style={{ opacity: loading ? 0.6 : 1 }}>
            <Headline r={r} open={openList} />
            <Panel id="trend" title="Last 14 days" sub={<>Each day: the share of linked students with 2 or more deliveries, WhatsApp or email, in the {REACH_DAYS} days to that day's end (today: to now), and the messages delivered that day by lane. The dashed line is the floor lane going live, {istText(r.floorStart)} IST.</>}>
              <Trend r={r} />
            </Panel>
            <Panel id="lists" title="Who was not reached twice" sub="Students at 0 or 1 delivered in the last 7 days. What is stopping them is read from our latest try to them in 7 days, else their picks.">
              <Lists r={r} tab={tab} setTab={setTab} />
            </Panel>
            <Panel id="meta" title="Meta's limits" sub="Every account, as Meta counts them (internal ones too). Days are IST.">
              <MetaLimits r={r} />
            </Panel>
            <Panel id="how" title="How this is counted">
              <HowCounted internal={internal} />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ headline

function Headline({ r, open }: { r: ReachReport; open: (t: Tab) => void }) {
  const h = r.headline;
  const tiles: { label: string; ratio: Ratio; note: string }[] = [
    { label: "WhatsApp linked", ratio: h.linked, note: ofText(h.linked) },
    { label: "Not linked", ratio: h.notLinked, note: `${ofText(h.notLinked)}: email only` },
    { label: "Onboarded", ratio: h.onboarded, note: ofText(h.onboarded) },
    { label: "Not onboarded", ratio: h.notOnboarded, note: ofText(h.notOnboarded) },
  ];
  const c = r.counts;
  const btn = "num font-bold text-neutral-950";
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-1">
          <StatCard value={pctText(h.all)} label="Reached twice this week" color="purple" note={`${ofText(h.all)}, WhatsApp or email, in the last ${REACH_DAYS} days`} />
        </div>
        {tiles.map((t) => (
          <div key={t.label} className={`${CARD} min-w-0 p-4 md:p-5`}>
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">{t.label}</div>
            <div className="tnum mt-1 font-['Clash_Display'] text-3xl font-semibold text-neutral-950 md:text-4xl">{pctText(t.ratio)}</div>
            <div className="mt-1 text-xs text-neutral-600">{t.note}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-xl border-2 border-neutral-900 bg-white px-4 py-2.5 text-sm shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-500">Delivered in 7 days</span>
        <span className="text-neutral-700">
          <span className="whitespace-nowrap">At 0 <button type="button" className={btn} onClick={() => open("zero")}>{fmtN(c.zero)}</button> linked</span>{" "}
          <span className="whitespace-nowrap">+ <button type="button" className={btn} onClick={() => open("notLinked")}>{fmtN(c.notLinked)}</button> not linked, under 2</span>
        </span>
        <span className="whitespace-nowrap text-neutral-700">At 1 <button type="button" className={btn} onClick={() => open("one")}>{fmtN(c.one)}</button></span>
        <span className="whitespace-nowrap text-neutral-700">At 2 or more <b className="tnum text-neutral-950">{fmtN(c.twoPlus)}</b></span>
        <span className="whitespace-nowrap text-neutral-500">{fmtN(c.students)} students in all</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ trend

function Trend({ r }: { r: ReachReport }) {
  const t = PALETTE;
  const days = r.trend;
  const labels = days.map((d) => dayLabel(d.day) + (d.soFar ? " (so far)" : ""));
  const floorDay = istDay(r.floorStart);
  const index = days.findIndex((d) => d.day === floorDay);
  const startMin = Math.round((r.floorStart - Date.parse(`${floorDay}T00:00:00+05:30`)) / 60_000);
  const mark = { index, frac: startMin / 1440 };
  const tooltip = {
    backgroundColor: "#fff", borderColor: t.ink, borderWidth: 2, titleColor: t.ink, bodyColor: t.ink, footerColor: t.ink2, padding: 10, boxWidth: 10, boxHeight: 10,
  };
  const axisX = { grid: { display: false }, border: { color: t.ink, width: 2 }, ticks: { color: t.muted, maxTicksLimit: 7, maxRotation: 0, font: { size: 11 } } };

  const pctData = {
    labels,
    datasets: [{
      type: "line" as const, label: "Reached twice", data: days.map((d) => d.pct), borderColor: LINE_COLOR, backgroundColor: LINE_COLOR,
      borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: "#fff", spanGaps: true,
    }],
  };
  const pctOptions: any = {
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false }, ovCrosshair: { color: t.axis }, reachFloor: { ...mark, ends: true },
      tooltip: {
        ...tooltip,
        callbacks: {
          label: (c: any) => {
            const d: TrendDay = days[c.dataIndex];
            return ` ${d.pct == null ? "n/a" : `${d.pct}%`} reached twice: ${fmtN(d.reached)} of ${fmtN(d.linked)} linked`;
          },
        },
      },
    },
    scales: {
      x: { ...axisX, offset: true },
      y: { min: 0, max: 100, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, stepSize: 25, font: { size: 11 }, callback: (v: any) => `${v}%` } },
    },
  };

  const lanes: { key: "other" | "floor" | "catchup" | "email"; label: string }[] = [
    { key: "other", label: "Other business messages" }, { key: "floor", label: "Floor" }, { key: "catchup", label: "Catch-up" }, { key: "email", label: "Email" },
  ];
  const barData = {
    labels,
    datasets: lanes.map((l) => ({
      type: "bar" as const, label: l.label, data: days.map((d) => d[l.key]), backgroundColor: LANE_COLORS[l.key],
      borderColor: "#fff", borderWidth: { top: 2 }, borderSkipped: false, maxBarThickness: 28, stack: "d",
    })),
  };
  const barOptions: any = {
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false }, ovCrosshair: { color: t.axis }, reachFloor: mark,
      tooltip: {
        ...tooltip,
        callbacks: {
          label: (c: any) => ` ${fmtN(c.parsed.y)}  ${c.dataset.label}`,
          footer: (items: any[]) => {
            const d = days[items[0]?.dataIndex];
            return d ? `${fmtN(d.floor + d.catchup + d.other + d.email)} delivered` : "";
          },
        },
      },
    },
    scales: {
      x: { ...axisX, stacked: true },
      y: { stacked: true, beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 } } },
    },
  };

  const last = days[days.length - 1];
  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-neutral-900">Linked students reached twice</h3>
            {last && <span className="tnum text-xs text-neutral-500">now {last.pct == null ? "n/a" : `${last.pct}%`} ({fmtN(last.reached)} of {fmtN(last.linked)})</span>}
          </div>
          <div className="h-56 md:h-64"><Chart type="line" data={pctData as any} options={pctOptions} plugins={[crosshair, floorMark]} /></div>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-neutral-900">Delivered a day, by lane</h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-700">
              {[...lanes].reverse().map((l) => (
                <span key={l.key} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: LANE_COLORS[l.key] }} />{l.label}</span>
              ))}
            </div>
          </div>
          <div className="h-56 md:h-64"><Chart type="bar" data={barData as any} options={barOptions} plugins={[crosshair, floorMark]} /></div>
        </div>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-purple-700 underline underline-offset-2">Day by day numbers</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tnum w-full min-w-[560px] text-sm">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-2 pb-1.5">Day (IST)</th>
                <th className="px-2 pb-1.5 text-right">Linked</th>
                <th className="px-2 pb-1.5 text-right">Reached twice</th>
                <th className="px-2 pb-1.5 text-right">%</th>
                <th className="px-2 pb-1.5 text-right">Floor</th>
                <th className="px-2 pb-1.5 text-right">Catch-up</th>
                <th className="px-2 pb-1.5 text-right">Other</th>
                <th className="px-2 pb-1.5 text-right">Email</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="row-hover border-t-2 border-neutral-100">
                  <td className="whitespace-nowrap px-2 py-1">{dayLabel(d.day)}{d.soFar ? <span className="text-neutral-500"> so far</span> : ""}{d.day === istDay(r.floorStart) ? <span className="ml-1 text-xs font-semibold text-purple-700">floor on</span> : ""}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.linked)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.reached)}</td>
                  <td className="px-2 py-1 text-right font-semibold">{d.pct == null ? "n/a" : `${d.pct}%`}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.floor)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.catchup)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.other)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.email)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ lists

const REASON_TONE: Record<ReasonKey, string> = {
  cap: "border-red-500 bg-red-50 text-red-700",
  spam: "border-red-500 bg-red-50 text-red-700",
  undelivered: "border-amber-500 bg-amber-50 text-amber-800",
  pending: "border-neutral-300 bg-white text-neutral-600",
  no_picks: "border-amber-500 bg-amber-50 text-amber-800",
  not_tried: "border-purple-400 bg-purple-50 text-purple-800",
  stop: "border-neutral-400 bg-neutral-100 text-neutral-700",
  not_linked: "border-neutral-400 bg-neutral-100 text-neutral-700",
};

function Lists({ r, tab, setTab }: { r: ReachReport; tab: Tab; setTab: (t: Tab) => void }) {
  const [reason, setReason] = useState<ReasonKey | "all">("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    setReason("all");
    setAll(false);
  }, [tab]);

  const list = r.lists[tab];
  const counts = REASONS.map((x) => ({ ...x, n: list.filter((p) => p.reason === x.key).length })).filter((x) => x.n > 0);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => list.filter((p) => (reason === "all" || p.reason === reason) && (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))),
    [list, reason, q],
  );
  const rows = all ? shown : shown.slice(0, PAGE_ROWS);
  const tabs: { v: Tab; l: string }[] = [
    { v: "zero", l: `At 0, linked (${fmtN(r.lists.zero.length)})` },
    { v: "one", l: `At 1 (${fmtN(r.lists.one.length)})` },
    { v: "notLinked", l: `Not linked (${fmtN(r.lists.notLinked.length)})` },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Seg label="Which students" value={tab} onChange={setTab} options={tabs} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" aria-label="Find a student"
          className="w-full max-w-[240px] rounded-lg border-2 border-neutral-300 px-2.5 py-1 text-sm focus:border-purple-500 focus:outline-none" />
      </div>
      {counts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="What is stopping them">
          <button type="button" aria-pressed={reason === "all"} onClick={() => setReason("all")}
            className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold ${reason === "all" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700"}`}>
            All {fmtN(list.length)}
          </button>
          {counts.map((x) => (
            <button key={x.key} type="button" aria-pressed={reason === x.key} onClick={() => setReason(reason === x.key ? "all" : x.key)} title={x.note}
              className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold ${reason === x.key ? "border-neutral-900 bg-neutral-900 text-white" : REASON_TONE[x.key]}`}>
              {x.label} {fmtN(x.n)}
            </button>
          ))}
        </div>
      )}
      {!list.length ? (
        <p className="mt-4 text-sm text-neutral-500">Nobody here.</p>
      ) : (
        <>
        <ul className="mt-3 flex flex-col gap-2 md:hidden">
          {rows.map((p) => <PersonCard key={p.id} p={p} />)}
        </ul>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-2 pb-1.5">Student</th>
                <th className="px-2 pb-1.5">Linked</th>
                <th className="px-2 pb-1.5">In window now</th>
                <th className="px-2 pb-1.5">Last delivered</th>
                <th className="px-2 pb-1.5">Last thing they sent us</th>
                <th className="px-2 pb-1.5">Onboarded</th>
                <th className="px-2 pb-1.5">What is stopping them</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <PersonRow key={p.id} p={p} />)}
            </tbody>
          </table>
        </div>
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span>{fmtN(rows.length)} of {fmtN(shown.length)} shown</span>
        {shown.length > rows.length && (
          <button type="button" onClick={() => setAll(true)} className="font-semibold text-purple-700 underline underline-offset-2">Show all {fmtN(shown.length)}</button>
        )}
      </div>
    </div>
  );
}

/** A student on a phone: who, what is stopping them, then the facts. */
function PersonCard({ p }: { p: ReachPerson }) {
  const fact = (k: string, v: React.ReactNode) => (
    <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{k}</dt><dd className="text-xs text-neutral-800">{v}</dd></div>
  );
  return (
    <li className="rounded-xl border-2 border-neutral-200 p-3">
      <Link to={`/journeys?u=${encodeURIComponent(p.id)}`} className="block truncate font-semibold text-neutral-950 hover:text-purple-700">{p.name || p.email || p.id.slice(0, 10)}</Link>
      <div className="truncate text-xs text-neutral-500">{p.email}{p.internal ? ` · internal: ${p.internal}` : ""}</div>
      <div className="mt-2">
        <span className={`inline-block rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${REASON_TONE[p.reason]}`}>{REASON_LABEL[p.reason]}</span>
        {p.detail && <div className="mt-0.5 break-words text-[11px] leading-snug text-neutral-500">{p.detail}</div>}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {fact("Linked", p.linked != null ? istText(p.linked) : "not linked")}
        {fact("In window now", p.linked == null ? "none" : p.inWindow ? "yes" : "no")}
        {fact("Last delivered", p.lastDelivered != null ? istText(p.lastDelivered) : "never")}
        {fact("Onboarded", p.onboarded ? "yes" : "no")}
      </dl>
      {p.lastIn && (
        <div className="mt-1.5 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Last thing they sent us · {istText(p.lastIn.at)}</div>
          <div className="line-clamp-2 break-words text-xs text-neutral-800">{p.lastIn.text}</div>
        </div>
      )}
    </li>
  );
}

function PersonRow({ p }: { p: ReachPerson }) {
  const muted = <span className="text-neutral-400">none</span>;
  return (
    <tr className="row-hover border-t-2 border-neutral-100 align-top">
      <td className="max-w-[240px] px-2 py-1.5">
        <Link to={`/journeys?u=${encodeURIComponent(p.id)}`} className="block truncate font-semibold text-neutral-950 hover:text-purple-700 hover:underline" title="Open their journey">
          {p.name || p.email || p.id.slice(0, 10)}
        </Link>
        <div className="truncate text-xs text-neutral-500" title={p.email}>{p.email}{p.internal ? ` · internal: ${p.internal}` : ""}</div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-neutral-700">{p.linked != null ? istText(p.linked) : <span className="text-neutral-400">not linked</span>}</td>
      <td className="px-2 py-1.5">{p.linked == null ? muted : p.inWindow ? <span className="font-semibold text-emerald-700">yes</span> : <span className="text-neutral-600">no</span>}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-neutral-700">{p.lastDelivered != null ? istText(p.lastDelivered) : <span className="text-neutral-400">never</span>}</td>
      <td className="max-w-[240px] px-2 py-1.5">
        {p.lastIn ? (
          <>
            <div className="line-clamp-2 whitespace-normal break-words text-neutral-800" title={p.lastIn.text}>{p.lastIn.text}</div>
            <div className="text-[11px] text-neutral-500">{istText(p.lastIn.at)}</div>
          </>
        ) : muted}
      </td>
      <td className="px-2 py-1.5">{p.onboarded ? <span className="text-neutral-800">yes</span> : <span className="text-neutral-500">no</span>}</td>
      <td className="max-w-[280px] px-2 py-1.5">
        <span className={`inline-block whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${REASON_TONE[p.reason]}`}>{REASON_LABEL[p.reason]}</span>
        {p.detail && <div className="mt-0.5 whitespace-normal text-[11px] leading-snug text-neutral-500">{p.detail}</div>}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ Meta

function MetaLimits({ r }: { r: ReachReport }) {
  const m = r.meta;
  const share = m.limit > 0 ? m.students24h / m.limit : 0;
  const left = Math.max(0, m.limit - m.students24h);
  const tone = share >= 1 ? { bar: "#dc2626", text: "At the limit", cls: "text-red-700" } : share >= 0.85 ? { bar: "#f59e0b", text: "Near the limit", cls: "text-amber-800" } : { bar: "#8b5cf6", text: "", cls: "text-neutral-700" };
  const total = (k: "spam" | "cap") => m.days.reduce((a, d) => a + d[k], 0);
  const days: MetaDayIn[] = [...m.days].reverse();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Students we started a conversation with, last 24 h</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="tnum font-['Clash_Display'] text-4xl font-semibold text-neutral-950">{fmtN(m.students24h)}</span>
          <span className="text-sm text-neutral-600">of {fmtN(m.limit)} a day (TIER_250)</span>
        </div>
        <div className="mt-2 h-3 w-full max-w-sm overflow-hidden rounded-full border-2 border-neutral-900 bg-neutral-100" role="meter" aria-valuemin={0} aria-valuemax={m.limit} aria-valuenow={m.students24h} aria-label="Students started in 24 hours against the limit">
          <div className="h-full" style={{ width: `${Math.min(100, Math.round(share * 100))}%`, background: tone.bar }} />
        </div>
        <div className={`mt-1 text-xs font-semibold ${tone.cls}`}>{tone.text ? `${tone.text}: ` : ""}{Math.round(share * 100)}% used, {fmtN(left)} left</div>
        <p className="mt-3 max-w-md whitespace-normal text-xs leading-snug text-neutral-500">
          A template that went (not failed, not a dry run) or a phone code, each student once, the product's own count. Replies inside WhatsApp's 24 hour window are not counted.
        </p>
        <p className="tnum mt-3 text-sm text-neutral-700">
          14 days: <b className="text-neutral-950">{fmtN(total("spam"))}</b> refused with 131048, <b className="text-neutral-950">{fmtN(total("cap"))}</b> with 131049.
        </p>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="tnum w-full min-w-[420px] text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-2 pb-1.5">Day (IST)</th>
              <th className="px-2 pb-1.5 text-right">Students started</th>
              <th className="px-2 pb-1.5 text-right" title="Meta's spam rate limit">131048 spam limit</th>
              <th className="px-2 pb-1.5 text-right" title="Meta's per-person marketing cap">131049 cap</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="row-hover border-t-2 border-neutral-100">
                <td className="whitespace-nowrap px-2 py-1">{dayLabel(d.day)}</td>
                <td className="px-2 py-1 text-right">{fmtN(d.students)}</td>
                <td className={`px-2 py-1 text-right ${d.spam ? "font-bold text-red-700" : "text-neutral-400"}`}>{fmtN(d.spam)}</td>
                <td className={`px-2 py-1 text-right ${d.cap ? "font-bold text-red-700" : "text-neutral-400"}`}>{fmtN(d.cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ notes

function HowCounted({ internal }: { internal: boolean }) {
  return (
    <ul className="max-w-3xl list-disc space-y-1.5 whitespace-normal pl-5 text-xs leading-snug text-neutral-600">
      <li>Reached: a business message delivered in the last 7 days to now, on WhatsApp (Meta's receipt) or by email (the provider took it and reported it delivered). Replies in a chat, Stu's answers to a student's own email and dry runs do not count. The same rule as the product's floor lane, which counts email since 16 Nov.</li>
      <li>Reached twice: 2 or more of those, on either channel. A student with no WhatsApp link is reached by email alone.</li>
      <li>Students: everyone the Stu pages count, onboarded or not, plus anyone with a WhatsApp link.{" "}
        {internal ? "Internal accounts included." : "Excluded: staff, @studojo.com, the test accounts, guests, and accounts sharing a browser with one."}</li>
      <li>Floor: the product's daily top-up for students under 2 (from 15 Nov 18:38 IST). Catch-up: morning picks sent again after Meta's spam pause.</li>
      <li>What is stopping them: our latest try in 7 days (failed 131049 or 131048, failed otherwise, or no receipt), else whether they had picks in 7 days.</li>
    </ul>
  );
}
