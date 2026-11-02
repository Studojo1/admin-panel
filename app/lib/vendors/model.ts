// Vendors and credits (2 Nov 2026): how many credits our two people-data vendors
// have left, how fast we spend them and what happens next. Shared by the server
// loader (vendors.server.ts) and the /vendors page. No imports, so
// `node --test scripts/vendors-model.test.mjs` reads it as is.
//
// Usage comes from career_agent.career_vendor_calls (one row per vendor call,
// written by career-agent). credits_spent is what the call cost; free calls
// (searches, balance reads) log 0, so the daily spend is the plain sum of
// credits_spent per IST day. Hit rate looks only at the kind that spends
// (LeadsForge 'email', Apollo 'match'): a hit is a call that spent credits.

export const VENDORS = [
  { key: "leadsforge", label: "LeadsForge", env: "LEADSFORGE_API_KEY", spendKind: "email" },
  { key: "apollo", label: "Apollo", env: "APOLLO_API_KEY", spendKind: "match" },
] as const;
export type VendorKey = (typeof VENDORS)[number]["key"];

export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
/** Days of history the page reads and charts. */
export const HISTORY_DAYS = 30;
/** Days the burn rate averages over. */
export const BURN_DAYS = 7;

/** IST calendar day (YYYY-MM-DD) of an epoch ms. */
export const istDay = (ms: number): string => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

/** A YYYY-MM-DD day moved by n days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from day a to day b (b later is positive). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "8 Nov", or "8 Nov 2027" when the year is not the reference day's year. */
export function fmtDay(day: string, ref?: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return ref && ref.slice(0, 4) !== day.slice(0, 4) ? `${base} ${y}` : base;
}

/** 1,284 style, whole numbers; one decimal under 10 when it is not whole. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.abs(n) < 10 && !Number.isInteger(n) ? Math.round(n * 10) / 10 : Math.round(n);
  return r.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Balances

export type BalanceState = "ok" | "out" | "bad_key" | "no_scope" | "no_key" | "error";
export interface Balance {
  state: BalanceState;
  /** Credits left, when the vendor told us (0 when out). */
  credits: number | null;
  /** Apollo: the cycle's lead credit limit and use so far. */
  limit: number | null;
  consumed: number | null;
  /** Apollo: the current credit cycle, as IST days. */
  cycleStart: string | null;
  renewsOn: string | null;
  /** Plain words for the page when the balance is not a number. */
  note: string | null;
  /** epoch ms the vendor answered (null when we never asked). */
  checkedAt: number | null;
}

// ---------------------------------------------------------------------------
// Usage

/** One aggregate row from career_agent.career_vendor_calls: one vendor, kind and IST day. */
export interface DayRow {
  vendor: string;
  kind: string;
  day: string;
  calls: number;
  /** ok IS FALSE */
  failed: number;
  /** ok IS NULL (still in flight) */
  pending: number;
  /** credits_spent > 0 */
  hits: number;
  credits: number;
}

export interface DayPoint {
  day: string;
  credits: number;
  calls: number;
  hits: number;
}

export interface KindTotal {
  kind: string;
  calls: number;
  failed: number;
  hits: number;
  credits: number;
}

export interface VendorStats {
  vendor: VendorKey;
  label: string;
  env: string;
  spendKind: string;
  balance: Balance;
  today: string;
  usedToday: number;
  callsToday: number;
  /** Over the burn window, the spend kind only. */
  calls7: number;
  hits7: number;
  failed7: number;
  /** hits / finished calls of the spend kind, null without finished calls. */
  hitRate7: number | null;
  /** Average credits a day; null when there is no usage log. */
  burnPerDay: number | null;
  burnDays: number;
  /** Plain words: what the burn rate averages over. */
  burnBasis: string;
  /** null when the balance is unknown or nothing was spent. */
  daysLeft: number | null;
  runOutDay: string | null;
  /** HISTORY_DAYS IST days, oldest first, today last. */
  series: DayPoint[];
  kinds: KindTotal[];
}

/**
 * The numbers for one vendor. `logStart` is the first IST day with any vendor
 * call in the window (null: none), so a log that went live 3 days ago averages
 * over those 3 days, not 7.
 */
