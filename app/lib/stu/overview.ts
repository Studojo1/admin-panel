// Stu Overview (the admin root, 2 Nov 2026): one screen, one section per API call.
// Every number here comes from the same model functions the Stu pages use
// (DAILY_METRICS, funnel, arriveCells, sources, dropoffs, ratios and
// retention), so the Overview and the pages always agree. This file only picks,
// groups and shapes; it adds no metric of its own except the median call length
// and the median time between the funnel bars it shows.
import {
  type BasisBar, type Cell, type Filters, type StuData, type WireUser, ANON_STEPS, DAILY_METRICS, FEATURES, FEATURE_LABELS, activity, activitySource, fmtInr, istDay, NON_DESK, STEP_BY_KEY, USER_STEPS,
  addDays, arriveCells, cellOf, cohortOf, compareBasis, compareText, dataNow, dayRange, dropoffs, funnel, funnelBasis, liveDays, median, paidLive, pct, ratios, retention, signupSourceText, sources, stepAt, scopeUsers,
} from "./model";

export { funnelBasis } from "./model";

export const OV_SECTIONS = ["insights", "usage", "power", "kpis", "funnel", "trends", "sources", "calls", "dropoffs", "engagement", "feed", "alerts", "actives"] as const;
export type OvSection = (typeof OV_SECTIONS)[number];

/** A person as the drill-down list shows them. */
export type OvPerson = Pick<WireUser, "id" | "email" | "name" | "internal" | "joined" | "existing" | "ch">;

/** Every section answer carries the people its cells point at (by index into the server's user list). */
export interface OvEnvelope<T> {
  section: OvSection;
  generatedAt: string;
  journeyLive: boolean;
  /** this database: staging or production */
  env: string;
  ms: number;
  people: Record<number, OvPerson>;
  /** visitor id -> person index, for visitors who became an account */
  vlinks: Record<string, number>;
  body: T;
}

const VISITOR_CAP = 1000;

/** Collects the people (and visitor links) the cells of one section point at. */
export class Refs {
  people: Record<number, OvPerson> = {};
  vlinks: Record<string, number> = {};
  private vmap: Map<string, number> | null = null;
  constructor(private d: StuData) {}
  cell(c: Cell): Cell {
    for (const i of c.users) {
      const u = this.d.users[i];
      if (u && !this.people[i]) this.people[i] = { id: u.id, email: u.email, name: u.name, internal: u.internal, joined: u.joined, existing: u.existing, ch: u.ch };
    }
    if (!c.visitors) return c;
    const visitors = c.visitors.slice(0, VISITOR_CAP);
    if (!this.vmap) this.vmap = new Map(this.d.visitors.filter((v) => v.u >= 0).map((v) => [v.id, v.u]));
    for (const v of visitors) {
      const u = this.vmap.get(v);
      if (u != null) {
        this.vlinks[v] = u;
        this.cell(cellOf([u]));
      }
    }
    return { ...c, visitors };
  }
}

const metric = (key: string) => {
  const m = DAILY_METRICS.find((x) => x.key === key);
  if (!m) throw new Error(`unknown daily metric ${key}`);
  return m;
};

// -------------------------------------------------------------------- KPI tiles

export const KPI_TILES = [
  { key: "visitors", label: "Visitors", metric: "visitors" },
  { key: "signups", label: "Sign-ups", metric: "signups" },
  { key: "onboarded", label: "Onboarded", metric: "onboarded", sub: "call done, profile ready" },
  { key: "active", label: "Active students", metric: "active", sub: "did something themselves" },
  { key: "job_opens", label: "Jobs opened", metric: "job_opens" },
  { key: "apply_clicks", label: "Apply clicks", metric: "apply_clicks" },
  { key: "outreach", label: "Outreach started", metric: "outreach_people", sub: "people, first time" },
  { key: "paid", label: "Paid", metric: "paid_users", sub: "people, real payments" },
  { key: "revenue", label: "Revenue", metric: "revenue", inr: true, sub: "real, less refunds" },
] as const;

export interface KpiTile {
  key: string;
  label: string;
  sub?: string;
  inr?: boolean;
  cell: Cell;
  prev: number | null;
  /**
   * ADMIN-AUDIT-STU (14 Nov 2026): the range ends today and this metric is counted per IST day only, so it cannot be
   * cut at this time of day: shown as "so far", with no % against a whole day.
   */
  soFar?: boolean;
  spark: { day: string; v: number; inRange: boolean }[];
  source: string;
}

/** The range just before this one, the same number of days (not cut at a time: compareBasis does that). */
export function previousRange(f: Filters): Filters {
  const n = dayRange(f.start, f.end).length;
  return { ...f, start: addDays(f.start, -n), end: addDays(f.start, -1) };
}

/** ADMIN-FIX (5 Nov 2026): the range before reaches back past the count-from line, so it has nothing to compare with. */
export const beforeReset = (d: StuData, pf: Filters): boolean => d.countFrom != null && pf.start < istDay(d.countFrom);

