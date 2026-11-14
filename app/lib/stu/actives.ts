// ACTIVES (14 Nov 2026, the owner: "i want better dau, mau and wau reporting"): the numbers of the Active users panel
// at the top of /usage. DAU, WAU and MAU against the period before, returning people, stickiness, a 60-day chart, the
// split by channel, plan and setup, retention by sign-up day and week, and week over week.
//
// Who is active on which day, and on which channels, is model.ts activity() (the one definition the Active students
// tile and the Engagement panel use too). This file only counts. Type imports only, so `node --test
// scripts/stu-actives.test.mjs` reads it as is; actives-section.ts hands it the activity model and the people in scope.
import type { Activity, Cell, Filters } from "./model";

/** model.ts CH_WEB, CH_MSG and CH_CALL (a test checks they agree). */
export const BIT = { web: 1, msg: 2, call: 4 } as const;

export interface ActivesInput {
  act: Activity;
  /** people in scope (team and test accounts out unless "include internal") */
  scope: Set<number>;
  /** a person's join time, epoch ms */
  joined: (u: number) => number;
  /** first real payment, epoch ms, or null */
  paidAt: (u: number) => number | null;
  /** onboarded, epoch ms, or null */
  onboardedAt: (u: number) => number | null;
  /** the IST day counting starts (the reset line); nothing before it was counted. Null: everything counts */
  countFromDay: string | null;
  /** the IST day now: cohort cells past it are not reached yet */
  today: string;
}

// ------------------------------------------------------------------ helpers (as model.ts, kept here: no imports)

const IST_MS = 330 * 60_000;
const istDay = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 800; d = addDays(d, 1)) out.push(d);
  return out;
};
const weekOf = (day: string): string => addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
const cellOf = (users: Iterable<number>): Cell => {
  const u = [...new Set(users)];
  return { v: u.length, users: u };
};
const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

// ------------------------------------------------------------------ shapes

export interface PeriodTile {
  cell: Cell;
  /** the same count for the period just before, or null when that period reaches before counting started */
  prev: number | null;
  /** first and last IST day of the period */
  from: string;
  to: string;
  /** the period starts before counting started: it counts from countFromDay */
  partial: boolean;
}

export interface RatioTile {
  value: number | null;
  /** the same ratio a week earlier, or null when its 30 days reach before counting started */
  prev: number | null;
  num: Cell;
  den: Cell;
}

export interface ChartDay {
  day: string;
  new: Cell;
  returning: Cell;
  wau: number;
  mau: number;
  /** the 7 or 30 days behind this point reach before counting started */
  wauPartial: boolean;
  mauPartial: boolean;
}

export interface SplitRow {
  key: string;
  label: string;
  group: "channel" | "plan" | "setup";
  /** DAU, WAU, MAU */
  cells: [Cell, Cell, Cell];
  /** a row that is only shown when someone is in it */
  rare?: boolean;
}

export type CohortState = "done" | "so_far" | "not_yet";
export interface CohortCell {
  n: number;
  back: Cell;
  /** people whose span has begun */
  eligible: number;
  value: number | null;
  /** done: every eligible person's span is over. so_far: some spans end today or later. not_yet: nobody's has begun */
  state: CohortState;
}
export interface CohortRow {
  /** IST day, or the Monday of the week */
  key: string;
  /** the week begins before counting started (counts from countFromDay) */
  partial?: boolean;
  size: Cell;
  cells: CohortCell[];
}

export interface WeekRow {
  from: string;
  to: string;
  wau: Cell;
  /** of them: active the 7 days before too */
  kept: Cell;
  /** of them: joined in these 7 days */
  joined: Cell;
  /** of them: back after a week or more away */
  back: Cell;
  /** active the 7 days before */
  prevWau: number | null;
  /** kept as a % of the 7 days before */
  keptPct: number | null;
  /** these 7 days begin before counting started */
  partial: boolean;
  /** the 7 days before begin before counting started */
  prevPartial: boolean;
}