export function vendorStats(
  vendor: VendorKey,
  rows: DayRow[],
  balance: Balance,
  nowMs: number,
  logLive: boolean,
  logStart: string | null,
): VendorStats {
  const meta = VENDORS.find((v) => v.key === vendor)!;
  const today = istDay(nowMs);
  const mine = rows.filter((r) => r.vendor === vendor);

  const byDay = new Map<string, DayPoint>();
  const kinds = new Map<string, KindTotal>();
  for (const r of mine) {
    const p = byDay.get(r.day) ?? { day: r.day, credits: 0, calls: 0, hits: 0 };
    p.credits += r.credits;
    p.calls += r.calls;
    if (r.kind === meta.spendKind) p.hits += r.hits;
    byDay.set(r.day, p);
    if (r.day > addDays(today, -HISTORY_DAYS)) {
      const k = kinds.get(r.kind) ?? { kind: r.kind, calls: 0, failed: 0, hits: 0, credits: 0 };
      k.calls += r.calls;
      k.failed += r.failed;
      k.hits += r.hits;
      k.credits += r.credits;
      kinds.set(r.kind, k);
    }
  }
  const series: DayPoint[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    series.push(byDay.get(day) ?? { day, credits: 0, calls: 0, hits: 0 });
  }
  const todayPoint = series[series.length - 1];

  // Burn: the last BURN_DAYS whole IST days before today, from the day the log started.
  const window: string[] = [];
  for (let i = BURN_DAYS; i >= 1; i--) window.push(addDays(today, -i));
  let burnPerDay: number | null;
  let burnDays: number;
  let burnBasis: string;
  if (!logLive) {
    burnPerDay = null;
    burnDays = 0;
    burnBasis = "no usage log yet";
  } else {
    const counted = logStart ? window.filter((d) => d >= logStart) : window;
    if (counted.length > 0) {
      const spent = counted.reduce((s, d) => s + (byDay.get(d)?.credits ?? 0), 0);
      burnPerDay = spent / counted.length;
      burnDays = counted.length;
      burnBasis = counted.length === BURN_DAYS
        ? `last ${BURN_DAYS} days`
        : `last ${counted.length} day${counted.length === 1 ? "" : "s"} (the log started ${fmtDay(logStart!, today)})`;
    } else {
      // The log started today: today so far is the only evidence.
      burnPerDay = todayPoint.credits;
      burnDays = 0;
      burnBasis = "today so far (the log started today)";
    }
  }

  const spendRows = mine.filter((r) => r.kind === meta.spendKind && window.includes(r.day));
  const calls7 = spendRows.reduce((s, r) => s + r.calls, 0);
  const hits7 = spendRows.reduce((s, r) => s + r.hits, 0);
  const failed7 = spendRows.reduce((s, r) => s + r.failed, 0);
  const finished = calls7 - spendRows.reduce((s, r) => s + r.pending, 0);
  const hitRate7 = finished > 0 ? hits7 / finished : null;

  let daysLeft: number | null = null;
  let runOutDay: string | null = null;
  if (balance.credits != null) {
    if (balance.credits <= 0) {
      daysLeft = 0;
      runOutDay = today;
    } else if (burnPerDay != null && burnPerDay > 0) {
      daysLeft = balance.credits / burnPerDay;
      runOutDay = istDay(nowMs + daysLeft * DAY_MS);
    }
  }

  return {
    vendor,
    label: meta.label,
    env: meta.env,
    spendKind: meta.spendKind,
    balance,
    today,
    usedToday: todayPoint.credits,
    callsToday: todayPoint.calls,
    calls7,
    hits7,
    failed7,
    hitRate7,
    burnPerDay,
    burnDays,
    burnBasis,
    daysLeft,
    runOutDay,
    series,
    kinds: [...kinds.values()].sort((a, b) => b.credits - a.credits || b.calls - a.calls),
  };
}

/** The first IST day with any vendor call in the rows, or null. */
export const logStartOf = (rows: DayRow[]): string | null =>
  rows.reduce<string | null>((min, r) => (r.calls > 0 && (min == null || r.day < min) ? r.day : min), null);

// ---------------------------------------------------------------------------
// The "next thing" line

export type Level = "critical" | "warning" | "info";
export interface NextThing {
  level: Level;
  vendor: VendorKey | null;
  text: string;
  /** Days until it happens (0: now). Orders items within a level. */
  inDays: number;
}

const LEVEL_RANK: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
/** An unknown balance has no date: it sorts after the dated warnings (a run-out within 14 days). */
const UNKNOWN = 100;