/** An account made before the count-from line (or used first a day or more after it was made): an existing studojo.com account. */
export const existingAccount = (d: StuData, u: WireUser): boolean => u.existing || (d.countFrom != null && u.created < d.countFrom);

export function kpis(d: StuData, f: Filters, refs: Refs) {
  const scope = new Set(scopeUsers(d, f));
  const days = new Set(dayRange(f.start, f.end));
  // ADMIN-AUDIT-STU (14 Nov 2026): a range that ends today is compared with the period before cut at this time of day.
  const cmp = compareBasis(f, dataNow(d));
  const pf = cmp.pf;
  const prevDays = new Set(dayRange(pf.start, pf.end));
  const sparkDays = dayRange(addDays(f.end, -13), f.end);
  const tiles: KpiTile[] = KPI_TILES.map((t) => {
    const m = metric(t.metric);
    const cell = refs.cell(m.cell(d, f, days, scope));
    const prev = m.cell(d, pf, prevDays, scope, cmp.until);
    const soFar = cmp.soFar && !m.timed;
    // No "vs" against a period before the reset, or against a visitor count that was not tracked all of that period,
    // or (soFar) against whole days when the metric cannot be cut at this time.
    const noPrev = soFar || prev.na || prev.old || prev.trackedFrom != null || beforeReset(d, pf);
    return {
      key: t.key, label: t.label, sub: "sub" in t ? t.sub : undefined, inr: "inr" in t ? t.inr : undefined,
      cell, prev: noPrev ? null : prev.v, ...(soFar ? { soFar } : {}),
      spark: sparkDays.map((day) => ({ day, v: m.cell(d, f, new Set([day]), scope).v, inRange: days.has(day) })),
      source: m.source(d),
    };
  });
  const test = refs.cell(metric("test_payments").cell(d, f, days, scope));
  // ADMIN-FIX (5 Nov 2026): the sign-ups named, new Google accounts against older studojo.com accounts on their first Stu day.
  const su = tiles.find((t) => t.key === "signups")!.cell;
  const existing = su.users.filter((i) => existingAccount(d, d.users[i]));
  const signupsSplit = { fresh: refs.cell(cellOf(su.users.filter((i) => !existingAccount(d, d.users[i])))), existing: refs.cell(cellOf(existing)) };
  return { tiles, testPayments: test, signupsSplit, prevStart: pf.start, prevEnd: pf.end, until: cmp.until, vs: compareText(f, cmp) };
}

// ----------------------------------------------------------------------- funnel

/** The Overview's short funnel: the nested spine plus the steps the owner reads daily. */
export const FUNNEL_KEY_STEPS = ["signed_up", "call_started", "call_completed", "onboarded", "saw_jobs", "opened_job", "apply_click", "outreach_started", "paid"];

export interface FunnelBar extends BasisBar {
  n: string;
  label: string;
  phase: string;
  /** median ms from the bar it is measured from */
  medianMs: number | null;
  /** Onboarded: people in the range who onboarded without the call steps above (a typed setup), not in the bar */
  outside?: Cell;
}

function visitorGap(d: StuData, f: Filters, a: string, b: string, days: Set<string>): number | null {
  const gaps: number[] = [];
  for (const v of d.visitors) {
    if (!(v.days[b] ?? []).some((x) => days.has(x))) continue;
    const ta = v.first[a];
    const tb = v.first[b];
    if (ta != null && tb != null && tb >= ta) gaps.push(tb - ta);
  }
  return median(gaps);
}

/** Median time from the last pre-sign-up step a person's visitor id did to their sign-up. */
function signupGap(d: StuData, users: number[]): number | null {
  const set = new Set(users);
  const gaps: number[] = [];
  for (const v of d.visitors) {
    if (v.u < 0 || !set.has(v.u)) continue;
    const before = ANON_STEPS.map((s) => v.first[s.key]).filter((t): t is number => t != null && t <= d.users[v.u].joined);
    if (before.length) gaps.push(d.users[v.u].joined - Math.max(...before));
  }
  return median(gaps);
}

function userGap(d: StuData, users: number[], a: string, b: string): number | null {
  const gaps: number[] = [];
  for (const i of users) {
    const ta = stepAt(d, d.users[i], a);
    const tb = stepAt(d, d.users[i], b);
    if (ta != null && tb != null && tb >= ta) gaps.push(tb - ta);
  }
  return median(gaps);
}