export interface ActivesBody {
  end: string;
  today: string;
  countFromDay: string | null;
  dau: PeriodTile;
  wau: PeriodTile;
  mau: PeriodTile;
  returning: Cell;
  fresh: Cell;
  stickiness: RatioTile & { avgDau: number; avgDays: number };
  wauMau: RatioTile;
  chart: ChartDay[];
  split: { totals: [Cell, Cell, Cell]; rows: SplitRow[] };
  cohorts: { day: CohortRow[]; week: CohortRow[]; dayOnboarded: CohortRow[]; weekOnboarded: CohortRow[] };
  weeks: WeekRow[];
}

/** Retention spans after the IST sign-up day: D1 is the next day; the others are any day in their span. */
export const COHORT_SPANS: { n: number; from: number; to: number }[] = [
  { n: 1, from: 1, to: 1 },
  { n: 3, from: 2, to: 3 },
  { n: 7, from: 4, to: 7 },
  { n: 14, from: 8, to: 14 },
  { n: 30, from: 15, to: 30 },
];
export const COHORT_RULE = "D1: active on the IST day after sign-up. D3, D7, D14, D30: active on any day of days 2 to 3, 4 to 7, 8 to 14 and 15 to 30 after it. Out of the people whose span has begun; a span still running shows what it has so far.";

export const CHART_DAYS = 60;
export const COHORT_DAYS = 21;
export const COHORT_WEEKS = 8;
export const WEEKS = 12;

// ------------------------------------------------------------------ the panel

