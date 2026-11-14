// ACTIVES (14 Nov 2026, the owner: "i want better dau, mau and wau reporting"): the Active users panel, full width at
// the top of /usage. The "actives" section of /api/stu/overview (app/lib/stu/actives.ts counts it): DAU, WAU and MAU
// against the period before, returning people, stickiness, 60 days of DAU (new and returning) with WAU and MAU, the
// split by channel, plan and setup, retention by sign-up day and week, and week over week. Every number opens its people.
import { useState } from "react";
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { type Cell, fmtN, fmtPct } from "~/lib/stu/model";
import { type ActivesBody, type CohortRow, type PeriodTile, COHORT_RULE, COHORT_SPANS } from "~/lib/stu/actives";
import { ACTIVES_STACKING, activesDatasets } from "~/lib/stu/actives-chart";
import { type Drill, type Env, type Palette, type SectionState, Card, Legend, N, Seg, crosshair, dayLabel } from "./overview-kit";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip);

type Body = ActivesBody & { rule: string };

/** Up or down against the period before, in plain words. */
function vsText(cur: number, prev: number | null, what: string, from: string | null, soFar?: boolean): { text: string; dir: 1 | -1 | 0 | null } {
  // ADMIN-AUDIT-STU (14 Nov 2026): today is not over and activity has no time of day, so no % against whole days.
  if (soFar) return { text: "so far today: not compared with whole days", dir: null };
  if (prev == null) return { text: from ? `nothing to compare: counting starts ${dayLabel(from)}` : "nothing to compare yet", dir: null };
  const diff = cur - prev;
  if (diff === 0) return { text: `same as ${what} (${fmtN(prev)})`, dir: 0 };
  const p = prev > 0 ? `${Math.abs(Math.round((diff / prev) * 100))}%` : fmtN(Math.abs(diff));
  return { text: `${diff > 0 ? "▲ up" : "▼ down"} ${p} vs ${what} (${fmtN(prev)})`, dir: diff > 0 ? 1 : -1 };
}

function ptsText(cur: number | null, prev: number | null, soFar?: boolean): { text: string; dir: 1 | -1 | 0 | null } {
  if (soFar) return { text: "so far today: not compared", dir: null };
  if (cur == null || prev == null) return { text: "a week before: not counted", dir: null };
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { text: `same as a week before`, dir: 0 };
  return { text: `${diff > 0 ? "▲ up" : "▼ down"} ${Math.abs(diff)} points vs a week before (${prev}%)`, dir: diff > 0 ? 1 : -1 };
}

function Tile({ label, value, note, change }: { label: string; value: React.ReactNode; note?: React.ReactNode; change?: { text: string; dir: 1 | -1 | 0 | null } }) {
  return (
    <div className="min-w-0 rounded-xl border-2 border-neutral-900 bg-white px-3 py-2.5 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
      <div className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink2)" }}>{label}</div>
      <div className="tnum text-[26px] font-semibold leading-tight">{value}</div>
      {change && (
        <div className="text-[11px] leading-snug" style={{ color: change.dir === 1 ? "var(--up)" : change.dir === -1 ? "var(--down)" : "var(--muted)" }}>{change.text}</div>
      )}
      {note && <div className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--muted)" }}>{note}</div>}
    </div>
  );
}

/** IST day plus n days, for the MAU note. */
const addDaysTxt = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const partialNote = (p: PeriodTile, cf: string | null) => (p.partial && cf ? `${dayLabel(p.from)} to ${dayLabel(p.to)}, counted from ${dayLabel(cf)}` : `${dayLabel(p.from)} to ${dayLabel(p.to)}`);