export function overviewFunnel(d: StuData, f: Filters, refs: Refs) {
  const arrive = arriveCells(d, f);
  const nested = funnel(d, f, true);
  const days = new Set(dayRange(f.start, f.end));
  // A step the live log has never seen, with no product table behind it, is not
  // tracked yet: it is shown as such and skipped by the % and the biggest drop.
  const seen = new Set(d.journeySteps.map((s) => s.step));
  const untracked = (key: string) => {
    const def = STEP_BY_KEY[key];
    if (!def || !d.journeyLive || key === "signed_up" || (def.truth && d.truthOn[key])) return false;
    return !def.journey.some((j) => seen.has(j));
  };
  const anonBars: FunnelBar[] = ANON_STEPS.map((s) => ({
    key: s.key, n: s.n, label: s.label, phase: s.phase, anon: true, gate: false, cell: refs.cell(arrive[s.key]), pctPrev: null, medianMs: null,
    fromKey: null, untracked: untracked(s.key), ...("partial" in s && s.partial ? { partial: true } : {}),
  }));
  const userRows = nested.rows.filter((r) => !r.test);
  const withPaid = paidLive(d);
  // Onboarded people the nested bar leaves out: they set up without the call steps above it.
  const cohort = nested.cohort;
  const onboardedBar = userRows.find((r) => r.key === "onboarded");
  const outside = onboardedBar
    ? refs.cell(cellOf(cohort.filter((i) => stepAt(d, d.users[i], "onboarded") != null && !onboardedBar.cell.users.includes(i))))
    : undefined;
  const build = (keys: string[] | null): { bars: FunnelBar[]; drop: string | null } => {
    const rows = keys ? userRows.filter((r) => keys.includes(r.key)) : userRows;
    const bars: FunnelBar[] = [
      ...anonBars.map((b) => ({ ...b })),
      ...rows.map((r) => ({
        key: r.key, n: r.n, label: r.label, phase: STEP_BY_KEY[r.key]?.phase ?? "", anon: false, gate: r.gate,
        cell: refs.cell(r.cell), pctPrev: null, medianMs: null as number | null, fromKey: null, untracked: untracked(r.key),
        ...(r.key === "onboarded" && outside && outside.v > 0 ? { outside } : {}),
      })),
    ];
    const drop = funnelBasis(bars, withPaid);
    for (const b of bars) {
      const a = bars.find((x) => x.key === b.fromKey);
      if (!a) continue;
      if (b.anon) b.medianMs = visitorGap(d, f, a.key, b.key, days);
      else if (a.anon) b.medianMs = signupGap(d, b.cell.users);
      else b.medianMs = userGap(d, b.cell.users, a.key, b.key);
    }
    return { bars, drop };
  };
  const key = build(FUNNEL_KEY_STEPS);
  const all = build(null);
  return { key: key.bars, all: all.bars, dropKey: key.drop, dropAll: all.drop, cohort: cohort.length, paidLive: withPaid, earlierPaid: earlierPayers(d, f, refs) };
}

/**
 * ADMIN-AUDIT-STU (14 Nov 2026): the Paid and Revenue tiles count every real payment in the range; the Funnel and Top
 * sources count only the people who joined in range. This is the difference: people who joined before the range and
 * paid in it, and what they paid in it, so the panels reconcile with the tiles.
 */
export function earlierPayers(d: StuData, f: Filters, refs: Refs): { cell: Cell; revenue: number } {
  const scope = new Set(scopeUsers(d, f));
  const days = new Set(dayRange(f.start, f.end));
  const cohort = new Set(cohortOf(d, f));
  const rev = new Map<number, number>();
  for (const [k, u, day, , amt] of d.act) if (k === "pay" && scope.has(u) && days.has(day) && !cohort.has(u)) rev.set(u, (rev.get(u) ?? 0) + amt);
  return { cell: refs.cell(cellOf([...rev.keys()])), revenue: [...rev.values()].reduce((a, b) => a + b, 0) };
}

// ----------------------------------------------------------------------- trends

export const TREND_SERIES = [
  { key: "visitors", label: "Visitors", metric: "visitors" },
  { key: "signups", label: "Sign-ups", metric: "signups" },
  { key: "onboarded", label: "Onboarded", metric: "onboarded" },
  { key: "paid", label: "Paid", metric: "paid_users" },
] as const;

export const TREND_RATES = [
  { key: "visit_signup", label: "Visit to sign-up", num: "signups", den: "visitors" },
  { key: "signup_onboarded", label: "Sign-up to onboarded", num: "onboarded", den: "signups" },
  { key: "signup_paid", label: "Sign-up to paid", num: "paid", den: "signups" },
] as const;

export function trends(d: StuData, f: Filters, refs: Refs) {
  const days = dayRange(addDays(f.end, -29), f.end);
  const scope = new Set(scopeUsers(d, f));
  // ADMIN-AUDIT-STU (14 Nov 2026): a day before the count-from line was not counted: no data, not a zero.
  const from = d.countFrom != null ? istDay(d.countFrom) : null;
  const series = TREND_SERIES.map((s) => {
    const m = metric(s.metric);
    return {
      key: s.key, label: s.label, na: false,
      cells: days.map((day) => (from && day < from ? { v: 0, users: [], na: true } : refs.cell(m.cell(d, f, new Set([day]), scope)))),
    };
  });
  for (const s of series) s.na = s.cells.every((c) => c.na);
  const byKey = Object.fromEntries(series.map((s) => [s.key, s.cells.map((c) => c.v)]));
  // Rates over a trailing 7 days, so one quiet day does not swing the line to zero. A day either series did not
  // track (visitors before the first page_view) is left out of both sums.
  const naKey = Object.fromEntries(series.map((s) => [s.key, s.cells.map((c) => Boolean(c.na))]));
  const sum = (xs: number[], k: number, skip: boolean[]) => xs.slice(Math.max(0, k - 6), k + 1).reduce((a, b, j) => a + (skip[Math.max(0, k - 6) + j] ? 0 : b), 0);
  const rates = TREND_RATES.map((r) => {
    const skip = days.map((_, k) => naKey[r.num][k] || naKey[r.den][k]);
    return { key: r.key, label: r.label, values: days.map((_, k) => pct(sum(byKey[r.num], k, skip), sum(byKey[r.den], k, skip))) };
  });
  return { days, series, rates, countFromDay: from };
}