/** Every number of the Active users panel. `mark` passes each cell through (the Overview's Refs.cell collects people). */
export function activesBody(f: Pick<Filters, "end">, x: ActivesInput, mark: (c: Cell) => Cell = (c) => c): ActivesBody {
  const end = f.end;
  const cf = x.countFromDay;
  const C = (users: Iterable<number>) => mark(cellOf(users));

  // In-scope people active each day, and each person's channel bits by day.
  const byDay = new Map<string, number[]>();
  for (const [u, m] of x.act.days) {
    if (!x.scope.has(u)) continue;
    for (const day of m.keys()) (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(u);
  }
  const bits = (u: number, day: string) => x.act.ch.get(u)?.get(day) ?? 0;
  const joinDay = new Map<number, string>();
  const jd = (u: number) => joinDay.get(u) ?? joinDay.set(u, istDay(x.joined(u))).get(u)!;
  const activeIn = (from: string, to: string): Set<number> => {
    const out = new Set<number>();
    for (const day of dayRange(from, to)) for (const u of byDay.get(day) ?? []) out.add(u);
    return out;
  };
  /** the whole period was counted */
  const counted = (from: string) => cf == null || from >= cf;

  const period = (n: number): PeriodTile & { set: Set<number> } => {
    const from = addDays(end, -(n - 1));
    const set = activeIn(from, end);
    const pFrom = addDays(end, -(2 * n - 1));
    return { cell: C(set), set, prev: counted(pFrom) ? activeIn(pFrom, addDays(end, -n)).size : null, from, to: end, partial: !counted(from) };
  };
  const dau = period(1);
  const wau = period(7);
  const mau = period(30);
  const strip = ({ set: _s, ...t }: PeriodTile & { set: Set<number> }): PeriodTile => t;

  const returning = [...dau.set].filter((u) => jd(u) < end);
  const fresh = [...dau.set].filter((u) => jd(u) >= end);

  // Stickiness: the 7-day average DAU (counted days only) over MAU; a week earlier when that was all counted.
  const avgDauTo = (to: string) => {
    const ds = dayRange(addDays(to, -6), to).filter((day) => cf == null || day >= cf);
    return { avg: ds.reduce((a, day) => a + (byDay.get(day)?.length ?? 0), 0) / Math.max(1, ds.length), n: ds.length };
  };
  const stickAt = (to: string) => {
    const m = activeIn(addDays(to, -29), to).size;
    return m ? Math.round((avgDauTo(to).avg / m) * 1000) / 10 : null;
  };
  const wauMauAt = (to: string) => pct(activeIn(addDays(to, -6), to).size, activeIn(addDays(to, -29), to).size);
  const weekAgo = addDays(end, -7);
  const weekAgoCounted = counted(addDays(weekAgo, -29));
  const avg = avgDauTo(end);
  const mauCell = mau.cell;
  const stickiness = {
    value: mau.set.size ? Math.round((avg.avg / mau.set.size) * 1000) / 10 : null,
    prev: weekAgoCounted ? stickAt(weekAgo) : null,
    num: dau.cell, den: mauCell, avgDau: Math.round(avg.avg * 10) / 10, avgDays: avg.n,
  };
  const wauMau = { value: pct(wau.set.size, mau.set.size), prev: weekAgoCounted ? wauMauAt(weekAgo) : null, num: wau.cell, den: mauCell };

  // 60 days to the end, from the day counting starts when that is later.
  let chartFrom = addDays(end, -(CHART_DAYS - 1));
  if (cf && cf > chartFrom) chartFrom = cf <= end ? cf : end;
  const chart: ChartDay[] = dayRange(chartFrom, end).map((day) => {
    const on = byDay.get(day) ?? [];
    return {
      day,
      new: C(on.filter((u) => jd(u) >= day)),
      returning: C(on.filter((u) => jd(u) < day)),
      wau: activeIn(addDays(day, -6), day).size,
      mau: activeIn(addDays(day, -29), day).size,
      wauPartial: !counted(addDays(day, -6)),
      mauPartial: !counted(addDays(day, -29)),
    };
  });

  // The split: channels over each period's days, plan and setup as of its last day.
  const periods = [dau, wau, mau];
  const chOver = (u: number, from: string): number => {
    let b = 0;
    for (const [day] of x.act.days.get(u) ?? []) if (day >= from && day <= end) b |= bits(u, day);
    return b;
  };
  /** it happened on or before the end day */
  const byEnd = (t: number | null) => t != null && istDay(t) <= end;
  const rows: { key: string; label: string; group: SplitRow["group"]; test: (u: number, b: number) => boolean; rare?: true }[] = [
    { key: "web_only", label: "Web only", group: "channel", test: (_u, b) => (b & BIT.web) > 0 && !(b & BIT.msg) },
    { key: "msg_only", label: "Messaging only (WhatsApp, iMessage)", group: "channel", test: (_u, b) => (b & BIT.msg) > 0 && !(b & BIT.web) },
    { key: "web_msg", label: "Web and messaging", group: "channel", test: (_u, b) => (b & BIT.web) > 0 && (b & BIT.msg) > 0 },
    { key: "call_only", label: "Calls only", group: "channel", rare: true, test: (_u, b) => b === BIT.call },
    { key: "unknown", label: "Channel not known", group: "channel", rare: true, test: (_u, b) => b === 0 },
    { key: "call", label: "Had a call", group: "channel", test: (_u, b) => (b & BIT.call) > 0 },
    { key: "paid", label: "Paid (real payment by then)", group: "plan", test: (u) => byEnd(x.paidAt(u)) },
    { key: "free", label: "Free", group: "plan", test: (u) => !byEnd(x.paidAt(u)) },
    { key: "onboarded", label: "Onboarded (by then)", group: "setup", test: (u) => byEnd(x.onboardedAt(u)) },
    { key: "not_onboarded", label: "Not onboarded", group: "setup", test: (u) => !byEnd(x.onboardedAt(u)) },
  ];
  const chOf = periods.map((p) => new Map([...p.set].map((u) => [u, chOver(u, p.from)])));
  const split = {
    totals: [dau.cell, wau.cell, mau.cell] as [Cell, Cell, Cell],
    rows: rows.map((r) => ({
      key: r.key, label: r.label, group: r.group, ...(r.rare ? { rare: true } : {}),
      cells: periods.map((p, k) => C([...p.set].filter((u) => r.test(u, chOf[k].get(u)!)))) as [Cell, Cell, Cell],
    })),
  };

  // Retention by sign-up day (last 21 days) and week (last 8), everyone and onboarded only.
  const members = new Map<string, number[]>();
  for (const u of x.scope) (members.get(jd(u)) ?? members.set(jd(u), []).get(jd(u))!).push(u);
  const activeDays = (u: number) => x.act.days.get(u);
  const cohortRow = (key: string, us: number[], partial?: boolean): CohortRow => ({
    key, ...(partial ? { partial } : {}), size: C(us),
    cells: COHORT_SPANS.map(({ n, from, to }) => {
      const eligible = us.filter((u) => addDays(jd(u), from) <= x.today);
      const back = eligible.filter((u) => {
        const a = addDays(jd(u), from);
        const b = addDays(jd(u), to);
        for (const day of activeDays(u)?.keys() ?? []) if (day >= a && day <= b) return true;
        return false;
      });
      const state: CohortState = !eligible.length ? "not_yet" : eligible.some((u) => addDays(jd(u), to) >= x.today) ? "so_far" : "done";
      return { n, back: C(back), eligible: eligible.length, value: eligible.length ? pct(back.length, eligible.length) : null, state };
    }),
  });
  const onb = (us: number[]) => us.filter((u) => x.onboardedAt(u) != null);
  const cohortDays = dayRange(addDays(end, -(COHORT_DAYS - 1)), end).filter((day) => cf == null || day >= cf).reverse();
  const weekKeys = Array.from({ length: COHORT_WEEKS }, (_, k) => addDays(weekOf(end), -7 * k)).filter((w) => cf == null || addDays(w, 6) >= cf);
  const inWeek = (w: string) => dayRange(w, addDays(w, 6) < end ? addDays(w, 6) : end).flatMap((day) => members.get(day) ?? []);
  const cohorts = {
    day: cohortDays.map((day) => cohortRow(day, members.get(day) ?? [])),
    dayOnboarded: cohortDays.map((day) => cohortRow(day, onb(members.get(day) ?? []))),
    week: weekKeys.map((w) => cohortRow(w, inWeek(w), !counted(w))),
    weekOnboarded: weekKeys.map((w) => cohortRow(w, onb(inWeek(w)), !counted(w))),
  };

  // Week over week: 7-day blocks ending on the end day, while any of a block was counted.
  const weeks: WeekRow[] = [];
  for (let k = 0; k < WEEKS; k++) {
    const to = addDays(end, -7 * k);
    if (cf != null && to < cf) break;
    const from = addDays(to, -6);
    const cur = activeIn(from, to);
    const pTo = addDays(from, -1);
    const pFrom = addDays(pTo, -6);
    const prevSeen = cf == null || pTo >= cf;
    const prev = prevSeen ? activeIn(pFrom, pTo) : new Set<number>();
    const kept = [...cur].filter((u) => prev.has(u));
    const joined = [...cur].filter((u) => !prev.has(u) && jd(u) >= from);
    const back = [...cur].filter((u) => !prev.has(u) && jd(u) < from);
    weeks.push({
      from, to, wau: C(cur), kept: C(kept), joined: C(joined), back: C(back),
      prevWau: prevSeen ? prev.size : null, keptPct: prevSeen ? pct(kept.length, prev.size) : null,
      partial: !counted(from), prevPartial: prevSeen && !counted(pFrom),
    });
  }

  return {
    end, today: x.today, countFromDay: cf,
    dau: strip(dau), wau: strip(wau), mau: strip(mau),
    returning: C(returning), fresh: C(fresh),
    stickiness, wauMau, chart, split, cohorts, weeks,
  };
}
