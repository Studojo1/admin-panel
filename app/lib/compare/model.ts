// OLD-VS-NEW (15 Nov 2026, the owner: "analytics of my previous product versus the new B2C product, comparing our
// ratios, purchases, replies, every single ratio, visitor to sign up, everything ... Take the best day of the previous
// and compare it"). The rules and the numbers behind /compare: the old student product (retired 2 Nov 2026 03:55 IST)
// against Stu (counted from 3 Nov 2026 00:00 IST, model.ts COUNT_FROM_DEFAULT).
//
// Both products are first put in one shape (SideData: people with their first time at each step, and rows per person
// and IST day), then every number here is computed the same way for both. The old side is read by old.server.ts; the
// new side is built from the Stu dataset by newSide() below with the Stu model's own functions (passed in, so this file
// has no runtime imports and `node --test scripts/compare-model.test.mjs` reads it as is). So every new number is the
// one the Stu pages show: sign-ups, steps, payers and revenue, emails and replies, actives and retention.
import type * as StuLib from "../stu/model";
import type { StuData } from "../stu/model";
import type { OvPerson } from "../stu/overview";

// ------------------------------------------------------------------ constants

/** Stu's first IST day: every Stu page counts from 3 Nov 2026 00:00 IST. */
export const RELAUNCH_DAY = "2026-11-03";
export const RELAUNCH_MS = Date.parse("2026-11-03T00:00:00+05:30");
/** The old product was switched off at 03:55 IST on 2 Nov 2026; its data stops there. */
export const OLD_OFF_DAY = "2026-11-02";
/** The old product's last whole day: the presets (last N days, lifetime) end here. */
export const OLD_LAST_FULL_DAY = "2026-11-01";
/** US dollars counted in rupees at this rate (the old /old dashboard used 94; the owner's figure for this page is 88). */
export const USD_INR = 88;
/** PostHog's first whole day on studojo.com (it began on 31 Mar 2026 at 16:28 IST): old visitors count from here. */
export const OLD_VISITORS_FROM = "2026-04-01";
/** user_attribution (the old product's first touch) only exists from this day. */
export const ATTRIBUTION_FROM = "2026-09-19";
/** "Within 7 days of sign-up": the fair option, as old cohorts had months to do a step and Stu's only days. */
export const HORIZON_DAYS = 7;
export const RETURN_DAYS = [1, 7, 30] as const;

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

// ---------------------------------------------------------------------- days

export const istDay = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayStartMs = (day: string): number => Date.parse(`${day}T00:00:00+05:30`);
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 1500; d = addDays(d, 1)) out.push(d);
  return out;
}
export const calDays = (start: string, end: string): number =>
  start > end ? 0 : Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / DAY_MS) + 1;
/** Monday of the week holding `day` */
export const weekOf = (day: string): string => addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
export const monthOf = (day: string): string => day.slice(0, 7);
export const lastOfMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "3 Nov" */
export const dayText = (day: string): string => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
/** "3 Nov to 15 Nov 2026", "13 Apr 2026" */
export function winText(w: Win): string {
  const y = w.end.slice(0, 4);
  if (w.start === w.end) return `${dayText(w.start)} ${y}`;
  return `${dayText(w.start)}${w.start.slice(0, 4) === y ? "" : ` ${w.start.slice(0, 4)}`} to ${dayText(w.end)} ${y}`;
}
export const monthText = (month: string): string => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export interface Win {
  start: string;
  end: string;
}
export const winKey = (w: Win): string => `${w.start}|${w.end}`;
const clip = (w: Win, from: string, to: string): Win => ({ start: w.start < from ? from : w.start, end: w.end > to ? to : w.end });

// ------------------------------------------------------------------- the shape

export type SideKey = "old" | "new";

/** A person who counts on one side (internal accounts are left out by the server, or marked x). */
export interface SidePerson {
  /** signed up (old: the account was made; new: joined Stu), epoch ms */
  su: number;
  /** channel key (utm-dictionary CHANNELS); "not_captured" when no source was kept */
  ch: string;
  /** step key -> first time, epoch ms */
  t: Record<string, number>;
  /** left out (internal): kept only so the indexes match the Stu dataset's */
  x?: 1;
}

/** [person, IST day, payments, paise counted (rupees, dollars at USD_INR), of which dollars in cents] */
export type PayRow = [number, string, number, number, number];
/** [person, IST day of the payment, refunded payments, refunded paise, of them refunded in full (not in the payments)] */
export type RefundRow = [number, string, number, number, number];
/** [person, IST day, emails sent, of them opened (-1: not tracked), of them bounced (-1: not known)] */
export type MailRow = [number, string, number, number, number];
/** [person, IST day, contacts (leads) emailed for the first time] */
export type ReachRow = [number, string, number];
/** [person, IST day, replies, of them positive (-1: not known)] */
export type ReplyRow = [number, string, number, number];
/** [person, IST day]: the person did something that day */
export type ActiveRow = [number, string];

export interface StepDef {
  key: string;
  label: string;
  /** tracked only from this IST day (cohorts before it read low) */
  from?: string;
  /** a short line on what it counts */
  note?: string;
}

export interface SideData {
  side: SideKey;
  /** first and last IST day of this side's data */
  from: string;
  to: string;
  people: SidePerson[];
  steps: StepDef[];
  /** activation: the first step that shows intent, and the step that delivers the product */
  act: { start: string; value: string };
  pays: PayRow[];
  refunds: RefundRow[];
  /** refunds are recorded on this side */
  refundsKept: boolean;
  mail: MailRow[];
  reach: ReachRow[];
  replies: ReplyRow[];
  active: ActiveRow[];
  /** visitors: distinct per IST day (a day not in the record was not tracked) */
  visitors: Record<string, number>;
  /** visitors were tracked from this time on their first day (epoch ms), or null for whole days */
  visitorsFromMs: number | null;
  /** distinct visitors in a window (main source), null when not known */
  distinct: (w: Win) => number | null;
  /** PostHog $pageview persons per IST day on the studojo.com student hosts: the same method on both sides */
  ph: Record<string, number> | null;
  phDistinct: (w: Win) => number | null;
}

// ------------------------------------------------------------------- weights

/** How much of an IST day counts: today only the part gone by (it is not over); every other day in full. */
export function dayWeight(side: SideKey, day: string, nowMs: number): number {
  if (side === "new" && day === istDay(nowMs)) return Math.min(1, Math.max(0.01, (nowMs - dayStartMs(day)) / DAY_MS));
  return 1;
}

/** Days in a window as a number: today as a fraction. */
export const effDays = (side: SideKey, w: Win, nowMs: number): number =>
  dayRange(w.start, w.end).reduce((a, d) => a + dayWeight(side, d, nowMs), 0);

/** The share of a day visitors were tracked: from the first page_view on its first day, and today so far. */
function visitorWeight(s: SideData, day: string, nowMs: number): number {
  let w = dayWeight(s.side, day, nowMs);
  if (s.visitorsFromMs != null && day === istDay(s.visitorsFromMs)) {
    const end = Math.min(nowMs, dayStartMs(day) + DAY_MS);
    w = Math.max(0.01, (end - s.visitorsFromMs) / DAY_MS);
  }
  return w;
}

// ---------------------------------------------------------------------- cells