// ---------------------------------------------------------------------- sources

export interface SourceRow {
  key: string;
  /** the channel's name, for a channel row */
  label?: string;
  signups: Cell;
  onboarded: Cell;
  paid: Cell;
  revenue: Cell;
  other?: number;
}

export function overviewSources(d: StuData, f: Filters, refs: Refs, channelName: (k: string) => string = (k) => k) {
  const split = (by: "channel" | "source" | "campaign") => {
    const s = sources(d, f, by);
    const rows: SourceRow[] = s.rows.map((r) => ({
      key: r.key, ...(by === "channel" ? { label: channelName(r.key) } : {}),
      signups: cellOf(r.users), onboarded: r.steps.onboarded, paid: r.steps.paid, revenue: r.revenue,
    }));
    const top = rows.slice(0, 8);
    const rest = rows.slice(8);
    if (rest.length) {
      const merge = (pick: (r: SourceRow) => Cell, sumV = false) => {
        const users = rest.flatMap((r) => pick(r).users);
        return cellOf(users, sumV ? rest.reduce((a, r) => a + pick(r).v, 0) : undefined);
      };
      top.push({ key: "Other", signups: merge((r) => r.signups), onboarded: merge((r) => r.onboarded), paid: merge((r) => r.paid), revenue: merge((r) => r.revenue, true), other: rest.length });
    }
    for (const r of top) for (const c of [r.signups, r.onboarded, r.paid, r.revenue]) refs.cell(c);
    return { rows: top, total: s.cohort.length };
  };
  // ADMIN-FIX (5 Nov 2026): channels first (they read the referrer, so a Google search is not "(none)"), as /sources.
  return { channel: split("channel"), source: split("source"), campaign: split("campaign"), earlierPaid: earlierPayers(d, f, refs) };
}

// ------------------------------------------------------------------- call health

export const CALL_OUTCOME_LABELS: Record<string, string> = {
  completed: "Completed",
  failed: "Failed",
  dropped: "Dropped",
  hung_up_first_minute: "Hung up in first minute",
  never_connected: "Never connected",
  no_resume: "Ended, no resume",
  no_answers: "Ended before the answers",
  ended_early: "Ended early",
  live: "Live now",
};

export function calls(d: StuData, f: Filters, refs: Refs) {
  const dr = dropoffs(d, f);
  const ra = ratios(d, f);
  const cohort = new Set(cohortOf(d, f));
  const mine = d.calls.filter((c) => cohort.has(c[0]) && NON_DESK(c));
  const started = mine.filter((c) => c[5] != null);
  const durations = started.map((c) => c[7]).filter((x): x is number => x != null && x > 0);
  const outcomes = dr.callOutcomes.map((o) => ({ key: o.key, label: CALL_OUTCOME_LABELS[o.key] ?? o.key, cell: refs.cell(o.cell) }));
  const CALL_REASONS = new Set(["mic_denied", "dropped", "hung_early", "no_resume", "no_answers"]);
  const reasons = dr.reasons
    .filter((r) => CALL_REASONS.has(r.key) || r.key.startsWith("fail_"))
    .map((r) => ({ key: r.key, label: r.label, cell: refs.cell(r.cell), of: refs.cell(r.of) }))
    .filter((r) => r.cell.v > 0 || r.cell.na)
    .sort((a, b) => b.cell.v - a.cell.v);
  const rate = (key: string) => {
    const r = ra.find((x) => x.key === key)!;
    return { label: r.label, value: r.value, num: refs.cell(r.num), den: refs.cell(r.den) };
  };
  return {
    total: refs.cell(cellOf(mine.map((c) => c[0]), mine.length)),
    started: refs.cell(cellOf(started.map((c) => c[0]), started.length)),
    outcomes,
    reasons,
    micDenied: rate("mic_denied"),
    failCalls: rate("call_fail_calls"),
    failPeople: rate("call_fail"),
    medianSeconds: median(durations),
  };
}

// ----------------------------------------------------------------------- drop-offs

export function overviewDropoffs(d: StuData, f: Filters, refs: Refs) {
  const dr = dropoffs(d, f);
  const total = dr.stuck.reduce((a, s) => a + s.cell.v, 0);
  const stuck = dr.stuck.map((s) => ({ ...s, phase: STEP_BY_KEY[s.key]?.phase ?? "", cell: refs.cell(s.cell) }));
  const KEEP = ["no_call", "completed_not_onboarded", "no_desk", "no_jobs", "jobs_no_save"];
  const reasons = dr.reasons.filter((r) => KEEP.includes(r.key)).map((r) => ({ key: r.key, label: r.label, cell: refs.cell(r.cell), of: refs.cell(r.of) }));
  return { stuck, total, reasons };
}