export function Actives({ s, drill, t }: { s: SectionState; drill: Drill; t: Palette }) {
  const body = s.env?.body as Body | undefined;
  const [by, setBy] = useState<"day" | "week">("day");
  const [who, setWho] = useState<"all" | "onboarded">("all");
  return (
    <Card
      title="Active users"
      sub="People who used Stu themselves, by IST day. DAU is the range's last day, WAU the 7 days and MAU the 30 days to it. Click any number for the people."
      s={s}
      minH={420}
    >
      {(env) => {
        const b = body!;
        const cf = b.countFromDay;
        const endLabel = b.end === b.today ? "today" : dayLabel(b.end);
        return (
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Tile
                label={`DAU, ${endLabel}`}
                value={<N cell={b.dau.cell} env={env} drill={drill} title={`Active on ${b.end}`} />}
                change={vsText(b.dau.cell.v, b.dau.prev, "the day before", cf, b.dau.soFar)}
                note={<>{fmtN(b.fresh.v)} joined that day</>}
              />
              <Tile
                label="WAU, 7 days"
                value={<N cell={b.wau.cell} env={env} drill={drill} title={`Active ${b.wau.from} to ${b.wau.to}`} />}
                change={vsText(b.wau.cell.v, b.wau.prev, "the 7 days before", cf, b.wau.soFar)}
                note={partialNote(b.wau, cf)}
              />
              <Tile
                label="MAU, 30 days"
                value={<N cell={b.mau.cell} env={env} drill={drill} title={`Active ${b.mau.from} to ${b.mau.to}`} />}
                change={vsText(b.mau.cell.v, b.mau.prev, "the 30 days before", cf, b.mau.soFar)}
                note={<>
                  {partialNote(b.mau, cf)}
                  {b.mau.partial && cf && (
                    <span className="block" title="Everyone who signs up is active on the day they join, so while MAU's 30 days reach back before counting started it is everyone active since then">
                      Before {dayLabel(addDaysTxt(cf, 29))} this is everyone active since {dayLabel(cf)}, so it moves with sign-ups.
                    </span>
                  )}
                </>}
              />
              <Tile
                label={`Returning, ${endLabel}`}
                value={<N cell={b.returning} env={env} drill={drill} title={`Active on ${b.end}, joined before it`} />}
                note={<>joined before that day; {fmtPct(b.dau.cell.v ? Math.round((b.returning.v / b.dau.cell.v) * 1000) / 10 : null)} of DAU</>}
              />
              <Tile
                label="Stickiness"
                value={fmtPct(b.stickiness.value)}
                change={ptsText(b.stickiness.value, b.stickiness.prev, b.stickiness.soFar)}
                note={<>average DAU {b.stickiness.avgDau} over {b.stickiness.avgDays === 7 ? "7 days" : `${b.stickiness.avgDays} day${b.stickiness.avgDays === 1 ? "" : "s"}`} / MAU <N cell={b.mau.cell} env={env} drill={drill} title="MAU" /></>}
              />
              <Tile
                label="WAU / MAU"
                value={fmtPct(b.wauMau.value)}
                change={ptsText(b.wauMau.value, b.wauMau.prev)}
                note={<>WAU <N cell={b.wau.cell} env={env} drill={drill} title="WAU" /> of MAU <N cell={b.mau.cell} env={env} drill={drill} title="MAU" /></>}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0">
              <div className="lg:col-span-7"><DailyChart b={b} env={env} drill={drill} t={t} /></div>
              <div className="lg:col-span-5"><Split b={b} env={env} drill={drill} /></div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 [&>*]:min-w-0" style={{ borderTop: "1px solid var(--grid)", paddingTop: 14 }}>
              <div className="lg:col-span-7">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold">Retention by sign-up {by === "day" ? "day (last 21 days)" : "week (last 8 weeks)"}</div>
                  <div className="flex flex-wrap gap-2">
                    <Seg label="Cohort by" value={by} onChange={setBy} options={[{ v: "day", l: "By day" }, { v: "week", l: "By week" }]} />
                    <Seg label="Cohort people" value={who} onChange={setWho} options={[{ v: "all", l: "Everyone" }, { v: "onboarded", l: "Onboarded" }]} />
                  </div>
                </div>
                <Cohorts rows={by === "day" ? (who === "all" ? b.cohorts.day : b.cohorts.dayOnboarded) : (who === "all" ? b.cohorts.week : b.cohorts.weekOnboarded)} by={by} cf={cf} env={env} drill={drill} t={t} />
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>{COHORT_RULE}{who === "onboarded" ? " Onboarded: people from that sign-up day or week who have onboarded." : ""} Grey: not reached yet.</p>
              </div>
              <div className="lg:col-span-5"><Weeks b={b} env={env} drill={drill} /></div>
            </div>

            <p className="mt-4 text-[11px]" style={{ color: "var(--muted)" }}>How we count: {b.rule}{cf ? ` Counting starts ${dayLabel(cf)}.` : ""}</p>
          </div>
        );
      }}
    </Card>
  );
}