function daysWord(daysLeft: number, runOutDay: string, today: string): string {
  if (runOutDay === today) return "today";
  if (daysLeft < 1) return `within a day (${fmtDay(runOutDay, today)})`;
  const n = Math.max(1, Math.round(daysLeft));
  return `in about ${n} day${n === 1 ? "" : "s"} (${fmtDay(runOutDay, today)})`;
}

/** What happens next, most urgent first. Plain words, no dashes. */
export function nextThings(stats: VendorStats[], logLive: boolean): NextThing[] {
  const out: NextThing[] = [];
  for (const s of stats) {
    const b = s.balance;
    const L = s.label;
    const renew = b.renewsOn ? fmtDay(b.renewsOn, s.today) : null;
    const toRenew = b.renewsOn ? Math.max(0, daysBetween(s.today, b.renewsOn)) : Infinity;
    let renewSaid = false;
    switch (b.state) {
      case "out":
        out.push({ level: "critical", vendor: s.vendor, inDays: 0, text: `${L} is out of credits.${renew ? ` Credits renew on ${renew}.` : ""}` });
        renewSaid = true;
        break;
      case "bad_key":
        out.push({ level: "critical", vendor: s.vendor, inDays: 0, text: `${L} balance unknown: the key was rejected. Check ${s.env}.` });
        break;
      case "no_key":
        out.push({ level: "warning", vendor: s.vendor, inDays: UNKNOWN, text: `${L} balance unknown: ${s.env} is not set here.` });
        break;
      case "no_scope":
        out.push({ level: "warning", vendor: s.vendor, inDays: UNKNOWN, text: `${L} balance unknown: key cannot read it (needs a master API key).` });
        break;
      case "error":
        out.push({ level: "warning", vendor: s.vendor, inDays: UNKNOWN, text: `${L} balance unknown: ${b.note ?? "the vendor did not answer"}.` });
        break;
      case "ok": {
        const left = fmtNum(b.credits ?? 0);
        if (s.daysLeft != null && s.runOutDay) {
          if (b.renewsOn && b.renewsOn <= s.runOutDay) {
            out.push({ level: "info", vendor: s.vendor, inDays: toRenew, text: `${L} credits renew on ${renew}, before they run out at the current pace (${left} left).` });
          } else {
            const level: Level = s.daysLeft <= 3 ? "critical" : s.daysLeft <= 14 ? "warning" : "info";
            out.push({
              level,
              vendor: s.vendor,
              inDays: s.daysLeft,
              text: `${L} runs out ${daysWord(s.daysLeft, s.runOutDay, s.today)} at the current pace (${left} left, about ${fmtNum(s.burnPerDay ?? 0)} a day).${renew ? ` Credits renew on ${renew}.` : ""}`,
            });
          }
          renewSaid = true;
        } else if (s.burnPerDay === 0) {
          out.push({ level: "info", vendor: s.vendor, inDays: 9999, text: `${L}: no spend in the last ${s.burnDays || BURN_DAYS} days, ${left} credits left.` });
        } else {
          out.push({ level: "info", vendor: s.vendor, inDays: 9999, text: `${L}: ${left} credits left.` });
        }
        break;
      }
    }
    if (renew && !renewSaid) out.push({ level: "info", vendor: s.vendor, inDays: toRenew, text: `${L} credits renew on ${renew}.` });
  }
  if (!logLive) {
    out.push({ level: "info", vendor: null, inDays: 10_000, text: "No usage log yet: career_agent.career_vendor_calls is not in this database, so spend and run-out dates cannot be worked out." });
  }
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.inDays - b.inDays);
}

// ---------------------------------------------------------------------------
// Chart scale

/** Round y-axis ticks from 0 to at least max (3 to 5 ticks). */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  // Credits are whole numbers, so a step is never below 1.
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/** What the API answers: everything the page draws. */
export interface VendorsReport {
  generatedAt: string;
  today: string;
  logLive: boolean;
  logStart: string | null;
  vendors: VendorStats[];
  next: NextThing[];
}

/** Build the report from the log rows and the balances (pure, for tests). */
export function buildReport(rows: DayRow[], balances: Record<VendorKey, Balance>, nowMs: number, logLive: boolean): VendorsReport {
  const logStart = logStartOf(rows);
  const vendors = VENDORS.map((v) => vendorStats(v.key, rows, balances[v.key], nowMs, logLive, logStart));
  return {
    generatedAt: new Date(nowMs).toISOString(),
    today: istDay(nowMs),
    logLive,
    logStart,
    vendors,
    next: nextThings(vendors, logLive),
  };
}