// --------------------------------------------------------- engagement, retention

export const HEAT_DAYS = [1, 2, 3, 7, 14, 30] as const;

export function engagement(d: StuData, f: Filters, refs: Refs) {
  const weeks = retention(d, f, false);
  const headline = ([1, 7, 30] as const).map((n) => {
    const back = weeks.flatMap((w) => w.d[`d${n}`]?.back.users ?? []);
    const eligible = weeks.flatMap((w) => w.d[`d${n}`]?.eligible.users ?? []);
    // ADMIN-AUDIT-STU (14 Nov 2026): day N is today for some of them: the day is not over, so it is "so far".
    const soFar = weeks.some((w) => w.d[`d${n}`]?.soFar);
    return {
      n,
      back: refs.cell({ ...cellOf(back), na: !d.journeyLive }),
      eligible: refs.cell(cellOf(eligible)),
      value: d.journeyLive ? pct(back.length, eligible.length) : null,
      ...(soFar ? { soFar } : {}),
    };
  });
  const heat = retention(d, f, false, "day", HEAT_DAYS).slice(0, 14).map((r) => ({
    day: r.week,
    size: refs.cell(r.size),
    d: HEAT_DAYS.map((n) => {
      const x = r.d[`d${n}`];
      return { n, back: refs.cell(x.back), eligible: x.eligible.v, value: x.value, ...(x.soFar ? { soFar: true } : {}) };
    }),
  }));
  const scope = new Set(scopeUsers(d, f));
  const days = new Set(dayRange(f.start, f.end));
  const m = (key: string) => refs.cell(metric(key).cell(d, f, days, scope));
  const active = m("active");
  const chats = m("chats");
  const chatters = m("chatters");
  const jobOpens = m("job_opens");
  const applies = m("apply_clicks");
  const saved = m("saved");
  const per = (n: number) => (active.na || active.v <= 0 ? null : Math.round((n / active.v) * 10) / 10);
  return {
    headline, heat, active, chats, chatters, jobOpens, applies, saved,
    perActive: { chats: per(chats.v), jobs: per(jobOpens.v), applies: per(applies.v) },
  };
}

// --------------------------------------------------------------------- live feed

export interface FeedRow {
  id: string;
  at: number;
  step: string;
  /** the STEPS label it counts as, or the raw name */
  label: string;
  phase: string;
  who: string;
  /** person index for the journey link, or -1 */
  u: number;
  source: string;
}

/** a***@gmail.com */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email ? `${email.slice(0, 1)}***` : "";
  return `${name.slice(0, 1)}***@${domain}`;
}

// ------------------------------------------------------------------------ alerts

export interface Alert {
  key: string;
  level: "critical" | "warning";
  text: string;
  href?: string;
  cell?: Cell;
}

export const CALL_FAIL_ALERT_PCT = 20;

/** The alerts that need only the dataset; the zero-today check is added by the server (it reads the journey log by day). */
export function alertsFromData(d: StuData, f: Filters, refs: Refs): Alert[] {
  const out: Alert[] = [];
  // ADMIN-AUDIT-STU 2 (14 Nov 2026): the alert is on people, not attempts: one student tapping retry on a blocked mic is
  // one person, however many rows it logs.
  const fail = ratios(d, f).find((x) => x.key === "call_fail")!;
  if (fail.value != null && fail.value > CALL_FAIL_ALERT_PCT) {
    out.push({ key: "call_fail", level: "critical", text: `${fail.value}% of people who tried a call had a failed attempt (${fail.num.v} of ${fail.den.v}, mic denied included), over the ${CALL_FAIL_ALERT_PCT}% line`, cell: refs.cell(fail.num), href: "/drop-offs" });
  }
  return out;
}

/** journey step name -> label for the feed and the zero-today alert */
export function journeyLabel(step: string): { label: string; phase: string } {
  for (const s of [...ANON_STEPS, ...USER_STEPS]) if ((s.journey as readonly string[]).includes(step)) return { label: s.label, phase: s.phase };
  if (step === "call_failed") return { label: "Call failed", phase: "Call" };
  if (step === "page_view") return { label: "Viewed", phase: "Arrive" };
  if (step === "page_engaged") return { label: "Stayed on a page", phase: "Arrive" };
  if (step === "call_ended") return { label: "Call ended", phase: "Call" };
  return { label: step, phase: "" };
}

// ------------------------------------------------------------ usage (DAU, WAU)

/** person index -> sorted IST days active, people in scope only */
function activeDays(d: StuData, scope: Set<number>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const [u, m] of activity(d).days) if (scope.has(u)) out.set(u, [...m.keys()].sort());
  return out;
}