// ------------------------------------------------------------------ the 60-day chart

function DailyChart({ b, env, drill, t }: { b: Body; env: Env; drill: Drill; t: Palette }) {
  const days = b.chart;
  const colors = { returning: t.series[0], fresh: "#c4b5fd", wau: t.series[2], mau: t.series[3] };
  const dashed = (flags: boolean[]) => ({ borderDash: (c: any) => (flags[c.p1DataIndex] ? [4, 3] : undefined) });
  // ADMIN-AUDIT-STU (14 Nov 2026): the bars stack into DAU; WAU and MAU each sit on a stack of their own (actives-chart.ts).
  const data = { labels: days.map((x) => dayLabel(x.day)), datasets: activesDatasets(days, colors, dashed) };
  const options: any = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      ovCrosshair: { color: t.axis },
      tooltip: {
        backgroundColor: t.surface, borderColor: t.ink, borderWidth: 1, titleColor: t.ink2, bodyColor: t.ink, padding: 8, boxWidth: 10, boxHeight: 10,
        callbacks: {
          label: (c: any) => ` ${fmtN(c.parsed.y)}  ${c.dataset.label}`,
          footer: (items: any[]) => {
            const x = days[items[0]?.dataIndex];
            if (!x) return "";
            const out = [`DAU ${fmtN(x.new.v + x.returning.v)}`];
            if (x.mauPartial && b.countFromDay) out.push(`WAU and MAU count from ${dayLabel(b.countFromDay)}`);
            return out;
          },
        },
      },
    },
    scales: {
      x: { ...ACTIVES_STACKING.x, grid: { display: false }, border: { color: t.axis }, ticks: { color: t.muted, maxTicksLimit: 8, maxRotation: 0, font: { size: 11 } } },
      y: { ...ACTIVES_STACKING.y, beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 }, callback: (v: any) => fmtN(Number(v)) } },
    },
    onClick: (evt: any, _els: any, chart: any) => {
      const hit = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true)[0] ?? chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true)[0];
      if (!hit) return;
      const x = days[hit.index];
      if (!x) return;
      const cell: Cell = hit.datasetIndex === 1 ? x.new : hit.datasetIndex === 0 ? x.returning : { v: x.new.v + x.returning.v, users: [...x.returning.users, ...x.new.users] };
      const what = hit.datasetIndex === 1 ? "New actives" : hit.datasetIndex === 0 ? "Returning actives" : "Active";
      if (cell.users.length) drill(`${what}, ${x.day}`, cell, env);
    },
  };
  const n = days.length;
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold">
        Daily, {n >= 60 ? "last 60 days" : b.countFromDay && days[0]?.day === b.countFromDay ? `since ${dayLabel(b.countFromDay)} (counting starts then; up to 60 days)` : `last ${n} days`}
      </div>
      <Legend items={[
        { label: "Returning", color: colors.returning },
        { label: "New (joined that day)", color: colors.fresh },
        { label: "WAU (7 days to the day)", color: colors.wau, line: true },
        { label: "MAU (30 days to the day)", color: colors.mau, line: true },
      ]} />
      <div className="h-[240px]"><Chart type="bar" data={data as any} options={options} plugins={[crosshair]} /></div>
      <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        Bars: DAU, returning and new. Click a bar for its people. A dashed line counts from {b.countFromDay ? dayLabel(b.countFromDay) : "the start"}, as its 7 or 30 days reach back before counting began.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the split