/** A number and, where cheap, the people behind it (indexes into the side's people). */
export interface PCell {
  v: number;
  users: number[];
}
const pc = (users: Iterable<number>): PCell => {
  const u = [...new Set(users)];
  return { v: u.length, users: u };
};

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const pct = (n: number, d: number | null | undefined): number | null => (d && d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const per = (n: number | null, d: number): number | null => (n == null || d <= 0 ? null : n / d);

// --------------------------------------------------------- one window, one side

export interface WinMetrics {
  win: Win;
  /** calendar days and days as a number (today as a fraction) */
  calDays: number;
  days: number;
  /** visitors */
  visitorDays: number;
  visitorsSum: number | null;
  visitors: number | null;
  /** the window starts before visitors were tracked: counted from this day */
  visitorsFrom: string | null;
  /** sign-ups on tracked visitor days (the base of visitor to sign-up for a part-tracked window) */
  signupsTracked: number;
  phSum: number | null;
  phDays: number;
  ph: number | null;
  signups: PCell;
  actStart: PCell;
  actValue: PCell;
  /** people whose activation (value) step fell in the window, whenever they signed up */
  activatedEvents: PCell;
  cohortPaid: PCell;
  payers: PCell;
  payments: number;
  revenue: number;
  usdCents: number;
  repeatPayers: PCell;
  refunds: number | null;
  refundPaise: number | null;
  /** refunded in full: kept nothing, so not in payments */
  refundFull: number;
  medianToPay: number | null;
  emails: number;
  opened: number | null;
  /** emails sent on days opens were tracked (the base of the open rate) */
  openBase: number;
  bounced: number | null;
  senders: PCell;
  reached: number;
  replies: number;
  positive: number | null;
  ret: Record<string, { back: PCell; eligible: PCell }>;
  dauSum: number;
  actives: PCell;
  returning: PCell;
  wau: number | null;
}

export interface MetricOpts {
  nowMs: number;
  /** count a step only within this many days of sign-up; null: any time */
  horizon: number | null;
}

/** People active per IST day, built once per side. */
const activeIndex = new WeakMap<SideData, Map<string, Set<number>>>();
function activeByDay(s: SideData): Map<string, Set<number>> {
  let m = activeIndex.get(s);
  if (m) return m;
  m = new Map();
  for (const [p, d] of s.active) {
    if (s.people[p]?.x) continue;
    let set = m.get(d);
    if (!set) m.set(d, (set = new Set()));
    set.add(p);
  }
  activeIndex.set(s, m);
  return m;
}
const payTotals = new WeakMap<SideData, Map<number, number>>();
function paymentsPerPerson(s: SideData): Map<number, number> {
  let m = payTotals.get(s);
  if (m) return m;
  m = new Map();
  for (const [p, , n] of s.pays) m.set(p, (m.get(p) ?? 0) + n);
  payTotals.set(s, m);
  return m;
}

/** When a person first did a step, if it counts in the horizon. */
export function stepTime(person: SidePerson, key: string, horizon: number | null): number | null {
  if (key === "signed_up") return person.su;
  const t = person.t[key];
  if (t == null) return null;
  if (horizon != null && t - person.su > horizon * DAY_MS) return null;
  return t;
}

/** The part of a window (kept to the side's days) whose visitors were tracked: from its first tracked day. */
export function trackedWin(s: Pick<SideData, "from" | "to">, raw: Win, daily: Record<string, number>): Win | null {
  const w = clip(raw, s.from, s.to);
  const first = dayRange(w.start, w.end).find((d) => daily[d] != null);
  return first ? { start: first, end: w.end } : null;
}

export function winMetrics(s: SideData, raw: Win, o: MetricOpts): WinMetrics {
  const w = clip(raw, s.from, s.to);
  const days = dayRange(w.start, w.end);
  const inWin = new Set(days);
  const eff = days.reduce((a, d) => a + dayWeight(s.side, d, o.nowMs), 0);
  const live = (p: number) => !s.people[p]?.x;

  // Visitors: only the days that were tracked; the ratio's sign-ups only on those days too (old side before 1 Apr 2026).
  const tracked = days.filter((d) => s.visitors[d] != null);
  const visitorsFrom = tracked.length && tracked.length < days.length ? tracked[0] : null;
  const visitorsSum = tracked.length ? tracked.reduce((a, d) => a + (s.visitors[d] ?? 0), 0) : null;
  const visitorDays = tracked.reduce((a, d) => a + visitorWeight(s, d, o.nowMs), 0);
  const vw = trackedWin(s, w, s.visitors);
  const visitors = vw ? s.distinct(vw) : null;
  const trackedSet = new Set(tracked);
  const phTracked = s.ph ? days.filter((d) => s.ph![d] != null) : [];
  const phSum = phTracked.length ? phTracked.reduce((a, d) => a + (s.ph![d] ?? 0), 0) : null;
  const phDays = phTracked.reduce((a, d) => a + dayWeight(s.side, d, o.nowMs), 0);
  const pw = s.ph ? trackedWin(s, w, s.ph) : null;
  const ph = pw ? s.phDistinct(pw) : null;

  const cohort: number[] = [];
  s.people.forEach((p, i) => {
    if (!p.x && inWin.has(istDay(p.su))) cohort.push(i);
  });
  const did = (key: string) => cohort.filter((i) => stepTime(s.people[i], key, o.horizon) != null);
  const signupsTracked = visitorsFrom ? cohort.filter((i) => trackedSet.has(istDay(s.people[i].su))).length : cohort.length;
  const events: number[] = [];
  s.people.forEach((p, i) => {
    const t = p.t[s.act.value];
    if (!p.x && t != null && inWin.has(istDay(t))) events.push(i);
  });

  const cohortPaid = did("paid");
  const payers: number[] = [];
  let payments = 0;
  let revenue = 0;
  let usdCents = 0;
  for (const [p, d, n, paise, usd] of s.pays) {
    if (!live(p) || !inWin.has(d)) continue;
    payers.push(p);
    payments += n;
    revenue += paise;
    usdCents += usd;
  }
  const totals = paymentsPerPerson(s);
  const payerCell = pc(payers);
  let refunds = 0;
  let refundPaise = 0;
  let refundFull = 0;
  for (const [p, d, n, paise, full] of s.refunds) {
    if (!live(p) || !inWin.has(d)) continue;
    refunds += n;
    refundPaise += paise;
    refundFull += full;
  }

  let emails = 0;
  let opened = 0;
  let openBase = 0;
  let openKnown = false;
  let bounced = 0;
  let bounceKnown = false;
  const senders: number[] = [];
  for (const [p, d, n, op, b] of s.mail) {
    if (!live(p) || !inWin.has(d)) continue;
    emails += n;
    if (n > 0) senders.push(p);
    if (op >= 0) {
      opened += op;
      openBase += n;
      openKnown = true;
    }
    if (b >= 0) {
      bounced += b;
      bounceKnown = true;
    }
  }
  let reached = 0;
  for (const [p, d, n] of s.reach) if (live(p) && inWin.has(d)) reached += n;
  let replies = 0;
  let positive = 0;
  let posKnown = false;
  for (const [p, d, n, pos] of s.replies) {
    if (!live(p) || !inWin.has(d)) continue;
    replies += n;
    if (pos >= 0) {
      positive += pos;
      posKnown = true;
    }
  }

  // Return: active on day N after the IST day they signed up, of those whose day N has come (on this side's data).
  const byDay = activeByDay(s);
  const ret: WinMetrics["ret"] = {};
  for (const n of RETURN_DAYS) {
    const eligible = cohort.filter((i) => addDays(istDay(s.people[i].su), n) <= s.to);
    const back = eligible.filter((i) => byDay.get(addDays(istDay(s.people[i].su), n))?.has(i));
    ret[`d${n}`] = { back: pc(back), eligible: pc(eligible) };
  }
  let dauSum = 0;
  const actives = new Set<number>();
  const returning = new Set<number>();
  for (const d of days) {
    const set = byDay.get(d);
    if (!set) continue;
    dauSum += set.size;
    for (const p of set) {
      actives.add(p);
      if (d > istDay(s.people[p].su)) returning.add(p);
    }
  }
  // Weekly actives: on each day whose 7 days back are all on this side, the people active in those 7 days; averaged.
  const wauDays = days.filter((d) => addDays(d, -6) >= s.from);
  let wau: number | null = null;
  if (wauDays.length) {
    let sum = 0;
    for (const d of wauDays) {
      const u = new Set<number>();
      for (let k = 0; k < 7; k++) for (const p of byDay.get(addDays(d, -k)) ?? []) u.add(p);
      sum += u.size;
    }
    wau = sum / wauDays.length;
  }

  return {
    win: w, calDays: days.length, days: eff,
    visitorDays, visitorsSum, visitors, visitorsFrom, signupsTracked, phSum, phDays, ph,
    signups: pc(cohort), actStart: pc(did(s.act.start)), actValue: pc(did(s.act.value)), activatedEvents: pc(events),
    cohortPaid: pc(cohortPaid), payers: payerCell, payments, revenue, usdCents,
    repeatPayers: pc(payerCell.users.filter((p) => (totals.get(p) ?? 0) >= 2)),
    refunds: s.refundsKept ? refunds : null, refundPaise: s.refundsKept ? refundPaise : null, refundFull,
    medianToPay: median(cohortPaid.map((i) => (stepTime(s.people[i], "paid", o.horizon) as number) - s.people[i].su)),
    emails, opened: openKnown ? opened : null, openBase, bounced: bounceKnown ? bounced : null, senders: pc(senders),
    reached, replies, positive: posKnown ? positive : null,
    ret, dauSum, actives: pc(actives), returning: pc(returning), wau,
  };
}

// ----------------------------------------------------------------- baselines

export type BaseKind = "best" | "last" | "lifetime" | "month" | "custom";
export type BestBy = "signups" | "revenue";
export interface BaseSpec {
  kind: BaseKind;
  by: BestBy;
  /** month: YYYY-MM (else the best month by `by`) */
  month?: string | null;
  start?: string | null;
  end?: string | null;
}
export interface Baseline extends Win {
  kind: BaseKind;
  label: string;
  why: string;
}

/** The old side's daily sign-ups or revenue on each of its whole days. */
function oldSeries(old: SideData, by: BestBy): Map<string, number> {
  const m = new Map<string, number>();
  if (by === "signups") {
    for (const p of old.people) if (!p.x) m.set(istDay(p.su), (m.get(istDay(p.su)) ?? 0) + 1);
  } else {
    for (const [p, d, , paise] of old.pays) if (!old.people[p]?.x) m.set(d, (m.get(d) ?? 0) + paise);
  }
  return m;
}

/** The old window of `n` days with the most sign-ups (or revenue), on whole days; the earlier one on a tie. */
export function bestWindow(old: SideData, n: number, by: BestBy): Win {
  const days = dayRange(old.from, OLD_LAST_FULL_DAY);
  if (n >= days.length) return { start: old.from, end: OLD_LAST_FULL_DAY };
  const s = oldSeries(old, by);
  const v = days.map((d) => s.get(d) ?? 0);
  let sum = v.slice(0, n).reduce((a, b) => a + b, 0);
  let best = sum;
  let at = 0;
  for (let i = n; i < v.length; i++) {
    sum += v[i] - v[i - n];
    if (sum > best) {
      best = sum;
      at = i - n + 1;
    }
  }
  return { start: days[at], end: days[at + n - 1] };
}

/** Calendar months of the old side, oldest first, to the last month before the switch-off (the first may be a part month). */
export function oldMonths(old: Pick<SideData, "from">): Win[] {
  const out: Win[] = [];
  for (let m = monthOf(old.from); m < monthOf(OLD_OFF_DAY); m = monthOf(addDays(lastOfMonth(m), 1))) {
    out.push({ start: `${m}-01` < old.from ? old.from : `${m}-01`, end: lastOfMonth(m) });
  }
  return out;
}

export function bestMonth(old: SideData, by: BestBy): Win {
  const s = oldSeries(old, by);
  let best: Win | null = null;
  let bestV = -1;
  for (const w of oldMonths(old)) {
    const v = dayRange(w.start, w.end).reduce((a, d) => a + (s.get(d) ?? 0), 0);
    if (v > bestV) {
      bestV = v;
      best = w;
    }
  }
  return best ?? { start: old.from, end: OLD_LAST_FULL_DAY };
}

const BY_TEXT: Record<BestBy, string> = { signups: "sign-ups", revenue: "revenue" };

export function baseline(old: SideData, spec: BaseSpec, n: number): Baseline {
  const n1 = Math.max(1, n);
  if (spec.kind === "last") {
    const start = addDays(OLD_LAST_FULL_DAY, -(n1 - 1));
    return { kind: "last", start: start < old.from ? old.from : start, end: OLD_LAST_FULL_DAY, label: `Old: last ${n1} days`, why: `the ${n1} whole days before the old product was switched off (2 Nov, 03:55 IST)` };
  }
  if (spec.kind === "lifetime") {
    return { kind: "lifetime", start: old.from, end: OLD_LAST_FULL_DAY, label: "Old: lifetime average", why: `every whole day of the old product, ${dayText(old.from)} ${old.from.slice(0, 4)} to 1 Nov 2026, per day` };
  }
  if (spec.kind === "month") {
    const months = oldMonths(old);
    const chosen = spec.month ? months.find((w) => monthOf(w.start) === spec.month) : null;
    const w = chosen ?? bestMonth(old, spec.by);
    return { kind: "month", ...w, label: `Old: ${monthText(monthOf(w.start))}`, why: chosen ? "the month picked" : `the old product's best calendar month by ${BY_TEXT[spec.by]}` };
  }
  if (spec.kind === "custom" && spec.start && spec.end) {
    const w = clip({ start: spec.start <= spec.end ? spec.start : spec.end, end: spec.end >= spec.start ? spec.end : spec.start }, old.from, old.to);
    return { kind: "custom", ...w, label: "Old: custom range", why: "the old range picked" };
  }
  const w = bestWindow(old, n1, spec.by);
  return { kind: "best", ...w, label: `Old: best ${n1} days by ${BY_TEXT[spec.by]}`, why: `the ${n1} days in a row with the most ${BY_TEXT[spec.by]} in the old product's life` };
}

// ----------------------------------------------------------------- the scoreboard

export type Kind = "count" | "pct" | "inr" | "ms" | "num";
export interface Val {
  /** the number compared (per day for a per-day row) */
  v: number | null;
  /** the window's total, for a per-day row */
  total?: number | null;
  /** the people behind it (new side only, where cheap) */
  cell?: PCell;
  /** a short note on this side's number (part tracked, not tracked) */
  note?: string;
}
export interface Row {
  key: string;
  group: string;
  label: string;
  kind: Kind;
  /** per day: v is the total over the days in the window */
  perDay?: boolean;
  /** higher is better (up), lower is better (down), or neither */
  better: "up" | "down" | null;
  old: Val;
  neu: Val;
  /** the old and the new definition, when they differ */
  oldDef?: string;
  newDef?: string;
  def?: string;
}

export interface Change {
  text: string;
  tone: "good" | "bad" | "";
}

/** The change from old to new: points for a %, else times. */
export function change(r: Pick<Row, "kind" | "better">, o: number | null, n: number | null): Change {
  if (o == null || n == null) return { text: "", tone: "" };
  const tone = (up: boolean): Change["tone"] => (r.better == null || o === n ? "" : (r.better === "up") === up ? "good" : "bad");
  if (r.kind === "pct") {
    const d = Math.round((n - o) * 10) / 10;
    return { text: d === 0 ? "same" : `${d > 0 ? "+" : ""}${d} pts`, tone: tone(n > o) };
  }
  if (o === 0 && n === 0) return { text: "same", tone: "" };
  if (o === 0) return { text: "new", tone: tone(true) };
  if (r.kind === "ms") {
    if (n === 0) return { text: "at once", tone: tone(false) };
    const x = n < o ? o / n : n / o;
    return x < 1.005 ? { text: "same", tone: "" } : { text: `${x >= 10 ? Math.round(x) : x.toFixed(1)}x ${n < o ? "faster" : "slower"}`, tone: tone(n > o) };
  }
  const x = n / o;
  const text = x >= 10 ? `${Math.round(x)}x` : x >= 0.995 && x < 1.005 ? "same" : `${x < 1 ? x.toFixed(2) : x.toFixed(1)}x`;
  return { text, tone: tone(n > o) };
}

const ret = (m: WinMetrics, n: number) => pct(m.ret[`d${n}`].back.v, m.ret[`d${n}`].eligible.v);

export interface SideTexts {
  visitors: string;
  ph: string;
  signup: string;
  actStart: string;
  actValue: string;
  paid: string;
  emails: string;
  reached: string;
  replies: string;
  positive: string;
  bounces: string;
  opens: string;
  active: string;
  refunds: string;
}

export const OLD_TEXT: SideTexts = {
  visitors: "PostHog: people with a $pageview on studojo.com, www and platform, per IST day (from 1 Apr 2026)",
  ph: "PostHog $pageview people on studojo.com, www and platform",
  signup: "a new studojo.com account (any dojo)",
  actStart: "uploaded a resume (candidates, outreach_orders)",
  actValue: "leads generated (outreach_orders.leads_generated_at)",
  paid: "payment_orders paid or completed, above zero, not ₹90 or $1 test prices; plus the Assignment dojo (cp.payments)",
  emails: "emails_sent with a sent_at, is_test false",
  reached: "leads sent a first (not follow-up) email",
  replies: "leads that replied (reply_received_at), by the day of the reply",
  positive: "reply_sentiment positive",
  bounces: "emails_sent status bounced",
  opens: "first_opened_at set, from 7 Jul 2026 (an open pixel: it overcounts, mail apps load images)",
  active: "signed in, a page in PostHog, or any step, payment or tool use that day",
  refunds: "none recorded: payment_orders.refunded_cents and payment_refunds are empty",
};

export const NEW_TEXT: SideTexts = {
  visitors: "Stu page_view: distinct visitor ids (the site's script ran in a browser), from 3 Nov 21:58 IST",
  ph: "PostHog $pageview people on studojo.com, www and platform (the old method)",
  signup: "first Stu sign-in (an older studojo.com account counts as new on its first Stu day)",
  actStart: "call started",
  actValue: "onboarded (the call done, profile ready)",
  paid: "money in: credit orders less refunds, autopay charges, plans (not test or grant)",
  emails: "career_emails sent, not a dry run or test inbox",
  reached: "contacts (sequences) sent a first real email",
  replies: "career_sequences.replied_at, not a bounce or dry run",
  positive: "career_sequences.reply_tag positive",
  bounces: "career_sequences reply_how bounce",
  opens: "not tracked",
  active: "did something themselves (the Stu Active count)",
  refunds: "career_credit_orders refunded_paise, autopay charges revoked",
};

export function scoreboard(o: WinMetrics, n: WinMetrics, ot: SideTexts = OLD_TEXT, nt: SideTexts = NEW_TEXT): Row[] {
  const rows: Row[] = [];
  const add = (r: Row) => rows.push(r);
  const cnt = (m: WinMetrics, c: PCell, keep: boolean): Val => ({ v: c.v, cell: keep ? c : undefined });
  const perDay = (m: WinMetrics, total: number | null, c?: PCell, days = m.days): Val => ({ v: per(total, days), total, cell: c });
  const visNote = (m: WinMetrics) => (m.visitorsFrom ? `tracked from ${dayText(m.visitorsFrom)}` : undefined);
  const distinctNote = (v: number | null) => (v == null ? undefined : `${v.toLocaleString("en-IN")} different people`);

  // Traffic
  add({ key: "visitors_day", group: "Traffic and sign-up", label: "Visitors per day", kind: "num", perDay: true, better: "up",
    old: { v: per(o.visitorsSum, o.visitorDays), note: o.visitorsSum == null ? "not tracked" : [distinctNote(o.visitors), visNote(o)].filter(Boolean).join(", ") },
    neu: { v: per(n.visitorsSum, n.visitorDays), note: n.visitorsSum == null ? "not tracked" : [distinctNote(n.visitors), visNote(n)].filter(Boolean).join(", ") },
    oldDef: ot.visitors, newDef: nt.visitors });
  add({ key: "visitors_ph_day", group: "Traffic and sign-up", label: "Visitors per day, PostHog on both", kind: "num", perDay: true, better: "up",
    old: { v: per(o.phSum, o.phDays), note: o.phSum == null ? "not available" : [distinctNote(o.ph), visNote(o)].filter(Boolean).join(", ") },
    neu: { v: per(n.phSum, n.phDays), note: n.phSum == null ? "not available" : distinctNote(n.ph) },
    def: `${ot.ph}; the same count on both sides` });
  add({ key: "signups_day", group: "Traffic and sign-up", label: "Sign-ups per day", kind: "num", perDay: true, better: "up",
    old: perDay(o, o.signups.v), neu: perDay(n, n.signups.v, n.signups), oldDef: ot.signup, newDef: nt.signup });
  add({ key: "visit_signup", group: "Traffic and sign-up", label: "Visitor to sign-up", kind: "pct", better: "up",
    old: { v: pct(o.signupsTracked, o.visitors), note: o.visitors == null ? "not tracked" : visNote(o) },
    neu: { v: pct(n.signupsTracked, n.visitors), note: n.visitors == null ? "not tracked" : visNote(n) },
    def: "sign-ups in the window over distinct visitors in it (as Stu Ratios)" });
  add({ key: "visit_signup_ph", group: "Traffic and sign-up", label: "Visitor to sign-up, PostHog on both", kind: "pct", better: "up",
    old: { v: pct(o.signups.v, o.ph), note: o.ph == null ? "not available" : undefined }, neu: { v: pct(n.signups.v, n.ph), note: n.ph == null ? "not available" : undefined },
    def: "sign-ups over distinct PostHog visitors in the window" });

  // Activation
  add({ key: "act_start", group: "Activation", label: "Sign-up to first step", kind: "pct", better: "up",
    old: { v: pct(o.actStart.v, o.signups.v) }, neu: { v: pct(n.actStart.v, n.signups.v), cell: n.actStart }, oldDef: ot.actStart, newDef: nt.actStart });
  add({ key: "act_value", group: "Activation", label: "Sign-up to activated", kind: "pct", better: "up",
    old: { v: pct(o.actValue.v, o.signups.v) }, neu: { v: pct(n.actValue.v, n.signups.v), cell: n.actValue }, oldDef: ot.actValue, newDef: nt.actValue });
  add({ key: "activated_day", group: "Activation", label: "People activated per day", kind: "num", perDay: true, better: "up",
    old: perDay(o, o.activatedEvents.v), neu: perDay(n, n.activatedEvents.v, n.activatedEvents),
    oldDef: `${ot.actValue}, on the day it happened`, newDef: `${nt.actValue}, on the day it happened` });

  // Money
  const g = "Money";
  add({ key: "signup_paid", group: g, label: "Sign-up to paid", kind: "pct", better: "up",
    old: { v: pct(o.cohortPaid.v, o.signups.v) }, neu: { v: pct(n.cohortPaid.v, n.signups.v), cell: n.cohortPaid }, oldDef: ot.paid, newDef: nt.paid });
  add({ key: "visit_paid", group: g, label: "Visitor to paid", kind: "pct", better: "up",
    old: { v: pct(o.cohortPaid.v, o.visitors), note: o.visitors == null ? "not tracked" : undefined }, neu: { v: pct(n.cohortPaid.v, n.visitors) },
    def: "paid people among the window's sign-ups over its distinct visitors (as Stu Ratios)" });
  add({ key: "payers", group: g, label: "Payers", kind: "count", better: "up", old: cnt(o, o.payers, false), neu: cnt(n, n.payers, true), def: "people who paid in the window, whenever they signed up" });
  add({ key: "payers_day", group: g, label: "Payers per day", kind: "num", perDay: true, better: "up", old: perDay(o, o.payers.v), neu: perDay(n, n.payers.v, n.payers) });
  add({ key: "payments", group: g, label: "Payments", kind: "count", better: "up", old: { v: o.payments }, neu: { v: n.payments }, def: "each payment (old: each order; new: each order or autopay charge)" });
  add({ key: "revenue", group: g, label: "Revenue", kind: "inr", better: "up",
    old: { v: o.revenue, note: o.usdCents ? `incl. $${Math.round(o.usdCents / 100)} at ₹${USD_INR}` : undefined }, neu: { v: n.revenue, note: n.usdCents ? `incl. $${Math.round(n.usdCents / 100)} at ₹${USD_INR}` : undefined },
    def: "money kept, less refunds; dollars at ₹88" });
  add({ key: "revenue_day", group: g, label: "Revenue per day", kind: "inr", perDay: true, better: "up", old: perDay(o, o.revenue), neu: perDay(n, n.revenue) });
  add({ key: "rev_signup", group: g, label: "Revenue per sign-up", kind: "inr", better: "up", old: { v: per(o.revenue, o.signups.v) }, neu: { v: per(n.revenue, n.signups.v) }, def: "the window's revenue over its sign-ups" });
  add({ key: "rev_visitor", group: g, label: "Revenue per visitor", kind: "inr", better: "up", old: { v: o.visitors ? o.revenue / o.visitors : null }, neu: { v: n.visitors ? n.revenue / n.visitors : null }, def: "the window's revenue over its distinct visitors" });
  add({ key: "aov", group: g, label: "Average payment", kind: "inr", better: null, old: { v: per(o.revenue, o.payments) }, neu: { v: per(n.revenue, n.payments) }, def: "revenue over payments; the prices differ (old credit packs, Stu ₹299 a month), so neither is better" });
  add({ key: "repeat", group: g, label: "Repeat purchase rate", kind: "pct", better: "up",
    old: { v: pct(o.repeatPayers.v, o.payers.v) }, neu: { v: pct(n.repeatPayers.v, n.payers.v), cell: n.repeatPayers },
    def: "payers in the window with two or more payments on that side, ever (new: an autopay renewal counts)" });
  add({ key: "refund_rate", group: g, label: "Refund rate", kind: "pct", better: "down",
    old: { v: o.refunds == null ? null : pct(o.refunds, o.payments + o.refundFull), note: o.refunds == null ? "not recorded" : `${o.refunds} refunded` },
    neu: { v: n.refunds == null ? null : pct(n.refunds, n.payments + n.refundFull), note: n.refunds == null ? "not recorded" : `${n.refunds} refunded` },
    oldDef: ot.refunds, newDef: `${nt.refunds}; refunded payments over payments (a payment refunded in full included)` });
  add({ key: "refund_inr", group: g, label: "Refunded", kind: "inr", better: "down",
    old: { v: o.refundPaise, note: o.refundPaise == null ? "not recorded" : undefined }, neu: { v: n.refundPaise, note: n.refundPaise == null ? "not recorded" : undefined } });
  add({ key: "to_pay", group: g, label: "Median time sign-up to first payment", kind: "ms", better: "down",
    old: { v: o.medianToPay }, neu: { v: n.medianToPay }, def: "the window's sign-ups who paid" });

  // Outreach
  const q = "Outreach and replies";
  add({ key: "emails_day", group: q, label: "Emails sent per day", kind: "num", perDay: true, better: "up", old: perDay(o, o.emails), neu: perDay(n, n.emails), oldDef: ot.emails, newDef: nt.emails });
  add({ key: "senders", group: q, label: "People sending outreach", kind: "count", better: "up", old: cnt(o, o.senders, false), neu: cnt(n, n.senders, true), def: "people with an email sent in the window" });
  add({ key: "per_sender", group: q, label: "Emails per sender", kind: "num", better: null, old: { v: per(o.emails, o.senders.v) }, neu: { v: per(n.emails, n.senders.v) } });
  add({ key: "reached", group: q, label: "People reached", kind: "count", better: "up", old: { v: o.reached }, neu: { v: n.reached }, oldDef: ot.reached, newDef: nt.reached });
  add({ key: "replies", group: q, label: "Replies", kind: "count", better: "up", old: { v: o.replies }, neu: { v: n.replies }, oldDef: ot.replies, newDef: nt.replies });
  add({ key: "reply_lead", group: q, label: "Reply rate per person reached", kind: "pct", better: "up", old: { v: pct(o.replies, o.reached) }, neu: { v: pct(n.replies, n.reached) }, def: "replies over people first emailed, both in the window (as /old/daily)" });
  add({ key: "reply_email", group: q, label: "Reply rate per email", kind: "pct", better: "up", old: { v: pct(o.replies, o.emails) }, neu: { v: pct(n.replies, n.emails) }, def: "replies over emails sent, follow-ups included" });
  add({ key: "replies_100", group: q, label: "Replies per 100 sign-ups", kind: "num", better: "up", old: { v: o.signups.v ? (o.replies / o.signups.v) * 100 : null }, neu: { v: n.signups.v ? (n.replies / n.signups.v) * 100 : null } });
  add({ key: "positive", group: q, label: "Positive replies", kind: "count", better: "up",
    old: { v: o.positive, note: o.positive != null && o.replies ? `${pct(o.positive, o.replies)}% of replies` : undefined },
    neu: { v: n.positive, note: n.positive != null && n.replies ? `${pct(n.positive, n.replies)}% of replies` : n.positive == null ? "not tagged" : undefined },
    oldDef: ot.positive, newDef: nt.positive });
  add({ key: "bounce_rate", group: q, label: "Bounce rate", kind: "pct", better: "down",
    old: { v: o.bounced == null ? null : pct(o.bounced, o.emails), note: o.bounced == null ? "not known" : `${o.bounced} bounced` },
    neu: { v: n.bounced == null ? null : pct(n.bounced, n.emails), note: n.bounced == null ? "not known" : `${n.bounced} bounced` },
    oldDef: ot.bounces, newDef: nt.bounces });
  add({ key: "open_rate", group: q, label: "Open rate", kind: "pct", better: "up",
    old: { v: o.opened == null ? null : pct(o.opened, o.openBase), note: o.opened == null ? "not tracked" : o.openBase < o.emails ? `of ${o.openBase} tracked emails` : undefined },
    neu: { v: n.opened == null ? null : pct(n.opened, n.openBase), note: n.opened == null ? "not tracked" : n.openBase < n.emails ? `of ${n.openBase} tracked emails` : undefined },
    oldDef: ot.opens, newDef: nt.opens });

  // Return
  const r = "Return and use";
  for (const d of RETURN_DAYS) {
    add({ key: `d${d}`, group: r, label: `Came back on day ${d}`, kind: "pct", better: "up",
      old: { v: ret(o, d), note: o.ret[`d${d}`].eligible.v ? `${o.ret[`d${d}`].back.v} of ${o.ret[`d${d}`].eligible.v}` : "none old enough" },
      neu: { v: ret(n, d), cell: n.ret[`d${d}`].back, note: n.ret[`d${d}`].eligible.v ? `${n.ret[`d${d}`].back.v} of ${n.ret[`d${d}`].eligible.v}` : "none old enough" },
      def: `the window's sign-ups active on the ${d === 1 ? "IST day after" : `${d}th IST day after`} they signed up, of those that day has come for`,
      oldDef: d === 1 ? ot.active : undefined, newDef: d === 1 ? nt.active : undefined });
  }
  add({ key: "dau", group: r, label: "Daily actives (average)", kind: "num", perDay: true, better: "up", old: perDay(o, o.dauSum), neu: perDay(n, n.dauSum), oldDef: ot.active, newDef: nt.active });
  add({ key: "wau", group: r, label: "Weekly actives (average)", kind: "num", better: "up",
    old: { v: o.wau, note: o.wau == null ? "under 7 days of data" : undefined }, neu: { v: n.wau, note: n.wau == null ? "under 7 days of data" : undefined },
    def: "people active in the 7 days up to each day, averaged over the window's days that have 7 days behind them" });
  add({ key: "actives", group: r, label: "People active in the window", kind: "count", better: "up", old: cnt(o, o.actives, false), neu: cnt(n, n.actives, true) });
  add({ key: "returning", group: r, label: "Returning actives", kind: "count", better: "up", old: cnt(o, o.returning, false), neu: cnt(n, n.returning, true), def: "active on a day after the one they signed up" });
  return rows;
}

// ------------------------------------------------------------------- daily series

export const FACE_METRICS = [
  { key: "visitors", label: "Visitors" },
  { key: "signups", label: "Sign-ups" },
  { key: "activated", label: "People activated" },
  { key: "payers", label: "Payers" },
  { key: "revenue", label: "Revenue", inr: true },
  { key: "emails", label: "Emails sent" },
  { key: "replies", label: "Replies" },
] as const;
export type FaceKey = (typeof FACE_METRICS)[number]["key"];

/** One value per IST day of the side (null: not tracked that day). */
export function series(s: SideData, key: FaceKey): Map<string, number | null> {
  const m = new Map<string, number | null>();
  const days = dayRange(s.from, s.to);
  if (key === "visitors") {
    for (const d of days) m.set(d, s.visitors[d] ?? null);
    return m;
  }
  for (const d of days) m.set(d, 0);
  const inc = (d: string, n: number) => {
    if (m.has(d)) m.set(d, (m.get(d) ?? 0) + n);
  };
  const live = (p: number) => !s.people[p]?.x;
  if (key === "signups") {
    for (const p of s.people) if (!p.x) inc(istDay(p.su), 1);
  } else if (key === "activated") {
    for (const p of s.people) if (!p.x && p.t[s.act.value] != null) inc(istDay(p.t[s.act.value]), 1);
  } else if (key === "payers") {
    const seen = new Set<string>();
    for (const [p, d] of s.pays) {
      if (!live(p) || seen.has(`${p}|${d}`)) continue;
      seen.add(`${p}|${d}`);
      inc(d, 1);
    }
  } else if (key === "revenue") {
    for (const [p, d, , paise] of s.pays) if (live(p)) inc(d, paise);
  } else if (key === "emails") {
    for (const [p, d, n] of s.mail) if (live(p)) inc(d, n);
  } else if (key === "replies") {
    for (const [p, d, n] of s.replies) if (live(p)) inc(d, n);
  }
  return m;
}

export interface FaceRow {
  key: FaceKey;
  label: string;
  inr: boolean;
  oldBest: { day: string; v: number } | null;
  newBest: { day: string; v: number; soFar: boolean } | null;
  today: number | null;
  yesterday: number | null;
  newAvg: number | null;
  oldAvg: number | null;
  oldWeek: { start: string; end: string; perDay: number } | null;
  newWeek: { start: string; end: string; perDay: number } | null;
  oldMonth: { month: string; perDay: number } | null;
  /** best day as a multiple: new's best over old's best */
  bestVsBest: Change;
}

function best(m: Map<string, number | null>, days: string[]): { day: string; v: number } | null {
  let out: { day: string; v: number } | null = null;
  for (const d of days) {
    const v = m.get(d);
    if (v == null) continue;
    if (!out || v > out.v) out = { day: d, v };
  }
  return out;
}

function bestRun(m: Map<string, number | null>, days: string[], n: number): { start: string; end: string; perDay: number } | null {
  if (days.length < n) return null;
  let out: { start: string; end: string; perDay: number } | null = null;
  for (let i = 0; i + n <= days.length; i++) {
    const run = days.slice(i, i + n);
    if (run.some((d) => m.get(d) == null)) continue;
    const sum = run.reduce((a, d) => a + (m.get(d) ?? 0), 0);
    if (!out || sum / n > out.perDay) out = { start: run[0], end: run[n - 1], perDay: sum / n };
  }
  return out;
}

export function faceOff(old: SideData, neu: SideData, nowMs: number): FaceRow[] {
  const today = istDay(nowMs);
  const oldDays = dayRange(old.from, old.to);
  const newDays = dayRange(neu.from, neu.to);
  const whole = newDays.filter((d) => d < today);
  return FACE_METRICS.map((f) => {
    const om = series(old, f.key);
    const nm = series(neu, f.key);
    const nb = best(nm, newDays);
    const months = oldMonths(old).map((w) => {
      const ds = dayRange(w.start, w.end).filter((d) => om.get(d) != null);
      return { month: monthOf(w.start), perDay: ds.length ? ds.reduce((a, d) => a + (om.get(d) ?? 0), 0) / ds.length : -1 };
    }).filter((x) => x.perDay >= 0);
    const oldMonth = months.length ? months.reduce((a, b) => (b.perDay > a.perDay ? b : a)) : null;
    const oTracked = oldDays.filter((d) => om.get(d) != null && d <= OLD_LAST_FULL_DAY);
    const nTracked = newDays.filter((d) => nm.get(d) != null);
    const nWeight = nTracked.reduce((a, d) => a + (f.key === "visitors" ? visitorWeight(neu, d, nowMs) : dayWeight("new", d, nowMs)), 0);
    const ob = best(om, oldDays);
    return {
      key: f.key, label: f.label, inr: "inr" in f && !!f.inr,
      oldBest: ob,
      newBest: nb ? { ...nb, soFar: nb.day === today } : null,
      today: nm.get(today) ?? null,
      yesterday: nm.get(addDays(today, -1)) ?? null,
      newAvg: nTracked.length && nWeight > 0 ? nTracked.reduce((a, d) => a + (nm.get(d) ?? 0), 0) / nWeight : null,
      oldAvg: oTracked.length ? oTracked.reduce((a, d) => a + (om.get(d) ?? 0), 0) / oTracked.length : null,
      oldWeek: bestRun(om, oldDays.filter((d) => d <= OLD_LAST_FULL_DAY), 7),
      newWeek: bestRun(nm, whole, 7),
      oldMonth,
      bestVsBest: change({ kind: "count", better: "up" }, ob?.v ?? null, nb?.v ?? null),
    };
  });
}

// ----------------------------------------------------------------- timeline

export interface TimelinePoint {
  /** IST day, or the Monday of a week */
  at: string;
  side: SideKey;
  /** part: a week on both sides of the relaunch, or the week holding today */
  part?: boolean;
  v: Record<FaceKey, number | null>;
}

/** Every day (or week) from the old product's first day to today; a week is split at the relaunch. */
export function timeline(old: SideData, neu: SideData, by: "day" | "week"): TimelinePoint[] {
  const sides = [old, neu];
  const maps = sides.map((s) => Object.fromEntries(FACE_METRICS.map((f) => [f.key, series(s, f.key)])) as Record<FaceKey, Map<string, number | null>>);
  if (by === "day") {
    const out: TimelinePoint[] = [];
    sides.forEach((s, k) => {
      for (const d of dayRange(s.from, s.to)) out.push({ at: d, side: s.side, v: Object.fromEntries(FACE_METRICS.map((f) => [f.key, maps[k][f.key].get(d) ?? null])) as Record<FaceKey, number | null> });
    });
    return out;
  }
  const out: TimelinePoint[] = [];
  sides.forEach((s, k) => {
    const days = dayRange(s.from, s.to);
    const groups = new Map<string, string[]>();
    for (const d of days) {
      const w = weekOf(d);
      groups.set(w, [...(groups.get(w) ?? []), d]);
    }
    for (const [w, ds] of groups) {
      const v = {} as Record<FaceKey, number | null>;
      for (const f of FACE_METRICS) {
        const vals = ds.map((d) => maps[k][f.key].get(d) ?? null).filter((x): x is number => x != null);
        if (!vals.length) v[f.key] = null;
        else if (f.key === "visitors") v[f.key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        else if (f.key === "payers") {
          const set = new Set<number>();
          for (const [p, d] of s.pays) if (!s.people[p]?.x && ds.includes(d)) set.add(p);
          v[f.key] = set.size;
        } else v[f.key] = vals.reduce((a, b) => a + b, 0);
      }
      out.push({ at: w, side: s.side, ...(ds.length < 7 ? { part: true } : {}), v });
    }
  });
  return out;
}

// ------------------------------------------------------------------ the funnels

export interface FunnelStep {
  key: string;
  label: string;
  from?: string;
  note?: string;
  people: PCell;
  /** % of the cohort */
  ofSignups: number | null;
  /** of the people who did the step before, the share who did this one too */
  ofPrev: number | null;
  /** median time from the step before (people who did both, in that order), ms */
  fromPrev: number | null;
  /** median time from sign-up, ms */
  fromSignup: number | null;
  /** tracked only from a day inside the window: reads low, and the step after it is measured from the one before */
  partial?: boolean;
}

export function funnelSteps(s: SideData, w: Win, horizon: number | null): FunnelStep[] {
  const ww = clip(w, s.from, s.to);
  const inWin = new Set(dayRange(ww.start, ww.end));
  const cohort: number[] = [];
  s.people.forEach((p, i) => {
    if (!p.x && inWin.has(istDay(p.su))) cohort.push(i);
  });
  let prev: string | null = null;
  return s.steps.map((st) => {
    // A step tracked only from a day after the window starts reads low: shown, but never the base of the next step.
    const partial = !!st.from && ww.start < st.from;
    const did = cohort.filter((i) => stepTime(s.people[i], st.key, horizon) != null);
    const both = prev ? did.filter((i) => stepTime(s.people[i], prev!, horizon) != null) : did;
    const prevDid = prev ? cohort.filter((i) => stepTime(s.people[i], prev!, horizon) != null).length : cohort.length;
    const gaps = prev ? both.map((i) => (stepTime(s.people[i], st.key, horizon) as number) - (stepTime(s.people[i], prev!, horizon) as number)).filter((x) => x >= 0) : [];
    const out: FunnelStep = {
      key: st.key, label: st.label, ...(st.from ? { from: st.from } : {}), ...(st.note ? { note: st.note } : {}),
      people: pc(did), ofSignups: pct(did.length, cohort.length), ofPrev: prev ? pct(both.length, prevDid) : null,
      fromPrev: prev ? median(gaps) : null,
      fromSignup: st.key === "signed_up" ? null : median(did.map((i) => (stepTime(s.people[i], st.key, horizon) as number) - s.people[i].su).filter((x) => x >= 0)),
      ...(partial ? { partial: true } : {}),
    };
    if (!partial) prev = st.key;
    return out;
  });
}

// -------------------------------------------------------------------- channels

export interface ChannelRow {
  key: string;
  old: { signups: number; share: number | null; paid: number; revenue: number };
  neu: { signups: number; share: number | null; paid: number; revenue: number; cell: PCell };
}

/** Sign-ups by first-touch channel, with how many of them paid and what they paid (any time). */
export function channels(old: SideData, oldWin: Win, neu: SideData, newWin: Win): { rows: ChannelRow[]; oldTotal: number; newTotal: number } {
  const tally = (s: SideData, w: Win) => {
    const ww = clip(w, s.from, s.to);
    const inWin = new Set(dayRange(ww.start, ww.end));
    const rev = new Map<number, number>();
    for (const [p, , , paise] of s.pays) rev.set(p, (rev.get(p) ?? 0) + paise);
    const by = new Map<string, number[]>();
    let total = 0;
    s.people.forEach((p, i) => {
      if (p.x || !inWin.has(istDay(p.su))) return;
      total++;
      by.set(p.ch, [...(by.get(p.ch) ?? []), i]);
    });
    return { by, total, rev, s };
  };
  const o = tally(old, oldWin);
  const n = tally(neu, newWin);
  const keys = [...new Set([...o.by.keys(), ...n.by.keys()])];
  const stat = (t: ReturnType<typeof tally>, k: string) => {
    const us = t.by.get(k) ?? [];
    const paid = us.filter((i) => t.s.people[i].t.paid != null);
    return { signups: us.length, share: pct(us.length, t.total), paid: paid.length, revenue: us.reduce((a, i) => a + (t.rev.get(i) ?? 0), 0), us };
  };
  const rows = keys.map((k) => {
    const a = stat(o, k);
    const b = stat(n, k);
    return { key: k, old: { signups: a.signups, share: a.share, paid: a.paid, revenue: a.revenue }, neu: { signups: b.signups, share: b.share, paid: b.paid, revenue: b.revenue, cell: pc(b.us) } };
  }).sort((a, b) => b.neu.signups + b.old.signups - (a.neu.signups + a.old.signups));
  return { rows, oldTotal: o.total, newTotal: n.total };
}

// ---------------------------------------------------------------- the monthly table

export interface MonthRow {
  label: string;
  side: SideKey;
  win: Win;
  part: boolean;
  m: WinMetrics;
}

/** Old calendar months, the old product's last day (2 Nov), then Stu from 3 Nov to today. */
export function monthWindows(old: SideData, neu: SideData): { label: string; side: SideKey; win: Win; part: boolean }[] {
  const out = oldMonths(old).map((w) => ({ label: monthText(monthOf(w.start)), side: "old" as SideKey, win: w, part: w.start.slice(8) !== "01" || w.end !== lastOfMonth(monthOf(w.start)) }));
  const tail = `${monthOf(OLD_OFF_DAY)}-01`;
  if (old.to >= tail) out.push({ label: `${dayText(tail)} to ${dayText(old.to)} (old, off 2 Nov 03:55)`, side: "old", win: { start: tail < old.from ? old.from : tail, end: old.to }, part: true });
  out.push({ label: `${dayText(neu.from)} to ${dayText(neu.to)} (Stu)`, side: "new", win: { start: neu.from, end: neu.to }, part: true });
  return out;
}

// ------------------------------------------------------------------------ the report

export interface Params {
  newWin: Win;
  base: BaseSpec;
  horizon: number | null;
  nowMs: number;
}

export interface Report {
  newWin: Win;
  newDays: number;
  newCal: number;
  base: Baseline;
  baseDays: number;
  horizon: number | null;
  old: WinMetrics;
  neu: WinMetrics;
  rows: Row[];
  face: FaceRow[];
  funnels: { old: FunnelStep[]; neu: FunnelStep[] };
  channels: ReturnType<typeof channels> & { oldWin: Win };
  months: MonthRow[];
  monthList: string[];
  timeline: { day: TimelinePoint[]; week: TimelinePoint[] };
}

/** The new window as asked, kept to Stu's days (3 Nov to today). */
export function newWindow(neu: Pick<SideData, "from" | "to">, w: Win): Win {
  const c = clip(w, neu.from, neu.to);
  return c.start > c.end ? { start: neu.from, end: neu.to } : c;
}

/**
 * The windows whose distinct PostHog visitors the report reads, as winMetrics asks for them (the server reads them
 * from PostHog before calling report): the old side's (its visitors are PostHog) and the new side's PostHog row.
 */
export function windowsNeeded(old: SideData, neu: SideData, p: Params): { old: Win[]; neuPh: Win[] } {
  const nw = newWindow(neu, p.newWin);
  const b = baseline(old, p.base, calDays(nw.start, nw.end));
  const mw = monthWindows(old, neu);
  const uniq = (ws: (Win | null)[]) => [...new Map(ws.filter((w): w is Win => w != null).map((w) => [winKey(w), w])).values()];
  return {
    old: uniq([b, ...mw.filter((x) => x.side === "old").map((x) => x.win)].map((w) => trackedWin(old, w, old.visitors))),
    neuPh: neu.ph ? uniq([nw, ...mw.filter((x) => x.side === "new").map((x) => x.win)].map((w) => trackedWin(neu, w, neu.ph!))) : [],
  };
}

export function report(old: SideData, neu: SideData, p: Params): Report {
  const nw = newWindow(neu, p.newWin);
  const b = baseline(old, p.base, calDays(nw.start, nw.end));
  const o = { nowMs: p.nowMs, horizon: p.horizon };
  const om = winMetrics(old, b, o);
  const nm = winMetrics(neu, nw, o);
  const oldChWin = { start: ATTRIBUTION_FROM, end: old.to };
  return {
    newWin: nw, newDays: nm.days, newCal: nm.calDays, base: b, baseDays: om.days, horizon: p.horizon,
    old: om, neu: nm,
    rows: scoreboard(om, nm),
    face: faceOff(old, neu, p.nowMs),
    funnels: { old: funnelSteps(old, b, p.horizon), neu: funnelSteps(neu, nw, p.horizon) },
    channels: { ...channels(old, oldChWin, neu, nw), oldWin: oldChWin },
    months: monthWindows(old, neu).map((x) => ({ ...x, m: winMetrics(x.side === "old" ? old : neu, x.win, o) })),
    monthList: oldMonths(old).map((w) => monthOf(w.start)),
    timeline: { day: timeline(old, neu, "day"), week: timeline(old, neu, "week") },
  };
}

// ------------------------------------------------------------- the new side, from Stu

/** The Stu model's functions newSide uses (the page passes the module; the test passes the same module). */
export type StuFns = Pick<typeof StuLib, "USER_STEPS" | "stepAt" | "istDay" | "activity" | "DAILY_METRICS" | "dayRange">;

/** What the server reads for Stu beyond the Stu dataset, per person index and IST day (new.server.ts). */
export interface NewExtras {
  /** contacts first emailed: [person, day, n] */
  reach: ReachRow[];
  /** positive replies: [person, day, n] (same rule as Stu's replies) */
  positive: [number, string, number][];
  /** bounces: [person, day, n] */
  bounces: [number, string, number][];
  refunds: RefundRow[];
  /** PostHog $pageview people per IST day on the student hosts from 3 Nov, or null */
  ph: Record<string, number> | null;
  phDistinct: (w: Win) => number | null;
}

/**
 * Stu in the shared shape, from the Stu dataset with the Stu model's own functions (stu), so each number is the one
 * the Stu pages show: people are the dataset's users at the same indexes (internal ones marked x, as the pages leave
 * them out), a step's time is stepAt, payments and revenue the "pay" rows (Daily's Paid users and Revenue), emails and
 * replies the "email" and "reply" rows, actives the activity model (Daily's Active), visitors the Daily Visitors cell.
 */
export function newSide(d: StuData, stu: StuFns, x: NewExtras, today: string, internal = false): SideData {
  const from = d.countFrom != null ? stu.istDay(d.countFrom) : RELAUNCH_DAY;
  const people: SidePerson[] = d.users.map((u) => {
    const t: Record<string, number> = {};
    for (const s of stu.USER_STEPS) {
      if (s.key === "signed_up") continue;
      const at = stu.stepAt(d, u, s.key);
      if (at != null) t[s.key] = at;
    }
    return { su: u.joined, ch: u.ch, t, ...(u.internal && !internal ? { x: 1 as const } : {}) };
  });
  const pays: PayRow[] = [];
  const mail: MailRow[] = [];
  const replies: ReplyRow[] = [];
  const pos = new Map(x.positive.map(([p, day, n]) => [`${p}|${day}`, n]));
  const bounce = new Map(x.bounces.map(([p, day, n]) => [`${p}|${day}`, n]));
  for (const [k, u, day, n, amt] of d.act) {
    if (u < 0) continue;
    if (k === "pay") pays.push([u, day, n, amt, 0]);
    else if (k === "email") mail.push([u, day, n, -1, bounce.get(`${u}|${day}`) ?? 0]);
    else if (k === "reply") replies.push([u, day, n, Math.min(n, pos.get(`${u}|${day}`) ?? 0)]);
  }
  // A bounce on a day with no email sent still counts.
  const mailed = new Set(mail.map(([u, day]) => `${u}|${day}`));
  for (const [u, day, n] of x.bounces) if (!mailed.has(`${u}|${day}`)) mail.push([u, day, 0, -1, n]);
  const active: ActiveRow[] = [];
  for (const [u, m] of stu.activity(d).days) for (const day of m.keys()) active.push([u, day]);

  const visitorsMetric = stu.DAILY_METRICS.find((m) => m.key === "visitors")!;
  const f = { start: from, end: today, internal, channel: "all" };
  const scope = new Set<number>();
  const visitors: Record<string, number> = {};
  if (d.journeyLive) {
    for (const day of stu.dayRange(from, today)) {
      const c = visitorsMetric.cell(d, { ...f, start: day, end: day }, new Set([day]), scope);
      if (!c.na && !c.old) visitors[day] = c.v;
    }
  }
  const distinctCache = new Map<string, number | null>();
  const distinct = (w: Win): number | null => {
    const key = winKey(w);
    if (!distinctCache.has(key)) {
      const c = visitorsMetric.cell(d, { ...f, start: w.start, end: w.end }, new Set(stu.dayRange(w.start, w.end)), scope);
      distinctCache.set(key, c.na || c.old ? null : c.v);
    }
    return distinctCache.get(key)!;
  };
  return {
    side: "new", from, to: today, people,
    steps: stu.USER_STEPS.map((s) => ({ key: s.key, label: s.label })),
    act: { start: "call_started", value: "onboarded" },
    pays, refunds: x.refunds, refundsKept: true, mail, reach: x.reach, replies, active,
    visitors, visitorsFromMs: d.pageViewStart ?? null, distinct,
    ph: x.ph, phDistinct: x.phDistinct,
  };
}

/** The old product's funnel, in the order a person went through it. */
export const OLD_STEPS: StepDef[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "resume", label: "Uploaded a resume (started outreach)" },
  { key: "quiz_started", label: "Started the quiz", from: "2026-05-21" },
  { key: "quiz_done", label: "Finished the quiz" },
  { key: "leads", label: "Leads generated" },
  { key: "leads_viewed", label: "Viewed the leads", from: "2026-09-25" },
  { key: "pricing", label: "Saw the pricing page", note: "payment_page_reached_at: saw it, not tapped pay" },
  { key: "paid", label: "Paid (real money)" },
  { key: "gmail", label: "Gmail connected" },
  { key: "launched", label: "Campaign launched" },
  { key: "first_email", label: "First email sent" },
  { key: "first_reply", label: "First reply" },
];

// ------------------------------------------------------------------ the answer

export interface OldMoney {
  /** payments at the test-mode prices (₹90, $1): no money moved */
  testPrice: number;
  /** payments by team, test or B2B accounts */
  team: number;
  /** refunded in full */
  zero: number;
}

export interface OldOther {
  resumeBuilder: { sessions: number; people: number } | null;
  internshipApps: { n: number; people: number } | null;
  resumes: { n: number; people: number } | null;
  dissertations: { n: number; paise: number; from: string | null; to: string | null } | null;
  assignment: { payments: number; team: number; paise: number } | null;
}

/** GET /api/compare */
export interface CompareEnvelope {
  generatedAt: string;
  oldReadAt: string;
  newReadAt: string;
  env: string;
  /** this database holds the old product's tables */
  present: boolean;
  report: Report;
  /** the Stu people the new side's numbers point at (index -> person), for the drill-down */
  people: Record<number, OvPerson>;
  visitors: { old: boolean; posthogNew: boolean; error: string | null };
  /** old accounts left out, by reason */
  excluded: Record<string, number>;
  accounts: number;
  kept: number;
  money: OldMoney;
  other: OldOther;
  /** the old side's active days include PostHog's signed-in browsing */
  activeFromPosthog: boolean;
  newMissing: string[];
  ms: number;
}