/** People active on at least one day from `from` to `to` (IST days, inclusive). */
function activeBetween(days: Map<number, string[]>, from: string, to: string): number[] {
  const out: number[] = [];
  for (const [u, ds] of days) if (ds.some((x) => x >= from && x <= to)) out.push(u);
  return out;
}

export function usage(d: StuData, f: Filters, refs: Refs) {
  const scope = new Set(scopeUsers(d, f));
  const act = activeDays(d, scope);
  const end = f.end;
  const trendDays = dayRange(addDays(end, -29), end);
  // ADMIN-AUDIT-STU (14 Nov 2026): a day before the count-from line was not counted: before, and no data on the charts.
  const from = d.countFrom != null ? istDay(d.countFrom) : null;
  const trend = trendDays.map((day) => {
    const dau = activeBetween(act, day, day);
    const mau = activeBetween(act, addDays(day, -29), day).length;
    const wau = activeBetween(act, addDays(day, -6), day).length;
    const isNew = dau.filter((u) => istDay(d.users[u].joined) === day);
    const ret = dau.filter((u) => istDay(d.users[u].joined) < day);
    const before = from != null && day < from;
    return {
      day, dau: before ? { ...cellOf([]), na: true } : refs.cell(cellOf(dau)), wau, mau, stick: before ? null : pct(dau.length, mau),
      new: refs.cell(cellOf(isNew)), returning: refs.cell(cellOf(ret)), ...(before ? { before } : {}),
    };
  });
  // ADMIN-FIX (5 Nov 2026): the average is over the days on or after the count-from line only; days before it are not
  // zeros, they were not counted.
  const last7 = liveDays(trend.slice(-7), d.countFrom);
  const avgDau = last7.reduce((a, x) => a + x.dau.v, 0) / Math.max(1, last7.length);
  const mau = refs.cell(cellOf(activeBetween(act, addDays(end, -29), end)));
  const wau = refs.cell(cellOf(activeBetween(act, addDays(end, -6), end)));
  // Repeat users: of the people who joined in the range, those active on 2+ separate IST days.
  const cohort = cohortOf(d, f);
  const repeat = cohort.filter((u) => (act.get(u)?.length ?? 0) >= 2);
  // What repeaters use: people active in the range, split by 2+ days active ever vs one day.
  const days = new Set(dayRange(f.start, f.end));
  const pool = [...act.entries()].filter(([, ds]) => ds.some((x) => days.has(x))).map(([u]) => u);
  const repeaters = pool.filter((u) => act.get(u)!.length >= 2);
  const oneTime = pool.filter((u) => act.get(u)!.length === 1);
  const used = (u: number, feat: string) => [...(activity(d).days.get(u)?.values() ?? [])].some((s) => s.has(feat));
  const features = FEATURES.map((feat) => {
    const r = repeaters.filter((u) => used(u, feat));
    const o = oneTime.filter((u) => used(u, feat));
    return { key: feat, label: FEATURE_LABELS[feat] ?? feat, rep: refs.cell(cellOf(r)), one: refs.cell(cellOf(o)), repPct: pct(r.length, repeaters.length), onePct: pct(o.length, oneTime.length) };
  }).filter((x) => x.rep.v + x.one.v > 0).sort((a, b) => (b.repPct ?? 0) - (a.repPct ?? 0));
  return {
    dau: trend[trend.length - 1].dau, wau, mau, avgDau: Math.round(avgDau * 10) / 10, avgDays: last7.length, avgFrom: last7[0]?.day ?? end,
    // MAU's 30 days reach back before counting started: it counts from then (everyone who signed up since is in it).
    mauFrom: from != null && addDays(end, -29) < from ? from : null,
    stickiness: mau.v ? Math.round((avgDau / mau.v) * 1000) / 10 : null,
    trend,
    repeat: refs.cell(cellOf(repeat)), cohort: refs.cell(cellOf(cohort)), repeatPct: pct(repeat.length, cohort.length),
    repeaters: refs.cell(cellOf(repeaters)), oneTime: refs.cell(cellOf(oneTime)), features,
    source: activitySource(d), beacons: activity(d).beacons,
  };
}

// ------------------------------------------------------------------ power users

export const POWER_RULE = "A power user was active on 4 or more of the last 7 IST days, or used 3 or more features in a day on 2 or more of those days.";

export interface PowerRow {
  u: number;
  who: string;
  lastActive: string;
  activeDays: number;
  richDays: number;
  top: string[];
  source: string;
  ch: string;
}

function powerAt(d: StuData, scope: Set<number>, end: string): Map<number, { activeDays: number; richDays: number }> {
  const from = addDays(end, -6);
  const out = new Map<number, { activeDays: number; richDays: number }>();
  for (const [u, m] of activity(d).days) {
    if (!scope.has(u)) continue;
    let a = 0, rich = 0;
    for (const [day, feats] of m) {
      if (day < from || day > end) continue;
      a++;
      if (feats.size >= 3) rich++;
    }
    if (a >= 4 || rich >= 2) out.set(u, { activeDays: a, richDays: rich });
  }
  return out;
}

