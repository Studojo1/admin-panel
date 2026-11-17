// Email (17 Nov 2026, the owner: "add open rate tracking etc, check and lmk go deep and see what a funnel needs to be").
// How Stu's emails to students perform, from due to paid: the health strip with its limits, the funnel with why a due
// email was not sent, each kind, the last 14 days, the route and sender, inbox placement from the seed inboxes, email
// against WhatsApp, the last 50 sends (addresses masked, never a body) and how to read it all. Students only unless the
// team is asked for. Read only (/api/email-funnel, app/lib/email-funnel).
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { AdminHeader } from "~/components";
import { KIT_CSS, PALETTE, Seg, crosshair, dayLabel, istTime } from "~/components/stu/overview-kit";
import { CARD } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { fmtN } from "~/lib/stu/model";
import { fetchEmailFunnel } from "~/lib/email-funnel/client";
import {
  type EmailEnvelope, type EmailReport, type FunnelStep, type HealthState, type HealthTile, type RangeDays, type Ratio, type RateRow,
  type RecentRow, type Side, type StatusKey,
  INDUSTRY, KINDS, KIND_LABEL, PLACEMENT_LABEL, ROUTE_LABEL, STATUS_LABEL, istText, parseDays,
} from "~/lib/email-funnel/model";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip);

export function meta() {
  return [{ title: "Email · Stu · Studojo Admin" }];
}

const REFRESH_MS = 60_000;
const RANGE_OPTIONS: { v: string; l: string }[] = [{ v: "1", l: "Today" }, { v: "7", l: "7 days" }, { v: "30", l: "30 days" }];
const SERIES = { sent: "#a3a3a3", delivered: "#8b5cf6", opened: "#f59e0b", clicked: "#10b981" };
const STEP_COLOR: Record<FunnelStep["key"], string> = {
  due: "#ddd6fe", sent: "#c4b5fd", delivered: "#a78bfa", opened: "#8b5cf6", clicked: "#7c3aed", acted: "#6d28d9", paid: "#10b981",
};
const KIND_CODE = Object.fromEntries(KINDS.map((k) => [k.key, k.code])) as Record<string, string>;

const pctText = (r: Ratio | null | undefined) => (r?.pct == null ? "n/a" : `${r.pct}%`);
const ofText = (r: Ratio) => `${fmtN(r.n)} of ${fmtN(r.of)}`;

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

const TH = "px-2 pb-1.5";
const THR = "px-2 pb-1.5 text-right";

