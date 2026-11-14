// The panels that moved from the Overview to the Usage page (/usage) on 2 Nov 2026:
// engagement (DAU, WAU, MAU), power users, call health, where people stop,
// retention, the live feed and the 30-day trends with conversion and a table.
// Same sections of /api/stu/overview, same numbers; drawn in the admin's style.
import { useState } from "react";
import { Link } from "react-router";
import { BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { channelLabel } from "~/components/stu/ui";
import { type Cell, fmtDur, fmtN, fmtPct } from "~/lib/stu/model";
import { type FeedRow, type PowerRow, HEAT_DAYS } from "~/lib/stu/overview";
import { type Drill, type Palette, type SectionState, Card, Legend, N, STATUS, Seg, chartOptions, crosshair, dayLabel, istShort } from "./overview-kit";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler);

// ------------------------------------------------------------------ trends

interface TrendsBody { days: string[]; series: { key: string; label: string; na: boolean; cells: Cell[] }[]; rates: { key: string; label: string; values: (number | null)[] }[] }

export function Trends({ s, drill, t }: { s: SectionState; drill: Drill; t: Palette }) {
  const [view, setView] = useState<"counts" | "rates" | "table">("counts");
  const body = s.env?.body as TrendsBody | undefined;
  return (
    <Card
      title="Last 30 days"
      sub={view === "rates" ? "Conversion, trailing 7 days, %" : "People a day (visitors: visitor ids). Click a point for its people."}
      s={s}
      minH={300}
      right={<Seg label="Trend view" value={view} onChange={setView} options={[{ v: "counts", l: "Counts" }, { v: "rates", l: "Conversion" }, { v: "table", l: "Table" }]} />}
    >
      {(env) => {
        const b = body!;
        const labels = b.days.map(dayLabel);
        const lines = view === "rates" ? b.rates.map((r) => ({ label: r.label, data: r.values })) : b.series.map((x) => ({ label: x.label, data: x.cells.map((c) => (c.na ? null : c.v)) }));
        if (view === "table") {
          return (
            <div className="max-h-[300px] overflow-auto text-xs">
              <table className="tnum w-full">
                <thead className="sticky top-0" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                  <tr><th className="py-1 text-left font-medium">Day</th>{b.series.map((x) => <th key={x.key} className="py-1 text-right font-medium">{x.label}</th>)}{b.rates.map((r) => <th key={r.key} className="py-1 text-right font-medium">{r.label}</th>)}</tr>
                </thead>
                <tbody>
                  {b.days.map((day, k) => ({ day, k })).reverse().map(({ day, k }) => (
                    <tr key={day} style={{ borderTop: "1px solid var(--grid)" }}>
                      <td className="py-1">{dayLabel(day)}</td>
                      {b.series.map((x) => <td key={x.key} className="py-1 text-right"><N cell={x.cells[k]} env={env} drill={drill} title={`${x.label}, ${day}`} /></td>)}
                      {b.rates.map((r) => <td key={r.key} className="py-1 text-right" style={{ color: "var(--ink2)" }}>{fmtPct(r.values[k])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const data = {
          labels,
          datasets: lines.map((l, i) => ({
            label: l.label, data: l.data, borderColor: t.series[i], backgroundColor: t.series[i], borderWidth: 2, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: t.surface, tension: 0, spanGaps: true,
          })),
        };
        const options: any = {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            ovCrosshair: { color: t.axis },
            tooltip: {
              backgroundColor: t.surface, borderColor: t.axis, borderWidth: 1, titleColor: t.ink2, bodyColor: t.ink, padding: 8,
              boxWidth: 10, boxHeight: 2, usePointStyle: false,
              callbacks: { label: (c: any) => ` ${c.parsed.y == null ? "n/a" : view === "rates" ? `${c.parsed.y}%` : fmtN(c.parsed.y)}  ${c.dataset.label}` },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.muted, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 }, callback: (v: any) => (view === "rates" ? `${v}%` : fmtN(Number(v))) } },
          },
          onClick: (evt: any, _els: any, chart: any) => {
            if (view !== "counts") return;
            const hit = chart.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true)[0];
            if (!hit) return;
            const series = b.series[hit.datasetIndex];
            const cell = series?.cells[hit.index];
            if (cell && (cell.users.length || cell.visitors?.length)) drill(`${series.label}, ${b.days[hit.index]}`, cell, env);
          },
        };
        return (
          <div>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink2)" }}>
              {lines.map((l, i) => {
                const total = view === "rates" ? null : b.series[i].cells.reduce((a, c) => a + c.v, 0);
                return (
                  <span key={l.label} className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-4 rounded" style={{ background: t.series[i] }} />
                    {l.label}{total != null ? <span style={{ color: "var(--muted)" }}>{fmtN(total)}</span> : null}
                  </span>
                );
              })}
            </div>
            <div className="h-[260px]"><Line data={data} options={options} plugins={[crosshair]} /></div>
          </div>
        );
      }}
    </Card>
  );
}

// -------------------------------------------------------------- call health

const OUTCOME_STYLE: Record<string, { color: string; icon: string }> = {
  completed: { color: STATUS.good, icon: "✓" },
  failed: { color: STATUS.critical, icon: "✕" },
  dropped: { color: STATUS.serious, icon: "▼" },
  hung_up_first_minute: { color: STATUS.warning, icon: "!" },
};

interface Rate { label: string; value: number | null; num: Cell; den: Cell }
interface CallsBody {
  total: Cell; started: Cell; outcomes: { key: string; label: string; cell: Cell }[];
  reasons: { key: string; label: string; cell: Cell; of: Cell }[];
  micDenied: Rate; failCalls: Rate; failPeople: Rate; medianSeconds: number | null;
}

function StackBar({ segs, onPick }: { segs: { key: string; label: string; v: number; color: string; cell: Cell }[]; onPick: (k: string) => void }) {
  const total = segs.reduce((a, x) => a + x.v, 0);
  if (!total) return <div className="h-[18px] rounded" style={{ background: "var(--track)" }} />;
  return (
    <div className="flex h-[18px] w-full gap-[2px] overflow-hidden rounded">
      {segs.filter((x) => x.v > 0).map((x) => (
        <button key={x.key} type="button" onClick={() => onPick(x.key)} title={`${x.label}: ${fmtN(x.v)} (${Math.round((x.v / total) * 100)}%)`} aria-label={`${x.label}: ${x.v}`}
          className="h-full hover:opacity-80 focus-visible:opacity-80" style={{ flexGrow: x.v, flexBasis: 0, minWidth: 3, background: x.color }} />
      ))}
    </div>
  );
}

export function Calls({ s, drill, t }: { s: SectionState; drill: Drill; t: Palette }) {
  const body = s.env?.body as CallsBody | undefined;
  return (
    <Card title="Call health" sub="Onboarding calls by people who joined in range (as Drop-offs and Ratios count them)." s={s}>
      {(env) => {
        const b = body!;
        const oc = (k: string) => b.outcomes.find((o) => o.key === k)?.cell ?? { v: 0, users: [] };
        const segs = b.outcomes.map((o) => ({ key: o.key, label: o.label, v: o.cell.v, cell: o.cell, color: OUTCOME_STYLE[o.key]?.color ?? t.neutral }));
        const tried = Math.max(1, ...b.reasons.map((r) => r.of.v));
        const fig = (label: string, node: React.ReactNode, note?: string) => (
          <div className="min-w-0">
            <div className="truncate text-[11px]" style={{ color: "var(--ink2)" }}>{label}</div>
            <div className="text-xl font-semibold">{node}</div>
            {note && <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>{note}</div>}
          </div>
        );
        return (
          <div>
            <div className="grid grid-cols-4 gap-2">
              {fig("Started", <N cell={b.started} env={env} drill={drill} title="Calls started" />, `of ${fmtN(b.total.v)} calls`)}
              {fig("Completed", <N cell={oc("completed")} env={env} drill={drill} title="Calls completed" />, fmtPct(b.started.v ? Math.round((oc("completed").v / b.started.v) * 1000) / 10 : null) + " of started")}
              {fig("Failed", <N cell={oc("failed")} env={env} drill={drill} title="Calls failed" />, `${fmtPct(b.failCalls.value)} of calls`)}
              {fig("Dropped", <N cell={oc("dropped")} env={env} drill={drill} title="Calls dropped" />, "connection went")}
            </div>
            <div className="mt-3"><StackBar segs={segs} onPick={(k) => { const o = b.outcomes.find((x) => x.key === k); if (o) drill(`Calls: ${o.label}`, o.cell, env); }} /></div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--ink2)" }}>
              {segs.map((x) => (
                <span key={x.key} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />
                  {OUTCOME_STYLE[x.key] && <span aria-hidden>{OUTCOME_STYLE[x.key].icon}</span>}{x.label} <span style={{ color: "var(--muted)" }}>{fmtN(x.v)}</span>
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
              {fig("Mic denied (people)", b.micDenied.value == null ? <span style={{ color: "var(--muted)" }}>n/a</span> : <N cell={b.micDenied.num} env={env} drill={drill} title="Mic denied" fmt={() => fmtPct(b.micDenied.value)} />, `${fmtN(b.micDenied.num.v)} of ${fmtN(b.micDenied.den.v)} who tried`)}
              {fig("Failure rate (people)", <N cell={b.failPeople.num} env={env} drill={drill} title="People with a failed call" fmt={() => fmtPct(b.failPeople.value)} />, `${fmtN(b.failPeople.num.v)} of ${fmtN(b.failPeople.den.v)}`)}
              {fig("Median call length", <span>{b.medianSeconds != null ? fmtDur(b.medianSeconds * 1000) : "n/a"}</span>, "started calls")}
            </div>
            <div className="mt-3 text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>Why calls did not finish (people)</div>
            {b.reasons.length ? (
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(60px,35%)_auto] items-center gap-x-2 gap-y-1 text-xs">
                {b.reasons.slice(0, 7).map((r) => (
                  <div key={r.key} className="contents">
                    <span className="truncate" title={r.label}>{r.label}</span>
                    <div className="h-[8px] rounded-r" style={{ width: `${(r.cell.v / tried) * 100}%`, minWidth: r.cell.v ? 3 : 0, background: t.series[0] }} />
                    <span className="tnum text-right"><N cell={r.cell} env={env} drill={drill} title={r.label} /> <span style={{ color: "var(--muted)" }}>{fmtPct(r.of.v ? Math.round((r.cell.v / r.of.v) * 1000) / 10 : null)}</span></span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>No failed, dropped or short calls.</p>}
          </div>
        );
      }}
    </Card>
  );
}

// ---------------------------------------------------------------- drop-offs

const PHASES = ["Sign up", "Call", "Use", "Outreach", "Pay"];

export function Dropoffs({ s, drill, t, qs }: { s: SectionState; drill: Drill; t: Palette; qs: string }) {
  const body = s.env?.body as { stuck: { key: string; n: string; label: string; phase: string; cell: Cell }[]; total: number; reasons: { key: string; label: string; cell: Cell; of: Cell }[] } | undefined;
  return (
    <Card title="Where people stop" sub="Furthest step reached by people who joined in range. Click a step for those people in Journeys." s={s}>
      {(env) => {
        const b = body!;
        const color = (phase: string) => t.ordinal[Math.max(0, PHASES.indexOf(phase))];
        const segs = b.stuck.filter((x) => x.cell.v > 0);
        const top = segs.reduce((m, x) => (x.cell.v > (m?.cell.v ?? -1) ? x : m), null as (typeof segs)[number] | null);
        return (
          <div>
            {top && <p className="mb-2 text-sm">Most stop at <span className="font-semibold">{top.label}</span>: {fmtN(top.cell.v)} of {fmtN(b.total)} ({Math.round((top.cell.v / Math.max(1, b.total)) * 100)}%).</p>}
            <div className="flex h-[22px] w-full gap-[2px] overflow-hidden rounded">
              {segs.map((x) => (
                <Link key={x.key} to={`/journeys?${qs}&cohort=1&stuck=${x.key}`} title={`${x.n}. ${x.label}: ${x.cell.v} (${Math.round((x.cell.v / Math.max(1, b.total)) * 100)}%)`}
                  className="h-full hover:opacity-80" style={{ flexGrow: x.cell.v, flexBasis: 0, minWidth: 3, background: color(x.phase) }} aria-label={`${x.label}: ${x.cell.v}`} />
              ))}
              {!segs.length && <div className="h-full w-full" style={{ background: "var(--track)" }} />}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--ink2)" }}>
              {PHASES.map((p) => <span key={p} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color(p) }} />{p}</span>)}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {segs.map((x) => (
                <div key={x.key} className="row-hover flex items-center justify-between gap-2 rounded px-1 py-[3px] text-xs" style={{ borderTop: "1px solid var(--grid)" }}>
                  <Link to={`/journeys?${qs}&cohort=1&stuck=${x.key}`} className="truncate hover:underline" title="Open these people in Journeys">
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: color(x.phase) }} />{x.n}. {x.label}
                  </Link>
                  <span className="tnum whitespace-nowrap"><N cell={x.cell} env={env} drill={drill} title={`Stopped at ${x.label}`} /> <span style={{ color: "var(--muted)" }}>{Math.round((x.cell.v / Math.max(1, b.total)) * 100)}%</span></span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>Gaps worth a look</div>
            <div className="mt-1 grid gap-y-1 text-xs">
              {b.reasons.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.label}</span>
                  <span className="tnum whitespace-nowrap"><N cell={r.cell} env={env} drill={drill} title={r.label} /> <span style={{ color: "var(--muted)" }}>of {fmtN(r.of.v)}</span></span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </Card>
  );
}

// --------------------------------------------------------------- engagement

interface EngBody {
  headline: { n: number; back: Cell; eligible: Cell; value: number | null }[];
  heat: { day: string; size: Cell; d: { n: number; back: Cell; eligible: number; value: number | null }[] }[];
  active: Cell; chats: Cell; chatters: Cell; jobOpens: Cell; applies: Cell; saved: Cell;
  perActive: { chats: number | null; jobs: number | null; applies: number | null };
}

export function Engagement({ s, drill, t }: { s: SectionState; drill: Drill; t: Palette }) {
  const body = s.env?.body as EngBody | undefined;
  return (
    <Card title="Retention" sub="Came back (any activity, as Active students counts it) on day N after the IST day they joined, as the Retention page counts it; people whose day N has not come yet are left out." s={s}>
      {(env) => {
        const b = body!;
        const shade = (v: number | null) => {
          if (v == null) return null;
          const k = Math.min(t.seq.length - 1, Math.round((v / 100) * (t.seq.length - 1)));
          return { bg: v === 0 ? t.track : t.seq[k], fg: v === 0 ? t.muted : k >= 7 ? "#ffffff" : "#0b0b0b" };
        };
        const stat = (label: string, node: React.ReactNode, note: string) => (
          <div className="min-w-0">
            <div className="truncate text-[11px]" style={{ color: "var(--ink2)" }}>{label}</div>
            <div className="text-xl font-semibold">{node}</div>
            <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>{note}</div>
          </div>
        );
        return (
          <div>
            <div className="grid grid-cols-3 gap-2">
              {b.headline.map((h) => stat(`D${h.n} return`, h.value == null ? <span style={{ color: "var(--muted)" }}>n/a</span> : <N cell={h.back} env={env} drill={drill} title={`Back on day ${h.n}`} fmt={() => fmtPct(h.value)} />, `${fmtN(h.back.v)} of ${fmtN(h.eligible.v)}`))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
              {stat("Active students", <N cell={b.active} env={env} drill={drill} title="Active in range" />, "did something in range")}
              {stat("Chats per active", <span>{b.perActive.chats ?? "n/a"}</span>, `${fmtN(b.chats.v)} messages, ${fmtN(b.chatters.v)} chatted`)}
              {stat("Jobs opened per active", <span>{b.perActive.jobs ?? "n/a"}</span>, `${fmtN(b.jobOpens.v)} opens`)}
              {stat("Apply clicks per active", <span>{b.perActive.applies ?? "n/a"}</span>, `${fmtN(b.applies.v)} clicks, ${fmtN(b.saved.v)} saved`)}
            </div>
            <div className="mt-3 text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>Cohorts by sign-up day, % back on day N</div>
            {b.heat.length ? (
              <div className="mt-1 overflow-x-auto">
                <table className="tnum w-full border-separate text-[11px]" style={{ borderSpacing: 2 }}>
                  <thead style={{ color: "var(--muted)" }}>
                    <tr><th className="text-left font-medium">Joined</th><th className="text-right font-medium">People</th>{HEAT_DAYS.map((n) => <th key={n} className="font-medium">D{n}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.heat.map((r) => (
                      <tr key={r.day}>
                        <td className="whitespace-nowrap pr-2">{dayLabel(r.day)}</td>
                        <td className="pr-2 text-right"><N cell={r.size} env={env} drill={drill} title={`Joined ${r.day}`} /></td>
                        {r.d.map((c) => {
                          const sh = shade(c.value);
                          return (
                            <td key={c.n} className="h-[22px] min-w-[38px] rounded text-center" style={{ background: sh?.bg ?? "transparent", color: sh?.fg ?? t.muted }} title={c.value == null ? `D${c.n}: not yet` : `D${c.n}: ${c.back.v} of ${c.eligible} (${c.value}%)`}>
                              {c.value == null ? "" : c.back.v > 0 ? <button type="button" className="h-full w-full" onClick={() => drill(`Joined ${r.day}, back on day ${c.n}`, c.back, env)}>{c.value}%</button> : `${c.value}%`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Nobody joined in this range.</p>}
          </div>
        );
      }}
    </Card>
  );
}

// -------------------------------------------------------------------- feed

export function Feed({ s, qs }: { s: SectionState; qs: string }) {
  const rows = s.env?.body as FeedRow[] | undefined;
  return (
    <Card title="Live feed" sub="The last 20 journey events, newest first (all days). Click a person for their journey." s={s} minH={200}>
      {(env) => (
        rows!.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px]" style={{ color: "var(--muted)" }}>
                <tr><th className="pb-1 font-medium">Time (IST)</th><th className="pb-1 font-medium">Step</th><th className="pb-1 font-medium">Who</th><th className="hidden pb-1 font-medium sm:table-cell">Source</th></tr>
              </thead>
              <tbody>
                {rows!.map((r) => {
                  const person = r.u >= 0 ? env.people[r.u] : null;
                  return (
                    <tr key={r.id} className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                      <td className="tnum whitespace-nowrap py-1 pr-3" style={{ color: "var(--ink2)" }}>{istShort(r.at)}</td>
                      <td className="py-1 pr-3" title={r.step}>{r.label}</td>
                      <td className="max-w-[220px] truncate py-1 pr-3">
                        {person ? <Link to={`/journeys?${qs}&u=${encodeURIComponent(person.id)}`} className="hover:underline" style={{ color: "var(--s1)" }}>{r.who}</Link> : <span style={{ color: "var(--muted)" }}>{r.who}</span>}
                        {person?.internal && <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }}>internal</span>}
                      </td>
                      <td className="hidden max-w-[260px] truncate py-1 sm:table-cell" style={{ color: "var(--ink2)" }}>{r.source.startsWith("channel: ") ? channelLabel(r.source.slice(9)) : r.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm" style={{ color: "var(--muted)" }}>No journey events yet.</p>
      )}
    </Card>
  );
}

// ------------------------------------------------------- usage: DAU, WAU, MAU

interface UsageBody {
  dau: Cell; wau: Cell; mau: Cell; avgDau: number; stickiness: number | null;
  trend: { day: string; dau: Cell; wau: number; mau: number; stick: number | null; new: Cell; returning: Cell }[];
  repeat: Cell; cohort: Cell; repeatPct: number | null; repeaters: Cell; oneTime: Cell;
  features: { key: string; label: string; rep: Cell; one: Cell; repPct: number | null; onePct: number | null }[];
  source: string; beacons: boolean;
}

export function Usage({ s, drill, t }: { s: SectionState; drill: Drill; t: Palette }) {
  const [view, setView] = useState<"newret" | "stick" | "dwm">("newret");
  const body = s.env?.body as UsageBody | undefined;
  return (
    <Card
      title="Engagement"
      sub="Active: the student did something themselves that IST day (not rows our system makes). DAU on the range's last day, WAU 7 days, MAU 30 days to it."
      s={s}
      minH={360}
      right={<Seg label="Engagement view" value={view} onChange={setView} options={[{ v: "newret", l: "New, returning" }, { v: "stick", l: "Stickiness" }, { v: "dwm", l: "DAU, WAU, MAU" }]} />}
    >
      {(env) => {
        const b = body!;
        const labels = b.trend.map((x) => dayLabel(x.day));
        const pick = (cells: Cell[], name: string) => (_e: any, els: any[]) => {
          const el = els?.[0];
          if (!el) return;
          const c = cells[el.index];
          if (c && c.users.length) drill(`${name}, ${b.trend[el.index].day}`, c, env);
        };
        const stat = (label: string, node: React.ReactNode, note: string) => (
          <div className="min-w-0">
            <div className="truncate text-[11px]" style={{ color: "var(--ink2)" }}>{label}</div>
            <div className="text-xl font-semibold">{node}</div>
            <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>{note}</div>
          </div>
        );
        let chart: React.ReactNode;
        if (view === "newret") {
          const data = {
            labels,
            datasets: [
              { label: "New (joined that day)", data: b.trend.map((x) => x.new.v), backgroundColor: t.series[0], borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 }, borderSkipped: false, maxBarThickness: 18, borderColor: t.surface, borderWidth: { top: 2 } },
              { label: "Returning", data: b.trend.map((x) => x.returning.v), backgroundColor: t.series[1], borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, maxBarThickness: 18 },
            ],
          };
          const cellsAt = (i: number, ds: number) => (ds === 0 ? b.trend[i].new : b.trend[i].returning);
          chart = (
            <>
              <Legend items={[{ label: "New (joined that day)", color: t.series[0] }, { label: "Returning", color: t.series[1] }]} />
              <div className="h-[170px]">
                <Bar data={data} options={chartOptions(t, { stacked: true, onClick: (evt: any, _els: any, ch: any) => {
                  const el = ch.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true)[0];
                  if (!el) return;
                  const c = cellsAt(el.index, el.datasetIndex);
                  if (c.users.length) drill(`${el.datasetIndex === 0 ? "New actives" : "Returning actives"}, ${b.trend[el.index].day}`, c, env);
                } })} />
              </div>
            </>
          );
        } else if (view === "stick") {
          const data = { labels, datasets: [{ label: "DAU / MAU", data: b.trend.map((x) => x.stick), borderColor: t.series[0], backgroundColor: t.series[0], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0, spanGaps: true }] };
          chart = (
            <>
              <div className="mb-2 text-xs" style={{ color: "var(--ink2)" }}>DAU / MAU each day, %</div>
              <div className="h-[170px]"><Line data={data} options={chartOptions(t, { pct: true, onClick: pick(b.trend.map((x) => x.dau), "Active") })} plugins={[crosshair]} /></div>
            </>
          );
        } else {
          const data = {
            labels,
            datasets: [
              { label: "DAU", data: b.trend.map((x) => x.dau.v), borderColor: t.series[0], backgroundColor: t.series[0] },
              { label: "WAU", data: b.trend.map((x) => x.wau), borderColor: t.series[1], backgroundColor: t.series[1] },
              { label: "MAU", data: b.trend.map((x) => x.mau), borderColor: t.series[2], backgroundColor: t.series[2] },
            ].map((x) => ({ ...x, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 })),
          };
          chart = (
            <>
              <Legend items={[{ label: "DAU", color: t.series[0], line: true }, { label: "WAU (7 days)", color: t.series[1], line: true }, { label: "MAU (30 days)", color: t.series[2], line: true }]} />
              <div className="h-[170px]"><Line data={data} options={chartOptions(t, { onClick: pick(b.trend.map((x) => x.dau), "Active") })} plugins={[crosshair]} /></div>
            </>
          );
        }
        const maxPct = 100;
        return (
          <div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {stat("DAU", <N cell={b.dau} env={env} drill={drill} title="Active on the last day" />, `avg ${b.avgDau} over 7 days`)}
              {stat("WAU", <N cell={b.wau} env={env} drill={drill} title="Active in 7 days" />, "7 days")}
              {stat("MAU", <N cell={b.mau} env={env} drill={drill} title="Active in 30 days" />, "30 days")}
              {stat("Stickiness", <span>{fmtPct(b.stickiness)}</span>, "avg DAU 7 days / MAU")}
              {stat("Repeat users", <N cell={b.repeat} env={env} drill={drill} title="Joined in range, active on 2+ days" />, `${fmtPct(b.repeatPct)} of ${fmtN(b.cohort.v)} sign-ups, 2+ days`)}
            </div>
            <div className="mt-3">{chart}</div>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
              <div className="text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>What repeat users use, against one-time users</div>
              <Legend items={[
                { label: "Repeat (2+ days)", color: t.series[0], note: ` ${fmtN(b.repeaters.v)}` },
                { label: "One day only", color: t.series[1], note: ` ${fmtN(b.oneTime.v)}` },
              ]} />
            </div>
            {b.features.length ? (
              <div className="grid grid-cols-[minmax(80px,120px)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
                {b.features.map((x) => (
                  <div key={x.key} className="contents">
                    <span className="truncate" style={{ color: "var(--ink2)" }}>{x.label}</span>
                    <div>
                      <div className="flex items-center gap-1.5" title={`Repeat users: ${x.rep.v} (${fmtPct(x.repPct)})`}>
                        <div style={{ width: `${((x.repPct ?? 0) / maxPct) * 85}%`, minWidth: x.rep.v ? 3 : 0, height: 8, background: t.series[0], borderRadius: "0 3px 3px 0" }} />
                        <N cell={x.rep} env={env} drill={drill} title={`Repeat users who used ${x.label}`} fmt={() => fmtPct(x.repPct)} className="tnum text-[11px]" />
                      </div>
                      <div className="mt-[2px] flex items-center gap-1.5" title={`One-time users: ${x.one.v} (${fmtPct(x.onePct)})`}>
                        <div style={{ width: `${((x.onePct ?? 0) / maxPct) * 85}%`, minWidth: x.one.v ? 3 : 0, height: 8, background: t.series[1], borderRadius: "0 3px 3px 0" }} />
                        <N cell={x.one} env={env} drill={drill} title={`One-time users who used ${x.label}`} fmt={() => fmtPct(x.onePct)} className="tnum text-[11px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs" style={{ color: "var(--muted)" }}>Nobody active in this range.</p>}
            <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>source: {b.source}</p>
          </div>
        );
      }}
    </Card>
  );
}

// -------------------------------------------------------------- power users

interface PowerBody { rule: string; cell: Cell; trend: { day: string; v: number }[]; rows: PowerRow[]; more: number; weekAgo: number | null; byChannel: [string, number][]; source: string }

export function Power({ s, drill, t, qs }: { s: SectionState; drill: Drill; t: Palette; qs: string }) {
  const body = s.env?.body as PowerBody | undefined;
  return (
    <Card title="Power users" s={s} minH={360}>
      {(env) => {
        const b = body!;
        const data = { labels: b.trend.map((x) => dayLabel(x.day)), datasets: [{ label: "Power users", data: b.trend.map((x) => x.v), borderColor: t.series[0], backgroundColor: t.series[0], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 }] };
        return (
          <div>
            <p className="text-[13px]" style={{ color: "var(--ink2)" }}>{b.rule}</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-1">
              <div>
                <div className="text-[11px]" style={{ color: "var(--ink2)" }}>Now</div>
                <div className="text-[26px] font-semibold leading-tight"><N cell={b.cell} env={env} drill={drill} title="Power users" /></div>
              </div>
              <div className="pb-1 text-xs" style={{ color: "var(--muted)" }}>
                {b.weekAgo != null ? `${b.weekAgo} a week earlier` : ""}
                {b.byChannel.length ? ` · ${b.byChannel.slice(0, 3).map(([c, n]) => `${channelLabel(c)} ${n}`).join(", ")}` : ""}
              </div>
            </div>
            <div className="mt-2 text-[11px]" style={{ color: "var(--ink2)" }}>Power users each day, last 30 days</div>
            <div className="h-[90px]"><Line data={data} options={chartOptions(t, {})} plugins={[crosshair]} /></div>
            {b.rows.length ? (
              <div className="mt-3 max-h-[260px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 text-left text-[11px]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                    <tr><th className="pb-1 font-medium">Who</th><th className="pb-1 font-medium">Last active</th><th className="pb-1 text-right font-medium">Days</th><th className="pb-1 pl-2 font-medium">Top features</th><th className="hidden pb-1 font-medium sm:table-cell">Source</th></tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r) => {
                      const p = env.people[r.u];
                      return (
                        <tr key={r.u} className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                          <td className="max-w-[150px] truncate py-1 pr-2">{p ? <Link to={`/journeys?${qs}&u=${encodeURIComponent(p.id)}`} className="hover:underline" style={{ color: "var(--s1)" }}>{r.who}</Link> : r.who}</td>
                          <td className="tnum whitespace-nowrap py-1 pr-2">{r.lastActive ? dayLabel(r.lastActive) : ""}</td>
                          <td className="tnum py-1 pr-2 text-right" title={`${r.activeDays} active days, ${r.richDays} with 3+ features, in the last 7`}>{r.activeDays}</td>
                          <td className="max-w-[160px] truncate py-1 pl-2 pr-2" style={{ color: "var(--ink2)" }}>{r.top.join(", ")}</td>
                          <td className="hidden max-w-[120px] truncate py-1 sm:table-cell" style={{ color: "var(--ink2)" }}>{r.source || channelLabel(r.ch)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {b.more > 0 && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>and {b.more} more (open the count for all)</p>}
              </div>
            ) : <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>Nobody meets the rule yet.</p>}
            <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>source: {b.source}</p>
          </div>
        );
      }}
    </Card>
  );
}