export function power(d: StuData, f: Filters, refs: Refs) {
  const scope = new Set(scopeUsers(d, f));
  const end = f.end;
  const now = powerAt(d, scope, end);
  const from = addDays(end, -6);
  const rows: PowerRow[] = [...now.entries()].map(([u, p]) => {
    const m = activity(d).days.get(u)!;
    const counts = new Map<string, number>();
    for (const [day, feats] of m) if (day >= from && day <= end) for (const x of feats) counts.set(x, (counts.get(x) ?? 0) + 1);
    const user = d.users[u];
    const t = user.touch;
    return {
      u, who: maskEmail(user.email) || user.id.slice(0, 10), lastActive: [...m.keys()].filter((x) => x <= end).sort().pop() ?? "",
      activeDays: p.activeDays, richDays: p.richDays,
      top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => FEATURE_LABELS[k] ?? k),
      source: t?.source ? [t.source, t.medium].filter(Boolean).join(" / ") : "", ch: user.ch,
    };
  }).sort((a, b) => b.activeDays - a.activeDays || b.richDays - a.richDays || b.lastActive.localeCompare(a.lastActive));
  const cell = refs.cell(cellOf(rows.map((r) => r.u)));
  // ADMIN-AUDIT-STU (14 Nov 2026): a day before the count-from line was not counted: no data (null), not a zero.
  const countDay = d.countFrom != null ? istDay(d.countFrom) : null;
  const trend = dayRange(addDays(end, -29), end).map((day) => ({ day, v: countDay != null && day < countDay ? null : powerAt(d, scope, day).size }));
  const byChannel = new Map<string, number>();
  for (const r of rows) byChannel.set(r.ch, (byChannel.get(r.ch) ?? 0) + 1);
  return {
    rule: POWER_RULE, cell, trend, rows: rows.slice(0, 50), more: Math.max(0, rows.length - 50),
    weekAgo: trend.length > 7 ? trend[trend.length - 8].v : null,
    countFromDay: countDay,
    byChannel: [...byChannel.entries()].sort((a, b) => b[1] - a[1]),
    source: activitySource(d),
  };
}

// --------------------------------------------------------------------- insights

export interface Insight {
  key: string;
  score: number;
  text: string;
  /** an anchor on the Overview (#funnel) or a page */
  href: string;
  cell?: Cell;
}