const GROUPS: Record<string, string> = { channel: "Where they used it", plan: "Plan", setup: "Set up" };

function Split({ b, env, drill }: { b: Body; env: Env; drill: Drill }) {
  const cols = [{ k: "DAU", c: b.split.totals[0] }, { k: "WAU", c: b.split.totals[1] }, { k: "MAU", c: b.split.totals[2] }];
  const rows = b.split.rows.filter((r) => !r.rare || r.cells.some((c) => c.v > 0));
  let last = "";
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold">Who they are</div>
      <div className="overflow-x-auto">
        <table className="tnum w-full text-xs">
          <thead style={{ color: "var(--muted)" }}>
            <tr>
              <th className="py-1 text-left font-medium" />
              {cols.map((c) => <th key={c.k} className="py-1 pl-2 text-right font-medium">{c.k}</th>)}
            </tr>
            <tr style={{ color: "var(--ink)" }}>
              <td className="py-1 font-semibold">Everyone active</td>
              {cols.map((c) => <td key={c.k} className="py-1 pl-2 text-right font-semibold"><N cell={c.c} env={env} drill={drill} title={c.k} /></td>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const head = r.group !== last ? GROUPS[r.group] : null;
              last = r.group;
              return (
                <GroupRows key={r.key} head={head}>
                  <tr className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                    <td className="py-1 pr-2" style={{ color: "var(--ink2)" }}>{r.label}</td>
                    {r.cells.map((c, k) => (
                      <td key={k} className="whitespace-nowrap py-1 pl-2 text-right">
                        <N cell={c} env={env} drill={drill} title={`${cols[k].k}: ${r.label}`} />
                        <span className="ml-1 inline-block w-[38px] text-[10px]" style={{ color: "var(--muted)" }}>{fmtPct(cols[k].c.v ? Math.round((c.v / cols[k].c.v) * 100) : null)}</span>
                      </td>
                    ))}
                  </tr>
                </GroupRows>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        Channels over the period's days: web is the site, messaging is WhatsApp or iMessage. Had a call overlaps the rows above it. Paid and onboarded as of the last day.
      </p>
    </div>
  );
}

function GroupRows({ head, children }: { head: string | null; children: React.ReactNode }) {
  return (
    <>
      {head && (
        <tr><td colSpan={4} className="pt-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{head}</td></tr>
      )}
      {children}
    </>
  );
}

// ------------------------------------------------------------------ cohorts

function Cohorts({ rows, by, cf, env, drill, t }: { rows: CohortRow[]; by: "day" | "week"; cf: string | null; env: Env; drill: Drill; t: Palette }) {
  if (!rows.length) return <p className="text-xs" style={{ color: "var(--muted)" }}>Nobody signed up in these days.</p>;
  const shade = (v: number | null) => {
    if (v == null) return { bg: "transparent", fg: t.muted };
    const k = Math.min(t.seq.length - 1, Math.round((v / 100) * (t.seq.length - 1)));
    return { bg: v === 0 ? t.track : t.seq[k], fg: v === 0 ? t.muted : k >= 7 ? "#ffffff" : "#0b0b0b" };
  };
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="tnum w-full border-separate text-[11px]" style={{ borderSpacing: 2 }}>
        <thead className="sticky top-0" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          <tr>
            <th className="text-left font-medium">{by === "day" ? "Signed up" : "Week of"}</th>
            <th className="text-right font-medium">People</th>
            {COHORT_SPANS.map((x) => <th key={x.n} className="font-medium" title={x.from === x.to ? `Active on day ${x.n}` : `Active on any of days ${x.from} to ${x.to}`}>D{x.n}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="whitespace-nowrap pr-2">
                {dayLabel(r.key)}
                {r.partial && cf ? <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }}>from {dayLabel(cf)}</span> : null}
              </td>
              <td className="pr-2 text-right"><N cell={r.size} env={env} drill={drill} title={`Signed up ${by === "day" ? r.key : `week of ${r.key}`}`} /></td>
              {r.cells.map((c) => {
                if (c.state === "not_yet") {
                  return <td key={c.n} className="h-[22px] min-w-[44px] rounded text-center" style={{ background: t.track, color: t.axis }} title={`D${c.n}: not reached yet`}>·</td>;
                }
                const sh = shade(c.value);
                const tip = `D${c.n}: ${c.back.v} of ${c.eligible}${c.eligible < r.size.v ? ` (of ${r.size.v}, the rest not reached yet)` : ""}${c.state === "so_far" ? ", so far: the span is still running" : ""}`;
                const text = `${c.value}%${c.state === "so_far" ? "*" : ""}`;
                return (
                  <td key={c.n} className="h-[22px] min-w-[44px] rounded text-center" style={{ background: sh.bg, color: sh.fg, fontStyle: c.state === "so_far" ? "italic" : undefined }} title={tip}>
                    {c.back.v > 0 ? <button type="button" className="h-full w-full" onClick={() => drill(`Signed up ${r.key}, active again on D${c.n}`, c.back, env)}>{text}</button> : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>* so far: some of the span is today or later.</p>
    </div>
  );
}

// ------------------------------------------------------------------ week over week

function Weeks({ b, env, drill }: { b: Body; env: Env; drill: Drill }) {
  const cf = b.countFromDay;
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold">Week over week (7 days to {dayLabel(b.end)}, then each 7 before)</div>
      {b.weeks.length ? (
        <div className="overflow-x-auto">
          <table className="tnum w-full text-xs">
            <thead style={{ color: "var(--muted)" }}>
              <tr>
                <th className="py-1 text-left font-medium">7 days</th>
                <th className="py-1 pl-2 text-right font-medium">WAU</th>
                <th className="py-1 pl-2 text-right font-medium" title="Active these 7 days and the 7 before, as a % of the 7 before">Kept from last week</th>
                <th className="py-1 pl-2 text-right font-medium">Joined</th>
                <th className="py-1 pl-2 text-right font-medium" title="Joined earlier, not active the 7 days before">Back after a break</th>
              </tr>
            </thead>
            <tbody>
              {b.weeks.map((w) => (
                <tr key={w.to} className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                  <td className="whitespace-nowrap py-1 pr-2">
                    {dayLabel(w.from)} to {dayLabel(w.to)}
                    {w.partial && cf ? <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }}>from {dayLabel(cf)}</span> : null}
                  </td>
                  <td className="py-1 pl-2 text-right font-semibold"><N cell={w.wau} env={env} drill={drill} title={`Active ${w.from} to ${w.to}`} /></td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right">
                    {w.prevWau == null ? <span style={{ color: "var(--muted)" }} title="The 7 days before were not counted">n/a</span> : (
                      <>
                        <N cell={w.kept} env={env} drill={drill} title={`Active ${w.from} to ${w.to} and the 7 days before`} />
                        <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }} title={`of ${w.prevWau} active the 7 days before${w.prevPartial && cf ? `, counted from ${dayLabel(cf)}` : ""}`}>{fmtPct(w.keptPct)}{w.prevPartial ? "*" : ""}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1 pl-2 text-right"><N cell={w.joined} env={env} drill={drill} title={`Joined ${w.from} to ${w.to}, active`} /></td>
                  <td className="py-1 pl-2 text-right"><N cell={w.back} env={env} drill={drill} title={`Back ${w.from} to ${w.to} after a week or more away`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs" style={{ color: "var(--muted)" }}>Nothing counted in these weeks.</p>}
      <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        WAU = kept + joined + back. Kept % is of the people active the 7 days before{cf ? `; * when those 7 days begin before ${dayLabel(cf)}` : ""}.
      </p>
    </div>
  );
}