/** A rate in a table cell: the %, with the counts on hover. */
function Pct({ r, strong }: { r: Ratio; strong?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-2 py-1.5 text-right ${r.pct == null ? "text-neutral-400" : strong ? "font-semibold text-neutral-950" : "text-neutral-800"}`} title={ofText(r)}>
      {pctText(r)}
    </td>
  );
}

// ------------------------------------------------------------------ the page

export default function EmailFunnel() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const days = parseDays(params.get("days"));
  const team = params.get("team") === "1";
  const [env, setEnv] = useState<EmailEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    try {
      setEnv(await fetchEmailFunnel({ days, team, fresh }));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days, team]);

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
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · <Link to="/" className="hover:underline">Overview</Link></div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Email</h1>
            <p className="mt-1 flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>How Stu's emails to students do, from due to paid. Days are India time.</span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${env?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>
                  {local ? `Local, ${envName.toLowerCase()} data` : envName}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-500">
            <Seg label="Range" value={String(days)} onChange={(v) => setParam("days", v === "7" ? null : v)} options={RANGE_OPTIONS} />
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="accent-purple-500" checked={team} onChange={(e) => setParam("team", e.target.checked ? "1" : null)} />
              Include the team
            </label>
            <button type="button" onClick={() => load(true)} disabled={loading} className="font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:decoration-purple-500 disabled:opacity-50">
              {loading ? "Reading" : "Refresh"}
            </button>
            <span title="The page re-reads every 60 s; the server keeps a copy for up to 3 minutes">{env ? `Updated ${istTime(Date.parse(env.generatedAt))} IST` : "Reading"}</span>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">Could not read the emails: {error}</div>}
        {env?.missing && <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">This database has no send ledger ({env.env}): nothing to count.</div>}
        {env && !env.missing && env.waiting.length > 0 && <Waiting waiting={env.waiting} />}
        {!env && !error && <div className="mt-6 h-40 animate-pulse rounded-2xl border-2 border-neutral-900 bg-white" />}

        {r && !env?.missing && (
          <div className="fade mt-6 flex flex-col gap-6" style={{ opacity: loading ? 0.6 : 1 }}>
            <Health r={r} />
            <Panel id="funnel" title="The funnel" sub={<>Every email Stu sent {rangeWords(r.days)}{r.team ? ", the team included" : ", students only"}. Each bar is a share of the first step; the line under it says what it keeps of the step it follows.</>}>
              <Funnel r={r} />
            </Panel>
            <Panel id="kinds" title="By email kind" sub="Rates are of delivered emails, except delivered and bounced (of sent) and click to open (of opened). Hover a rate for its counts.">
              <RateTable rows={r.kinds} first="Kind" kinds showSkips={r.live.skips} />
            </Panel>
            <Panel id="trend" title="Last 14 days" sub="Emails sent each India day, and how many of them were delivered, opened and clicked so far, whatever the range above.">
              <Trend r={r} />
            </Panel>
            <Panel id="routes" title="By route and sender" sub="Azure sends from hello.studojo.com; Google Workspace from stu@studojo.com. The sender is the event log's where it has one.">
              <RateTable rows={r.routes} first="Route" />
            </Panel>
            <Panel id="placement" title="Inbox placement" sub="Seed inboxes we own get the same email; a check reads which tab it landed in.">
              <Placement r={r} />
            </Panel>
            <Panel id="whatsapp" title="Email against WhatsApp" sub={`Students only, ${rangeWords(r.days)}. Business messages on both: delivered, then read or opened, then tapped.`}>
              <VsWhatsapp r={r} />
            </Panel>
            <Panel id="recent" title="Recent emails" sub={`The last ${r.recent.length} tries, newest first${r.team ? ", the team included" : ", students only"}. Addresses are masked; no email's words are kept here.`}>
              <Recent rows={r.recent} />
            </Panel>
            <Panel id="how" title="How to read this">
              <HowToRead r={r} />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

const rangeWords = (d: RangeDays) => (d === 1 ? "today" : `in the last ${d} days`);

function Waiting({ waiting }: { waiting: string[] }) {
  const parts: string[] = [];
  if (waiting.includes("career_email_events")) parts.push("opens, clicks and replies come from the ledger's first stamps and the student's own emails, so Apple's machine opens cannot be told apart");
  if (waiting.includes("career_email_skips")) parts.push("Due and the reasons a due email was not sent wait for the skips");
  if (waiting.includes("career_email_placements")) parts.push("inbox placement waits for the seed inbox checks");
  return (
    <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
      <b>Ledger only for now.</b> Not live here yet: {waiting.join(", ")}. Until then {parts.join("; ")}.
    </div>
  );
}

// ------------------------------------------------------------------ health

const TONE: Record<HealthState, { edge: string; chip: string; word: string }> = {
  good: { edge: "border-t-emerald-500", chip: "border-emerald-600 bg-emerald-50 text-emerald-700", word: "OK" },
  warn: { edge: "border-t-amber-500", chip: "border-amber-500 bg-amber-50 text-amber-800", word: "Watch" },
  bad: { edge: "border-t-red-500", chip: "border-red-500 bg-red-50 text-red-700", word: "Bad" },
  none: { edge: "border-t-purple-400", chip: "", word: "" },
  empty: { edge: "border-t-neutral-300", chip: "", word: "" },
};

/** Two rows: will the emails arrive (each against its limit), then do people engage (against the typical range). */
const HEALTH_ROWS: { title: string; keys: HealthTile["key"][]; cols: string }[] = [
  { title: "Deliverability", keys: ["delivered", "bounce", "unsub", "complaint", "primary"], cols: "lg:grid-cols-5" },
  { title: "Engagement", keys: ["open", "click", "cto", "reply"], cols: "lg:grid-cols-4" },
];

function Health({ r }: { r: EmailReport }) {
  return (
    <div className="flex flex-col gap-4">
      {HEALTH_ROWS.map((row) => (
        <div key={row.title}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">{row.title}</div>
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 ${row.cols}`}>
            {row.keys.map((k) => r.health.find((t) => t.key === k)).filter((t): t is HealthTile => Boolean(t)).map((t) => <HealthCard key={t.key} t={t} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthCard({ t }: { t: HealthTile }) {
  const tone = TONE[t.state];
  return (
    <div className={`${CARD} min-w-0 border-t-[6px] p-3 md:p-4 ${tone.edge}`}>
      <div className="text-[11px] font-bold uppercase leading-tight tracking-wide text-neutral-500">{t.label}</div>
      {t.empty ? (
        <div className="mt-1.5 text-sm font-semibold leading-snug text-neutral-500">{t.empty}</div>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            <span className="tnum font-['Clash_Display'] text-2xl font-semibold text-neutral-950 md:text-3xl">{pctText(t.ratio)}</span>
            {tone.word && <span className={`rounded-full border-2 px-1.5 text-[10px] font-bold ${tone.chip}`}>{tone.word}</span>}
          </div>
          <div className="tnum text-[11px] text-neutral-600">{ofText(t.ratio)}{t.small ? ", small sample" : ""}</div>
        </>
      )}
      <div className="mt-1 text-[11px] leading-snug text-neutral-500">{t.rule}</div>
    </div>
  );
}

// ------------------------------------------------------------------ funnel

function Funnel({ r }: { r: EmailReport }) {
  const f = r.funnel;
  const maxSkip = Math.max(1, ...f.skips.map((s) => s.n));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <ol className="flex flex-col gap-3">
          {f.steps.map((s) => <FunnelBar key={s.key} s={s} />)}
        </ol>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
          <span title="Opened, then paid within 7 days, whether or not they did the kind's goal first">Paid after opening, acted or not: <b className="tnum text-neutral-950">{fmtN(f.paidAny)}</b></span>
          {f.actOpen > 0 && <span>Still inside the 48 h to act: <b className="tnum text-neutral-950">{fmtN(f.actOpen)}</b></span>}
          {f.payOpen > 0 && <span>Still inside the 7 days to pay: <b className="tnum text-neutral-950">{fmtN(f.payOpen)}</b></span>}
          {r.live.events && <span title="Apple Mail Privacy loads every image when the mail arrives">Opened only by Apple's machine: <b className="tnum text-neutral-950">{fmtN(f.machineOnly)}</b>, left out</span>}
          {r.leftOut > 0 && <span>Team and internal emails left out: <b className="tnum text-neutral-950">{fmtN(r.leftOut)}</b></span>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Why a due email was not sent</h3>
          {!r.live.skips && <p className="mt-1 text-xs text-neutral-500">The skips table is not live here yet, so only the sends the provider refused show.</p>}
          {f.skips.length ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {f.skips.map((s) => (
                <li key={s.key} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2"><span className="text-neutral-800">{s.label}</span><b className="tnum text-neutral-950">{fmtN(s.n)}</b></div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round((s.n / maxSkip) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">{r.live.skips ? "Every due email went." : "No refused sends."}</p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">How the opens were seen</h3>
          {r.opens.by.length ? (
            <ul className="mt-1.5 flex flex-col gap-1 text-xs">
              {r.opens.by.map((o) => (
                <li key={o.key} className="flex items-baseline justify-between gap-2">
                  <span className={o.key === "apple_mpp" ? "text-neutral-500" : "text-neutral-800"}>{o.label}{o.key === "apple_mpp" ? ", not counted" : ""}</span>
                  <b className="tnum text-neutral-950">{fmtN(o.n)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-xs text-neutral-500">No opens yet.</p>}
          <p className="mt-1 text-[11px] text-neutral-500">Every load of the open pixel, so one email can count more than once here.</p>
        </div>
        {r.inbound.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">What came back to stu@studojo.com</h3>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs">
              {r.inbound.map((o) => (
                <li key={o.key} className="flex items-baseline justify-between gap-2"><span className="text-neutral-800">{o.label}</span><b className="tnum text-neutral-950">{fmtN(o.n)}</b></li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-neutral-500">Every message Stu's inbox read in the range, from anyone.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const STEP_BASE: Record<string, string> = { due: "due", sent: "sent", delivered: "delivered", opened: "opened", acted: "acted" };

function FunnelBar({ s }: { s: FunnelStep }) {
  const width = s.ofTop == null ? 0 : Math.max(s.n ? 1 : 0, Math.min(100, s.ofTop));
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-neutral-950">{s.label}</span>
        <span className="tnum text-xs text-neutral-600">
          {s.n == null ? (
            <span className="text-neutral-400">not known yet</span>
          ) : (
            <>
              <b className="text-sm text-neutral-950">{fmtN(s.n)}</b>
              {s.base && s.ofBase != null && <> · {s.ofBase}% of {STEP_BASE[s.base]}</>}
              {s.drop != null && s.drop > 0 && <span className="text-red-700"> · {fmtN(s.drop)} lost</span>}
            </>
          )}
        </span>
      </div>
      <div className="mt-1 h-5 overflow-hidden rounded-md border-2 border-neutral-900 bg-neutral-100" role="img" aria-label={`${s.label}: ${s.n ?? "not known"}`}>
        <div className="h-full" style={{ width: `${width}%`, background: STEP_COLOR[s.key] }} />
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{s.note}</div>
    </li>
  );
}

// ------------------------------------------------------------------ tables

function RateTable({ rows, first, kinds, showSkips }: { rows: RateRow[]; first: string; kinds?: boolean; showSkips?: boolean }) {
  if (!rows.length) return <p className="text-sm text-neutral-500">No emails in this range.</p>;
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="tnum w-full min-w-[920px] text-sm">
        <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className={TH}>{first}</th>
            <th className={THR}>Sent</th>
            {kinds && <th className={THR} title={showSkips ? "Due but skipped, or refused by the provider" : "Refused by the provider (skips not live yet)"}>Not sent</th>}
            <th className={THR} title="Of sent">Delivered</th>
            <th className={THR} title="Of delivered: a person opened it, or clicked or replied">Open</th>
            <th className={THR} title="Of delivered">Click</th>
            <th className={THR} title="Clicks of opens">Click to open</th>
            <th className={THR} title="Of delivered">Reply</th>
            <th className={THR} title="Of delivered: the kind's goal within 48 h of the open">Acted</th>
            <th className={THR} title="Of delivered">Unsub</th>
            <th className={THR} title="Of sent">Bounce</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.key} className="row-hover border-t-2 border-neutral-100 align-top">
              <td className="max-w-[260px] px-2 py-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-950">
                  {kinds && KIND_CODE[x.key] && <span className="rounded border border-neutral-300 px-1 text-[10px] font-bold text-neutral-500">{KIND_CODE[x.key]}</span>}
                  <span className="truncate">{x.label}</span>
                </div>
                <div className="truncate text-[11px] text-neutral-500">{kinds ? `Acted: ${x.sub}` : x.sub}</div>
              </td>
              <td className="px-2 py-1.5 text-right font-semibold">{fmtN(x.sent)}</td>
              {kinds && <td className={`px-2 py-1.5 text-right ${x.skipped + x.refused ? "text-neutral-800" : "text-neutral-400"}`}>{fmtN(x.skipped + x.refused)}</td>}
              <Pct r={x.delivered} />
              <Pct r={x.open} strong />
              <Pct r={x.click} strong />
              <Pct r={x.cto} />
              <Pct r={x.reply} />
              <Pct r={x.acted} strong />
              <Pct r={x.unsub} />
              <Pct r={x.bounce} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ trend

function Trend({ r }: { r: EmailReport }) {
  const t = PALETTE;
  const days = r.trend;
  const labels = days.map((d) => dayLabel(d.day) + (d.soFar ? " (so far)" : ""));
  const line = (key: "delivered" | "opened" | "clicked", label: string) => ({
    type: "line" as const, label, data: days.map((d) => d[key]), borderColor: SERIES[key], backgroundColor: SERIES[key],
    borderWidth: 2.5, pointRadius: 2.5, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: "#fff", order: 1,
  });
  const data = {
    labels,
    datasets: [
      { type: "bar" as const, label: "Sent", data: days.map((d) => d.sent), backgroundColor: SERIES.sent, maxBarThickness: 28, order: 2 },
      line("delivered", "Delivered"), line("opened", "Opened"), line("clicked", "Clicked"),
    ],
  };
  const options: any = {
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false }, ovCrosshair: { color: t.axis },
      tooltip: {
        backgroundColor: "#fff", borderColor: t.ink, borderWidth: 2, titleColor: t.ink, bodyColor: t.ink, footerColor: t.ink2, padding: 10, boxWidth: 10, boxHeight: 10,
        callbacks: { label: (c: any) => ` ${fmtN(c.parsed.y)}  ${c.dataset.label}` },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: t.ink, width: 2 }, ticks: { color: t.muted, maxTicksLimit: 7, maxRotation: 0, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 } } },
    },
  };
  const legend: { key: keyof typeof SERIES; label: string; line?: boolean }[] = [
    { key: "sent", label: "Sent" }, { key: "delivered", label: "Delivered", line: true }, { key: "opened", label: "Opened", line: true }, { key: "clicked", label: "Clicked", line: true },
  ];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className={`inline-block ${l.line ? "h-[3px] w-4 rounded" : "h-2.5 w-3 rounded-sm"}`} style={{ background: SERIES[l.key] }} />{l.label}
          </span>
        ))}
      </div>
      <div className="h-56 md:h-64"><Chart type="bar" data={data as any} options={options} plugins={[crosshair]} /></div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-purple-700 underline underline-offset-2">Day by day numbers</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tnum w-full min-w-[480px] text-sm">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              <tr><th className={TH}>Day (IST)</th><th className={THR}>Sent</th><th className={THR}>Delivered</th><th className={THR}>Opened</th><th className={THR}>Clicked</th></tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="row-hover border-t-2 border-neutral-100">
                  <td className="whitespace-nowrap px-2 py-1">{dayLabel(d.day)}{d.soFar ? <span className="text-neutral-500"> so far</span> : ""}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.sent)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.delivered)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.opened)}</td>
                  <td className="px-2 py-1 text-right">{fmtN(d.clicked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ placement

const PLACEMENT_COLOR: Record<string, string> = {
  primary: "#10b981", promotions: "#f59e0b", updates: "#8b5cf6", social: "#ec4899", forums: "#a78bfa", spam: "#dc2626", not_found: "#a3a3a3",
};

function Placement({ r }: { r: EmailReport }) {
  const p = r.placement;
  if (!r.live.placements || !p.any) {
    return (
      <p className="max-w-2xl text-sm text-neutral-500">
        No seed inboxes yet. {r.live.placements ? "No placement check has run." : "The placement table is not live here yet."} Once checks run, the latest result for
        each kind and seed shows here, with the share that landed in Primary, Promotions and Spam.
      </p>
    );
  }
  const shown = p.shares.filter((s) => s.ratio.n > 0);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Where checks landed, {rangeWords(r.days)}</div>
        {p.checks ? (
          <>
            <div className="mt-2 flex h-5 overflow-hidden rounded-md border-2 border-neutral-900" role="img" aria-label="Placement shares">
              {shown.map((s) => <div key={s.key} style={{ width: `${s.ratio.pct ?? 0}%`, background: PLACEMENT_COLOR[s.key] }} title={`${s.label} ${pctText(s.ratio)}`} />)}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {p.shares.filter((s) => s.key === "primary" || s.key === "promotions" || s.key === "spam" || s.ratio.n > 0).map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: PLACEMENT_COLOR[s.key] }} />{s.label}</span>
                  <b className="tnum text-neutral-950">{pctText(s.ratio)}</b>
                </li>
              ))}
            </ul>
            <p className="tnum mt-2 text-xs text-neutral-500">{fmtN(p.checks)} checks with a result.</p>
          </>
        ) : <p className="mt-1 text-sm text-neutral-500">No check with a result in this range.</p>}
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="tnum w-full min-w-[520px] text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr><th className={TH}>Kind</th><th className={TH}>Seed</th><th className={TH}>Route</th><th className={TH}>Landed</th><th className={TH}>Checked</th></tr>
          </thead>
          <tbody>
            {p.latest.map((x) => (
              <tr key={`${x.kind}|${x.seed}`} className="row-hover border-t-2 border-neutral-100">
                <td className="px-2 py-1.5">{KIND_LABEL[x.kind as keyof typeof KIND_LABEL] ?? x.kind}</td>
                <td className="px-2 py-1.5 text-neutral-700">{x.seed}</td>
                <td className="px-2 py-1.5 text-neutral-700">{x.via === "google" ? ROUTE_LABEL.google : ROUTE_LABEL.acs}</td>
                <td className="px-2 py-1.5">
                  {x.placement ? (
                    <span className="inline-block rounded-full border-2 px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: PLACEMENT_COLOR[x.placement] ?? "#a3a3a3", color: "#171717" }}>
                      {PLACEMENT_LABEL[x.placement as keyof typeof PLACEMENT_LABEL] ?? x.placement}
                    </span>
                  ) : <span className="text-neutral-400">{x.status || "waiting"}</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-neutral-600">{x.at != null ? istText(x.at) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ vs WhatsApp

function VsWhatsapp({ r }: { r: EmailReport }) {
  const v = r.vsWhatsapp;
  const rows: { label: string; note: string; pick: (s: Side) => Ratio }[] = [
    { label: "Delivered", note: "of sent", pick: (s) => s.delivered },
    { label: "Read or opened", note: "of delivered", pick: (s) => s.read },
    { label: "Tapped", note: "of delivered", pick: (s) => s.tapped },
  ];
  const sides: { key: "email" | "whatsapp"; label: string; color: string; s: Side; people: number }[] = [
    { key: "email", label: "Email", color: "#8b5cf6", s: v.email, people: v.students.email },
    { key: "whatsapp", label: "WhatsApp", color: "#10b981", s: v.whatsapp, people: v.students.whatsapp },
  ];
  return (
    <div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">{row.label} <span className="font-medium normal-case text-neutral-400">{row.note}</span></div>
            <div className="mt-2 flex flex-col gap-2">
              {sides.map((x) => {
                const ratio = row.pick(x.s);
                return (
                  <div key={x.key}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-neutral-800">{x.label}</span>
                      <span className="tnum"><b className="text-sm text-neutral-950">{pctText(ratio)}</b> <span className="text-neutral-500">{ofText(ratio)}</span></span>
                    </div>
                    <div className="mt-0.5 h-2.5 overflow-hidden rounded-full border border-neutral-300 bg-neutral-100">
                      <div className="h-full" style={{ width: `${Math.min(100, ratio.pct ?? 0)}%`, background: x.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="tnum mt-4 text-xs text-neutral-600">
        Sent: <b className="text-neutral-950">{fmtN(v.email.sent)}</b> emails to {fmtN(v.students.email)} students, <b className="text-neutral-950">{fmtN(v.whatsapp.sent)}</b> WhatsApp messages to {fmtN(v.students.whatsapp)}.
      </p>
      <p className="mt-1 max-w-3xl whitespace-normal text-xs leading-snug text-neutral-500">
        Measured differently: WhatsApp's read is Meta's receipt (off for anyone who turned read receipts off); an email open is our pixel loading, which an image blocker hides and Apple's privacy loads for everyone.
        Tapped on WhatsApp is a button or any message from them that day; on email a link or a reply.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ recent

const STATUS_TONE: Record<StatusKey, string> = {
  refused: "border-red-500 bg-red-50 text-red-700",
  bounced: "border-red-500 bg-red-50 text-red-700",
  dropped: "border-red-500 bg-red-50 text-red-700",
  replied: "border-emerald-600 bg-emerald-50 text-emerald-700",
  clicked: "border-emerald-600 bg-emerald-50 text-emerald-700",
  opened: "border-purple-400 bg-purple-50 text-purple-800",
  machine: "border-neutral-300 bg-white text-neutral-600",
  delivered: "border-neutral-400 bg-neutral-100 text-neutral-700",
  pending: "border-neutral-300 bg-white text-neutral-600",
  no_report: "border-amber-500 bg-amber-50 text-amber-800",
};

function Chip({ s }: { s: StatusKey }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[s]}`}>{STATUS_LABEL[s]}</span>;
}

const yes = (b: boolean) => (b ? <span className="font-semibold text-emerald-700">yes</span> : <span className="text-neutral-400">no</span>);

function Recent({ rows }: { rows: RecentRow[] }) {
  if (!rows.length) return <p className="text-sm text-neutral-500">No emails yet.</p>;
  const who = (x: RecentRow) => (x.internal ? ` · internal: ${x.internal}` : x.team ? " · team" : "");
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((x) => (
          <li key={x.id} className="rounded-xl border-2 border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-neutral-950">{x.to || "unknown"}</div>
                <div className="truncate text-xs text-neutral-500">{KIND_LABEL[x.kind]} · {istText(x.sentAt)}{who(x)}</div>
              </div>
              <Chip s={x.status} />
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-x-2 text-xs">
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Deliv.</dt><dd>{yes(x.delivered)}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Opened</dt><dd>{x.opened ? <span className="font-semibold text-emerald-700">×{Math.max(1, x.opens)}</span> : yes(false)}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Clicked</dt><dd>{yes(x.clicked)}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Replied</dt><dd>{yes(x.replied)}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="tnum w-full min-w-[860px] text-sm">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className={TH}>To</th><th className={TH}>Kind</th><th className={TH}>Sent (IST)</th><th className={TH}>Route</th>
              <th className={TH}>Delivered</th><th className={TH}>Opened</th><th className={TH}>Clicked</th><th className={TH}>Replied</th><th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="row-hover border-t-2 border-neutral-100 align-top">
                <td className="max-w-[220px] px-2 py-1.5"><div className="truncate text-neutral-900">{x.to || "unknown"}</div>{who(x) && <div className="truncate text-[11px] text-neutral-500">{who(x).slice(3)}</div>}</td>
                <td className="px-2 py-1.5 text-neutral-800">{KIND_LABEL[x.kind]}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-neutral-700">{istText(x.sentAt)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-neutral-600">{ROUTE_LABEL[x.route]}</td>
                <td className="px-2 py-1.5">{yes(x.delivered)}</td>
                <td className="px-2 py-1.5">{x.opened ? <span className="font-semibold text-emerald-700">yes ×{Math.max(1, x.opens)}</span> : x.opens ? <span className="text-neutral-500" title="Apple's machine opens only">machine ×{x.opens}</span> : yes(false)}</td>
                <td className="px-2 py-1.5">{yes(x.clicked)}</td>
                <td className="px-2 py-1.5">{yes(x.replied)}</td>
                <td className="px-2 py-1.5"><Chip s={x.status} />{x.unsub && <span className="ml-1 text-[11px] font-semibold text-red-700">unsubscribed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ notes

function HowToRead({ r }: { r: EmailReport }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ul className="list-disc space-y-1.5 whitespace-normal pl-5 text-xs leading-snug text-neutral-600">
        <li><b className="text-neutral-800">Gmail</b> loads the open pixel once, through its own image proxy, and keeps it. A second open of the same email in Gmail is not seen, so repeat opens undercount. The first open is right.</li>
        <li><b className="text-neutral-800">Apple Mail Privacy</b> loads every image when the email arrives, read or not. Those are machine opens: {r.live.events ? "they show apart above and stay out of the open rate" : "the ledger cannot tell them apart yet, so until the event log is live the open rate can read high for Apple Mail users"}.</li>
        <li><b className="text-neutral-800">Clicks and replies are the honest signals.</b> A click or a reply counts as an open too, since an image blocker can hide the open.</li>
        <li><b className="text-neutral-800">Acted</b>: within 48 h of the first open, click or reply, they did what the email asks: saved a job or started outreach (morning matches, floor), started a call (J1, J2), opened their replies (C1: Stu from the email, or its replies link), connected an inbox (C5), else opened Stu from an email link. Stu's open from an email is noted once a day, so a student already on Stu that day reads low.</li>
        <li><b className="text-neutral-800">Paid</b>: acted, then real money within 7 days of the open (a credit pack less refunds, an autopay charge, a plan; never a test payment or a ₹0 order).</li>
      </ul>
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Typical for lifecycle emails</div>
        <table className="tnum mt-1.5 w-full max-w-sm text-sm">
          <tbody>
            {[
              ["Open rate", `${INDUSTRY.open[0]} to ${INDUSTRY.open[1]}%`],
              ["Click rate", `${INDUSTRY.click[0]} to ${INDUSTRY.click[1]}%`],
              ["Unsubscribe", `under ${INDUSTRY.unsubUnder}%`],
              ["Bounce", `under ${INDUSTRY.bounceUnder}%`],
              ["Spam complaints", `under ${INDUSTRY.spamUnder}% (Gmail's hard limit ${INDUSTRY.gmailSpamLimit}%)`],
            ].map(([k, v]) => (
              <tr key={k} className="border-t-2 border-neutral-100"><td className="py-1 pr-3 text-neutral-700">{k}</td><td className="py-1 text-right font-semibold text-neutral-950">{v}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-snug text-neutral-500">
          Spam complaints reach us only from Google Postmaster Tools (Gmail tells no sender who marked them). Sent means the provider took the email; delivered,
          its delivery report (Google's own send counts as delivered at once; a bounce comes back later). Rates below 20 emails swing a lot.
        </p>
      </div>
    </div>
  );
}