const todayIstSafe = () => istDay(Date.now());
const niceDay = (day: string) => {
  const d = new Date(day + "T00:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
};

/** People needed on each side (repeat and one-time users) before a feature gap is an insight. */
export const FEATURE_MIN = 5;

/** 3 to 6 plain-English observations, by rules, most important first. Every number comes from the functions above. */
export function insights(d: StuData, f: Filters, refs: Refs, channelName: (k: string) => string = (k) => k): Insight[] {
  const out: Insight[] = [];
  // Sections computed here only to read from; just the cells an insight links to go to the browser.
  const scratch = new Refs(d);
  const scope = new Set(scopeUsers(d, f));
  const days = new Set(dayRange(f.start, f.end));
  // ADMIN-AUDIT-STU (14 Nov 2026): the same basis as the tiles: a range that ends today against the period before cut at
  // this time of day ("vs yesterday at this time").
  const cmp = compareBasis(f, dataNow(d));
  const pf = cmp.pf;
  const vs = compareText(f, cmp);
  const when = dayRange(f.start, f.end).length === 1 ? (f.end === todayIstSafe() ? "today" : `on ${niceDay(f.end)}`) : "in this range";

  // Failing calls first: they say students are stuck.
  const cl = calls(d, f, scratch);
  const topReason = cl.reasons[0];
  if (cl.failCalls.value != null && cl.failCalls.value > CALL_FAIL_ALERT_PCT) {
    out.push({ key: "calls", score: 90, text: `Call attempts are failing at ${cl.failCalls.value}% (${cl.failCalls.num.v} of ${cl.failCalls.den.v}, mic denied included)${topReason ? `; the top reason is "${topReason.label}" (${topReason.cell.v} people)` : ""}.`, href: "#calls", cell: cl.failCalls.num });
  }

  // Sign-ups against the period before, and where they came from.
  const su = metric("signups");
  const cur = su.cell(d, f, days, scope);
  const prev = su.cell(d, pf, new Set(dayRange(pf.start, pf.end)), scope, cmp.until).v;
  const from = signupSourceText(d, f, cur.v, channelName);
  if (beforeReset(d, pf)) {
    // Nothing was counted before the line, so there is nothing to compare with.
    if (cur.v === 0) out.push({ key: "signups", score: 40, text: `No sign-ups ${when}.`, href: "#kpis" });
    else out.push({ key: "signups", score: 55, text: `${cur.v} sign-up${cur.v === 1 ? "" : "s"} ${when}${from}.`, href: "#sources", cell: cur });
  } else if (cur.v === 0 && prev === 0) out.push({ key: "signups", score: 40, text: `No sign-ups ${when}, and none in the period before.`, href: "#kpis" });
  else if (cur.v === 0) out.push({ key: "signups", score: 75, text: `No sign-ups ${when} (${prev} ${vs.replace("vs ", "")}).`, href: "#kpis" });
  else if (prev === 0) out.push({ key: "signups", score: 60, text: `${cur.v} sign-up${cur.v === 1 ? "" : "s"} ${when}, none ${vs.replace("vs ", "")}${from}.`, href: "#sources", cell: cur });
  else {
    const ch = Math.round(((cur.v - prev) / prev) * 100);
    out.push({ key: "signups", score: 50 + Math.min(30, Math.abs(ch) / 3), text: `Sign-ups are ${ch >= 0 ? "up" : "down"} ${Math.abs(ch)}% ${vs} (${cur.v} vs ${prev})${from}.`, href: "#sources", cell: cur });
  }

  // The biggest drop in the funnel's key steps, with the top call reason when it is a call step.
  const fu = overviewFunnel(d, f, scratch);
  const b = fu.key.find((x) => x.key === fu.dropKey);
  const a = b && fu.key.find((x) => x.key === b.fromKey);
  if (a && b) {
    const callStep = b.phase === "Call";
    out.push({
      key: "drop", score: 70,
      text: `The biggest drop is ${a.label} to ${b.label}: ${b.pctPrev}% make it (${b.cell.v} of ${a.cell.v})${callStep && topReason ? `, with "${topReason.label}" the top reason` : ""}.`,
      href: "#funnel", cell: b.cell,
    });
  }

  // Power users this week and where they came from.
  const pw = power(d, f, scratch);
  if (pw.cell.v > 0) {
    const [ch, n] = pw.byChannel.find(([c]) => c !== "not_captured") ?? ["", 0];
    const where = ch ? `, ${n} from ${channelName(ch)}` : ", source not captured";
    out.push({ key: "power", score: 58, text: `${pw.cell.v} power user${pw.cell.v === 1 ? "" : "s"} in the 7 days to ${niceDay(f.end)}${where}${pw.weekAgo != null ? ` (${pw.weekAgo} a week earlier)` : ""}.`, href: "#power", cell: pw.cell });
  } else {
    out.push({ key: "power", score: 25, text: `No power users yet: nobody was active on 4 of the 7 days to ${niceDay(f.end)}.`, href: "#power" });
  }

  // Payments.
  const paid = metric("paid_users").cell(d, f, days, scope);
  const rev = metric("revenue").cell(d, f, days, scope).v;
  const test = metric("test_payments").cell(d, f, days, scope).v;
  if (paid.v > 0) out.push({ key: "paid", score: 62, text: `${paid.v} paid ${when} (${fmtInr(rev)})${test ? `; ${test} test payment${test === 1 ? "" : "s"} left out` : ""}.`, href: "#kpis", cell: paid });
  else {
    const plans = metric("plan_views").cell(d, f, days, scope);
    out.push({ key: "paid", score: 30, text: `No real payments ${when}${plans.na ? "" : `; ${plans.v} plan view${plans.v === 1 ? "" : "s"}`}${test ? `, ${test} test payment${test === 1 ? "" : "s"} left out` : ""}.`, href: "#kpis" });
  }

  // Stickiness and what repeat users do differently.
  const us = usage(d, f, scratch);
  const over = us.avgDays >= 7 ? "over the last 7 days" : `over the ${us.avgDays} day${us.avgDays === 1 ? "" : "s"} since ${niceDay(us.avgFrom)}`;
  if (us.mau.v > 0) out.push({ key: "stick", score: 35, text: `Stickiness is ${us.stickiness}%: ${us.avgDau} active a day on average ${over}, out of ${us.mau.v} active in 30 days.`, href: "#engagement", cell: us.mau });
  // ADMIN-FIX (5 Nov 2026): a feature gap needs FEATURE_MIN people on each side, or it is one or two people's habit.
  const gap = us.features
    .filter((x) => x.repPct != null && x.onePct != null && us.repeaters.v >= FEATURE_MIN && us.oneTime.v >= FEATURE_MIN)
    .map((x) => ({ x, g: (x.repPct ?? 0) - (x.onePct ?? 0) }))
    .sort((a, b) => b.g - a.g)[0];
  if (gap && gap.g >= 20) out.push({ key: "feature", score: 45 + Math.min(15, gap.g / 5), text: `Repeat users lean on ${gap.x.label}: ${gap.x.repPct}% of them used it (${gap.x.rep.v} of ${us.repeaters.v}), against ${gap.x.onePct}% of one-time users (${gap.x.one.v} of ${us.oneTime.v}).`, href: "#engagement", cell: gap.x.rep });
  else if (us.repeatPct != null && us.cohort.v >= 3) out.push({ key: "repeat", score: 33, text: `${us.repeatPct}% of the people who joined ${when} came back on another day (${us.repeat.v} of ${us.cohort.v}).`, href: "#engagement", cell: us.repeat });

  const top = out.sort((a, b) => b.score - a.score).slice(0, 6);
  for (const x of top) if (x.cell) x.cell = refs.cell(x.cell);
  return top;
}
