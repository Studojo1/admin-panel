// Stu tracking (the new product on studojo.pro), shared by the server loader and
// every Stu page. Plan: owner-decisions/2026-11-01/tracking.html (approved 1 Nov
// 2026). No imports, so `node --test scripts/stu-model.test.mjs` reads it as is.
//
// STEPS is the ONE list of journey steps, in plan order. The first name in
// `journey` is the one career-agent writes (its docs/tracking-steps.md and
// app/lib/journey.ts, 2 Nov 2026); every name listed counts as that step, so a
// renamed step only needs its new name added here. `truth` names the product table that
// is the ground truth for the step; the server loader (data.server.ts) holds the
// query for each truth key. A step with no truth table counts from the journey
// log alone (career_agent.career_journey_events).
//
// `gate` marks the spine of the nested funnel: a nested step counts only people
// who did every earlier gate step. Branch steps (phone, chat, WhatsApp, plans)
// and steps with no history before the journey log went live are not gates, so
// one missing beacon never empties the funnel below it.

export const STEPS = [
  { key: "visited_home", n: "1", label: "Visited", phase: "Arrive", anon: true, journey: ["visited_home"], truth: null },
  { key: "clicked_join", n: "2", label: "Opened Stu", phase: "Arrive", anon: true, journey: ["clicked_join"], truth: null },
  { key: "saw_signup", n: "3", label: "Saw sign-up", phase: "Arrive", anon: true, journey: ["signup_started", "saw_signup"], truth: null },
  { key: "signed_up", n: "4", label: "Signed up (Google)", phase: "Sign up", gate: true, journey: ["signed_up"], truth: 'public."user".created_at (first Stu activity for an older account)' },
  { key: "verified_phone", n: "4b", label: "Verified phone", phase: "Sign up", journey: ["phone_verified", "verified_phone"], truth: "career_phones.verified_at" },
  { key: "reached_stu", n: "5", label: "Reached Stu", phase: "Sign up", journey: ["reached_stu"], truth: null },
  { key: "call_started", n: "6", label: "Call started", phase: "Call", gate: true, journey: ["call_started"], truth: "career_voice_calls.started_at (onboarding, returning, build calls)" },
  { key: "first_question", n: "7", label: "First question asked", phase: "Call", journey: ["first_question"], truth: "career_voice_calls.timeline mic_open" },
  { key: "resume_in_call", n: "8", label: "Resume in call", phase: "Call", journey: ["resume_in_call"], truth: "career_voice_calls.resume (onboarding calls), timeline phase reading" },
  { key: "call_completed", n: "9", label: "Call completed", phase: "Call", gate: true, journey: ["call_completed"], truth: "career_voice_calls status ready or finished" },
  { key: "onboarded", n: "10", label: "Onboarded", phase: "Call", gate: true, journey: ["onboarded"], truth: "career_profiles.onboarded_at" },
  { key: "opened_desk", n: "11", label: "Opened desk", phase: "Use", journey: ["desk_opened", "opened_desk"], truth: null },
  { key: "saw_jobs", n: "12", label: "Saw jobs", phase: "Use", gate: true, journey: ["saw_jobs"], truth: "career_job_views.viewed_at (first view)" },
  { key: "opened_job", n: "13", label: "Opened a job", phase: "Use", journey: ["job_opened", "opened_job"], truth: null },
  { key: "saved_job", n: "14", label: "Saved a job", phase: "Use", journey: ["job_saved", "saved_job"], truth: "career_matches state saved or applied" },
  { key: "apply_click", n: "15", label: "Apply click", phase: "Use", journey: ["apply_clicked", "apply_click"], truth: null },
  { key: "chatted", n: "16", label: "Chatted with Stu", phase: "Use", journey: ["chatted"], truth: "career_messages, career_channel_messages, desk and interview calls (after onboarding)" },
  { key: "whatsapp_linked", n: "17", label: "WhatsApp linked", phase: "Use", journey: ["whatsapp_linked"], truth: "career_channel_links (whatsapp, imessage)" },
  { key: "outreach_started", n: "18", label: "Outreach started", phase: "Outreach", journey: ["outreach_started"], truth: "career_outreach find run (find_at), career_campaigns not draft" },
  { key: "mailbox_connected", n: "19", label: "Mailbox connected", phase: "Outreach", journey: ["mailbox_connected"], truth: "career_mail_accounts.verified_at (not test inboxes)" },
  { key: "first_email_sent", n: "20", label: "First email sent", phase: "Outreach", journey: ["first_email_sent", "email_sent"], truth: "career_emails sent, not dry run" },
  { key: "first_reply", n: "21", label: "First reply", phase: "Outreach", journey: ["first_reply"], truth: "career_sequences.replied_at (not bounce, not dry run)" },
  { key: "saw_plans", n: "22", label: "Saw plans", phase: "Pay", journey: ["saw_plans"], truth: null },
  { key: "paid", n: "23", label: "Paid (real)", phase: "Pay", journey: ["paid"], truth: "career_credit_orders paid (not test), career_plans not test" },
] as const satisfies readonly StepDef[];

/**
 * Activity beacons (career-agent, 2 Nov 2026): active_day (once a person a day,
 * props.first_path, props.via) and feature_used (once a person, feature and day,
 * props.feature). Not funnel steps; they feed the activity model below.
 */
export const ACTIVITY_EVENTS = ["active_day", "feature_used"] as const;

/** Journey names that are not funnel steps but feed drop-offs (reason: mic_denied, no_mic, no_network, error, dropped, finish_failed). */
export const EXTRA_EVENTS = {
  call_failed: ["call_failed"],
} as const;

export interface StepDef {
  key: string;
  n: string;
  label: string;
  phase: string;
  journey: readonly string[];
  truth: string | null;
  gate?: boolean;
  anon?: boolean;
}

export type StepKey = (typeof STEPS)[number]["key"];
export const STEP_KEYS: StepKey[] = STEPS.map((s) => s.key);
export const STEP_BY_KEY: Record<string, StepDef> = Object.fromEntries(STEPS.map((s) => [s.key, s]));
/** journey name -> step key */
export const JOURNEY_NAME_TO_STEP: Record<string, string> = Object.fromEntries(
  STEPS.flatMap((s) => s.journey.map((j) => [j, s.key])),
);
export const USER_STEPS = STEPS.filter((s) => !("anon" in s && s.anon));
export const ANON_STEPS = STEPS.filter((s) => "anon" in s && s.anon);

// ---------------------------------------------------------------- wire format

export interface Touch {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  referrer?: string | null;
  device?: string | null;
  city?: string | null;
}

export interface WireUser {
  id: string;
  email: string;
  name: string;
  /** why the account is internal (staff, studojo.com, test account, guest), or null */
  internal: string | null;
  /** public."user".created_at, epoch ms */
  created: number;
  /** when they joined Stu: the account's creation, or the first Stu activity for an older account */
  joined: number;
  existing: boolean;
  /** channel key (utm-dictionary CHANNELS) */
  ch: string;
  touch: Touch | null;
  /** first time per step from its ground-truth table, epoch ms */
  t: Partial<Record<string, number>>;
  /** first time per step from the journey log, epoch ms */
  j: Partial<Record<string, number>>;
  /** how they onboarded: call or typed setup */
  via: "call" | "typed" | null;
  /** first test payment, epoch ms */
  testPaid: number | null;
}

export interface WireVisitor {
  id: string;
  /** index into users, or -1 */
  u: number;
  ch: string;
  device: string | null;
  city: string | null;
  /** step key -> IST days on which the visitor did it */
  days: Partial<Record<string, string[]>>;
  /** step key -> first time, epoch ms */
  first: Partial<Record<string, number>>;
}

/** [kind, user index, IST day, count, amount in paise] */
export type Act = [string, number, string, number, number];

/** [user index, mode, status, error, created ms, started ms, ended ms, duration s, dropped, resume, completed] */
export type WireCall = [number, string, string, string | null, number, number | null, number | null, number | null, 0 | 1, 0 | 1, 0 | 1];

/** [user index, ms, reason] from journey call failures */
export type WireFail = [number, number, string];

export interface JourneyStepRow {
  step: string;
  /** the STEPS key it counts as, or null when no step lists the name */
  as: string | null;
  events: number;
  users: number;
  visitors: number;
  first: number | null;
  last: number | null;
}

export interface StuData {
  generatedAt: string;
  /** tables or columns this environment lacks (a metric reading them shows as not available) */
  missing: string[];
  journeyLive: boolean;
  sourceLive: boolean;
  /** earliest journey event, epoch ms */
  journeyStart: number | null;
  /** earliest journey event written live (not props.backfill), epoch ms; null while the log holds only the backfill */
  journeyLiveStart?: number | null;
  /** per step: the truth table exists here */
  truthOn: Record<string, boolean>;
  users: WireUser[];
  visitors: WireVisitor[];
  act: Act[];
  calls: WireCall[];
  fails: WireFail[];
  journeySteps: JourneyStepRow[];
  envs: { env: string; n: number }[];
  testUsers: string[];
}

// --------------------------------------------------------------------- time

export const IST_OFFSET_MS = 330 * 60_000;
export const istDay = (ms: number): string => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 800; d = addDays(d, 1)) out.push(d);
  return out;
};
export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
/** Monday of the IST week holding `day` */
export const weekOf = (day: string): string => {
  const dow = new Date(day + "T00:00:00Z").getUTCDay(); // 0 Sunday
  return addDays(day, -((dow + 6) % 7));
};
export const todayIst = (): string => istDay(Date.now());

// ------------------------------------------------------------------ scoping

export interface Filters {
  start: string;
  end: string;
  internal: boolean;
  /** channel key, or "all" */
  channel: string;
}

export const userInScope = (u: WireUser, f: Filters): boolean =>
  (f.internal || !u.internal) && (f.channel === "all" || u.ch === f.channel);

export function visitorInScope(v: WireVisitor, d: StuData, f: Filters): boolean {
  if (v.u >= 0 && !f.internal && d.users[v.u]?.internal) return false;
  const ch = v.u >= 0 ? d.users[v.u]?.ch ?? v.ch : v.ch;
  return f.channel === "all" || ch === f.channel;
}

/** Indexes of in-scope users. */
export const scopeUsers = (d: StuData, f: Filters): number[] =>
  d.users.map((u, i) => (userInScope(u, f) ? i : -1)).filter((i) => i >= 0);

/** The funnel's starting group (owner decision, 1 Nov): people who joined Stu in the range. */
export const cohortOf = (d: StuData, f: Filters): number[] =>
  scopeUsers(d, f).filter((i) => {
    const day = istDay(d.users[i].joined);
    return day >= f.start && day <= f.end;
  });

/**
 * When a person first did a step. A step with a ground-truth table counts the
 * people that table holds (the journey log cannot add anyone), at the earlier of
 * the two times (the log keeps the first time where a table overwrites it). A
 * step with no table here counts from the journey log.
 */
export function stepAt(d: StuData, u: WireUser, key: string): number | null {
  if (key === "signed_up") return u.joined;
  const def = STEP_BY_KEY[key];
  if (!def) return null;
  const j = u.j[key] ?? null;
  if (def.truth && d.truthOn[key]) {
    const t = u.t[key] ?? null;
    if (t == null) return null;
    return j != null && j < t ? j : t;
  }
  return j;
}

/** Where a step's number comes from, for the small source note. */
export function stepSource(d: StuData, key: string): string {
  const def = STEP_BY_KEY[key];
  if (!def) return "";
  const log = d.journeyLive ? "journey log" : "journey log (not live yet)";
  if (key === "signed_up") return def.truth ?? "";
  if (def.truth && d.truthOn[key]) return `${def.truth}; time: earlier of it and the ${log}`;
  if (def.truth) return `${log} (table missing here: ${def.truth})`;
  return def.anon ? `${log}, browser beacon by visitor id` : log;
}

/** The furthest user step a person reached, by plan order (index into USER_STEPS), or -1. */
export function furthestStep(d: StuData, u: WireUser): number {
  let best = -1;
  USER_STEPS.forEach((s, i) => {
    if (stepAt(d, u, s.key) != null) best = i;
  });
  return best;
}

export function lastActive(d: StuData, i: number, actByUser?: Map<number, string>): number {
  const u = d.users[i];
  let last = u.joined;
  for (const s of USER_STEPS) {
    const t = stepAt(d, u, s.key);
    if (t != null && t > last) last = t;
  }
  const day = actByUser?.get(i);
  if (day) {
    const ms = Date.parse(day + "T00:00:00Z") - IST_OFFSET_MS;
    if (ms > last) last = ms;
  }
  return last;
}

/** user index -> latest IST day with any activity row */
export function lastActDay(d: StuData): Map<number, string> {
  const m = new Map<number, string>();
  for (const [, u, day] of d.act) if (u >= 0 && (m.get(u) ?? "") < day) m.set(u, day);
  return m;
}

// ------------------------------------------------------------------- cells

/** A number and the people (or visitors) behind it, for the drill-down. */
export interface Cell {
  v: number;
  users: number[];
  visitors?: string[];
  /** not available in this environment yet */
  na?: boolean;
}

const uniq = (xs: number[]) => [...new Set(xs)];
export const cellOf = (users: number[], v?: number): Cell => {
  const u = uniq(users);
  return { v: v ?? u.length, users: u };
};

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const pct = (n: number, dnm: number): number | null => (dnm > 0 ? Math.round((n / dnm) * 1000) / 10 : null);

// --------------------------------------------------------------------- daily

// ------------------------------------------------------------------ activity

/** The features a person can use, in career-agent's feature_used names. */
export const FEATURES = ["desk", "jobs", "job_open", "apply", "save", "chat", "call", "outreach", "email_send", "resume", "plans", "whatsapp"] as const;
export const FEATURE_LABELS: Record<string, string> = {
  desk: "Desk", jobs: "Saw jobs", job_open: "Opened a job", apply: "Apply click", save: "Saved a job", chat: "Chat",
  call: "Call", outreach: "Outreach", email_send: "Sent email", resume: "Resume", plans: "Plans", whatsapp: "WhatsApp",
};

/** Product-table and journey rows (Act kinds) that show a person used a feature that day. */
const ACT_FEATURE: Record<string, string> = {
  desk: "desk", job_view: "jobs", job_open: "job_open", apply: "apply", save: "save", chat_desk: "chat", chat_wa: "whatsapp",
  chat_call: "call", outreach_row: "outreach", email: "email_send", email_test: "email_send", plan_view: "plans", digest_tapped: "whatsapp",
};

export interface Activity {
  /** person index -> IST day -> features used that day (empty set: active, feature not known) */
  days: Map<number, Map<string, Set<string>>>;
  /** the journey log has active_day / feature_used rows */
  beacons: boolean;
}

const activityCache = new WeakMap<StuData, Activity>();

/**
 * Who was active on which IST day, and with which features. Active means any of:
 * the journey's active_day and feature_used beacons (when the log has them), the
 * desk, job, apply and plan events, and the product's own timestamped rows (chat
 * messages, calls, job views, saves, outreach, emails, WhatsApp digest taps). The
 * beacons add to the tables rather than replace them, so days before the beacons
 * went live still count.
 */
export function activity(d: StuData): Activity {
  const hit = activityCache.get(d);
  if (hit) return hit;
  const days = new Map<number, Map<string, Set<string>>>();
  const add = (u: number, day: string, feature: string) => {
    if (u < 0) return;
    let m = days.get(u);
    if (!m) days.set(u, (m = new Map()));
    let s = m.get(day);
    if (!s) m.set(day, (s = new Set()));
    if (feature) s.add(feature);
  };
  let beacons = false;
  for (const [k, u, day] of d.act) {
    if (k === "active_day") {
      beacons = true;
      add(u, day, "");
    } else if (k.startsWith("f:")) {
      beacons = true;
      add(u, day, k.slice(2));
    } else if (ACT_FEATURE[k]) add(u, day, ACT_FEATURE[k]);
  }
  for (const c of d.calls) if (c[5] != null) add(c[0], istDay(c[5]), "call");
  const out = { days, beacons };
  activityCache.set(d, out);
  return out;
}

export const activitySource = (d: StuData): string =>
  activity(d).beacons
    ? "journey active_day and feature_used, plus the product tables (chats, calls, job views, saves, outreach, emails)"
    : "product tables (chats, calls, job views, saves, outreach, emails) and journey desk, job, apply and plan events; active_day not in the log yet";

/** People in scope active on any of `days`. */
export function activeCell(d: StuData, days: Set<string>, scope: Set<number>, which: "all" | "new" | "returning" = "all"): Cell {
  const users: number[] = [];
  for (const [u, m] of activity(d).days) {
    if (!scope.has(u)) continue;
    const joined = istDay(d.users[u].joined);
    for (const day of m.keys()) {
      if (!days.has(day)) continue;
      if (which === "new" && day !== joined) continue;
      if (which === "returning" && day <= joined) continue;
      users.push(u);
      break;
    }
  }
  return cellOf(users);
}

export interface DailyMetricDef {
  key: string;
  label: string;
  group: string;
  source: (d: StuData) => string;
  kind?: "inr" | "test";
  /** days: the IST days in one column */
  cell: (d: StuData, f: Filters, days: Set<string>, scope: Set<number>) => Cell;
}

function firstStepCell(d: StuData, key: string, days: Set<string>, scope: Set<number>): Cell {
  const users: number[] = [];
  for (const i of scope) {
    const t = stepAt(d, d.users[i], key);
    if (t != null && days.has(istDay(t))) users.push(i);
  }
  const def = STEP_BY_KEY[key];
  const na = !(def?.truth && d.truthOn[key]) && key !== "signed_up" && !d.journeyLive;
  return { ...cellOf(users), na };
}

function actCell(d: StuData, kinds: string[], days: Set<string>, scope: Set<number>, how: "sum" | "users" | "amount", na = false): Cell {
  const users: number[] = [];
  let sum = 0;
  for (const [k, u, day, n, amt] of d.act) {
    if (!kinds.includes(k) || !scope.has(u) || !days.has(day)) continue;
    users.push(u);
    sum += how === "amount" ? amt : n;
  }
  const c = cellOf(users, how === "users" ? undefined : sum);
  return { ...c, na };
}

function visitorCell(d: StuData, f: Filters, key: string, days: Set<string>): Cell {
  if (!d.journeyLive) return { v: 0, users: [], visitors: [], na: true };
  const ids: string[] = [];
  const users: number[] = [];
  for (const v of d.visitors) {
    if (!visitorInScope(v, d, f)) continue;
    if ((v.days[key] ?? []).some((x) => days.has(x))) {
      ids.push(v.id);
      if (v.u >= 0) users.push(v.u);
    }
  }
  return { v: ids.length, users: uniq(users), visitors: ids };
}

type CallPred = (c: WireCall) => boolean;
/** The onboarding path: not a desk chat call or a practice interview. */
export const NON_DESK = (c: WireCall) => c[1] !== "desk" && c[1] !== "interview";
export const callOutcome = (c: WireCall): string => {
  const [, , status, error, , started, , dur, dropped, , completed] = c;
  if (completed) return "completed";
  if (status === "failed") return "failed";
  if (!started) return "never_connected";
  if (dropped) return "dropped";
  if (error === "no_resume") return "no_resume";
  if (error === "no_answers") return "no_answers";
  if (status === "live") return "live";
  if (dur != null && dur < 60) return "hung_up_first_minute";
  return "ended_early";
};

function callCell(d: StuData, days: Set<string>, scope: Set<number>, pred: CallPred, at: (c: WireCall) => number | null): Cell {
  const users: number[] = [];
  let n = 0;
  for (const c of d.calls) {
    if (!scope.has(c[0]) || !pred(c)) continue;
    const t = at(c);
    if (t == null || !days.has(istDay(t))) continue;
    n++;
    users.push(c[0]);
  }
  return cellOf(users, n);
}

function failCell(d: StuData, days: Set<string>, scope: Set<number>, reason?: string): Cell {
  const users: number[] = [];
  let n = 0;
  for (const [u, t, r] of d.fails) {
    if (!scope.has(u) || !days.has(istDay(t)) || (reason && r !== reason)) continue;
    n++;
    users.push(u);
  }
  return { ...cellOf(users, n), na: !d.journeyLive };
}

const both = (a: Cell, b: Cell): Cell => ({ v: a.v + b.v, users: uniq([...a.users, ...b.users]), na: a.na && b.na });

const T = (s: string) => () => s;
const J = (d: StuData) => (d.journeyLive ? "journey log" : "journey log (not live yet)");

export const DAILY_METRICS: DailyMetricDef[] = [
  { key: "visitors", label: "Visitors", group: "Arrive", source: (d) => `${J(d)}: visited_home, distinct visitor ids`, cell: (d, f, days) => visitorCell(d, f, "visited_home", days) },
  { key: "stu_opens", label: "Stu opens", group: "Arrive", source: (d) => `${J(d)}: clicked_join, distinct visitor ids`, cell: (d, f, days) => visitorCell(d, f, "clicked_join", days) },
  { key: "saw_signup", label: "Saw sign-up", group: "Arrive", source: (d) => `${J(d)}: saw_signup, distinct visitor ids`, cell: (d, f, days) => visitorCell(d, f, "saw_signup", days) },
  { key: "signups", label: "Sign-ups", group: "Sign up", source: (d) => stepSource(d, "signed_up"), cell: (d, _f, days, s) => firstStepCell(d, "signed_up", days, s) },
  { key: "phone", label: "Phone verified", group: "Sign up", source: (d) => stepSource(d, "verified_phone"), cell: (d, _f, days, s) => firstStepCell(d, "verified_phone", days, s) },
  { key: "reached", label: "Reached Stu", group: "Sign up", source: (d) => stepSource(d, "reached_stu"), cell: (d, _f, days, s) => firstStepCell(d, "reached_stu", days, s) },
  { key: "calls_started", label: "Calls started", group: "Call", source: T("career_voice_calls.started_at, onboarding, returning and build calls (each call)"), cell: (d, _f, days, s) => callCell(d, days, s, NON_DESK, (c) => c[5]) },
  { key: "calls_completed", label: "Calls completed", group: "Call", source: T("career_voice_calls status ready or finished, by end time (each call)"), cell: (d, _f, days, s) => callCell(d, days, s, (c) => NON_DESK(c) && c[10] === 1, (c) => c[6] ?? c[5]) },
  { key: "calls_failed", label: "Calls failed", group: "Call", source: (d) => `career_voice_calls status failed, plus ${J(d)} call_failed (mic denied, network, error)`, cell: (d, _f, days, s) => both(callCell(d, days, s, (c) => c[2] === "failed", (c) => c[4]), failCell(d, days, s)) },
  { key: "calls_dropped", label: "Calls dropped", group: "Call", source: T("career_voice_calls.timeline dropped (the connection went)"), cell: (d, _f, days, s) => callCell(d, days, s, (c) => NON_DESK(c) && callOutcome(c) === "dropped", (c) => c[5] ?? c[4]) },
  { key: "calls_hung_early", label: "Hung up in first minute", group: "Call", source: T("career_voice_calls: under 60 s, not completed, not dropped"), cell: (d, _f, days, s) => callCell(d, days, s, (c) => NON_DESK(c) && callOutcome(c) === "hung_up_first_minute", (c) => c[5] ?? c[4]) },
  { key: "resumes", label: "Resumes in call", group: "Call", source: T("career_voice_calls: onboarding calls with a resume read (each call)"), cell: (d, _f, days, s) => callCell(d, days, s, (c) => c[1] === "onboarding" && c[9] === 1, (c) => c[5] ?? c[4]) },
  { key: "onboarded", label: "Onboarded", group: "Call", source: (d) => stepSource(d, "onboarded"), cell: (d, _f, days, s) => firstStepCell(d, "onboarded", days, s) },
  { key: "active", label: "Active (any activity)", group: "Use", source: (d) => activitySource(d), cell: (d, _f, days, s) => activeCell(d, days, s) },
  { key: "active_new", label: "  of them new (joined that day)", group: "Use", source: (d) => activitySource(d), cell: (d, _f, days, s) => activeCell(d, days, s, "new") },
  { key: "active_returning", label: "  of them returning", group: "Use", source: (d) => activitySource(d), cell: (d, _f, days, s) => activeCell(d, days, s, "returning") },
  { key: "dau", label: "Daily actives (desk)", group: "Use", source: (d) => `${J(d)}: opened_desk, distinct people a day`, cell: (d, _f, days, s) => actCell(d, ["desk"], days, s, "users", !d.journeyLive) },
  { key: "dau_new", label: "  of them new", group: "Use", source: (d) => `${J(d)}: opened_desk on the day they joined`, cell: (d, _f, days, s) => {
    const all = actCell(d, ["desk"], days, s, "users", !d.journeyLive);
    const users = all.users.filter((i) => d.act.some(([k, u, day]) => k === "desk" && u === i && days.has(day) && day === istDay(d.users[i].joined)));
    return { ...cellOf(users), na: all.na };
  } },
  { key: "dau_returning", label: "  of them returning", group: "Use", source: (d) => `${J(d)}: opened_desk on a later day than they joined`, cell: (d, _f, days, s) => {
    const all = actCell(d, ["desk"], days, s, "users", !d.journeyLive);
    const users = all.users.filter((i) => d.act.some(([k, u, day]) => k === "desk" && u === i && days.has(day) && day > istDay(d.users[i].joined)));
    return { ...cellOf(users), na: all.na };
  } },
  { key: "saw_jobs", label: "Saw jobs (first time)", group: "Use", source: (d) => stepSource(d, "saw_jobs"), cell: (d, _f, days, s) => firstStepCell(d, "saw_jobs", days, s) },
  { key: "job_opens", label: "Job opens", group: "Use", source: (d) => `${J(d)}: opened_job (each)`, cell: (d, _f, days, s) => actCell(d, ["job_open"], days, s, "sum", !d.journeyLive) },
  { key: "saved", label: "Saved a job (first time)", group: "Use", source: (d) => stepSource(d, "saved_job"), cell: (d, _f, days, s) => firstStepCell(d, "saved_job", days, s) },
  { key: "apply_clicks", label: "Apply clicks", group: "Use", source: (d) => `${J(d)}: apply_click (each)`, cell: (d, _f, days, s) => actCell(d, ["apply"], days, s, "sum", !d.journeyLive) },
  { key: "chats", label: "Chat messages to Stu", group: "Use", source: T("career_messages (desk chat), career_channel_messages in (WhatsApp), desk and interview calls"), cell: (d, _f, days, s) => actCell(d, ["chat_desk", "chat_wa", "chat_call"], days, s, "sum") },
  { key: "chatters", label: "People who chatted", group: "Use", source: T("same tables, distinct people a day"), cell: (d, _f, days, s) => actCell(d, ["chat_desk", "chat_wa", "chat_call"], days, s, "users") },
  { key: "wa_linked", label: "WhatsApp linked", group: "Use", source: (d) => stepSource(d, "whatsapp_linked"), cell: (d, _f, days, s) => firstStepCell(d, "whatsapp_linked", days, s) },
  { key: "digest_sent", label: "Digests sent", group: "Use", source: T("career_daily_sends whatsapp picks, sent_at"), cell: (d, _f, days, s) => actCell(d, ["digest_sent"], days, s, "sum") },
  { key: "digest_read", label: "Digests read", group: "Use", source: T("career_daily_sends whatsapp picks, read_at"), cell: (d, _f, days, s) => actCell(d, ["digest_read"], days, s, "sum") },
  { key: "digest_tapped", label: "Digests tapped", group: "Use", source: T("career_daily_sends whatsapp picks, tapped_at"), cell: (d, _f, days, s) => actCell(d, ["digest_tapped"], days, s, "sum") },
  { key: "outreach_people", label: "Outreach started (people)", group: "Outreach", source: (d) => stepSource(d, "outreach_started"), cell: (d, _f, days, s) => firstStepCell(d, "outreach_started", days, s) },
  { key: "outreach_rows", label: "Jobs added to outreach", group: "Outreach", source: T("career_outreach.created_at (each)"), cell: (d, _f, days, s) => actCell(d, ["outreach_row"], days, s, "sum") },
  { key: "mailboxes", label: "Mailboxes connected", group: "Outreach", source: (d) => stepSource(d, "mailbox_connected"), cell: (d, _f, days, s) => firstStepCell(d, "mailbox_connected", days, s) },
  { key: "emails", label: "Emails sent (real)", group: "Outreach", source: T("career_emails status sent, not a dry run or test inbox (each)"), cell: (d, _f, days, s) => actCell(d, ["email"], days, s, "sum") },
  { key: "emails_test", label: "Emails sent (dry run / test)", group: "Outreach", kind: "test", source: T("career_emails sent as a dry run or from a test inbox (each)"), cell: (d, _f, days, s) => actCell(d, ["email_test"], days, s, "sum") },
  { key: "replies", label: "Replies (real)", group: "Outreach", source: T("career_sequences.replied_at, not bounce, not dry run (each)"), cell: (d, _f, days, s) => actCell(d, ["reply"], days, s, "sum") },
  { key: "replies_test", label: "Replies (dry run / test)", group: "Outreach", kind: "test", source: T("career_sequences.replied_at on dry-run sequences"), cell: (d, _f, days, s) => actCell(d, ["reply_test"], days, s, "sum") },
  { key: "plan_views", label: "Plan views", group: "Pay", source: (d) => `${J(d)}: saw_plans (each)`, cell: (d, _f, days, s) => actCell(d, ["plan_view"], days, s, "sum", !d.journeyLive) },
  { key: "paid_users", label: "Paid users (real)", group: "Pay", source: T("career_credit_orders paid and not test; career_plans jobs and not test"), cell: (d, _f, days, s) => actCell(d, ["pay"], days, s, "users") },
  { key: "revenue", label: "Revenue (real, INR)", group: "Pay", kind: "inr", source: T("career_credit_orders amount_paise less refunds, paid and not test"), cell: (d, _f, days, s) => actCell(d, ["pay"], days, s, "amount") },
  { key: "test_payments", label: "Test payments", group: "Pay", kind: "test", source: T("career_credit_orders test, career_plans source test (latest change), career_outreach_credits test_purchase"), cell: (d, _f, days, s) => actCell(d, ["pay_test"], days, s, "sum") },
];

export interface DailyColumn {
  label: string;
  days: string[];
}

export function dailyColumns(f: Filters, group: number): DailyColumn[] {
  const days = dayRange(f.start, f.end);
  const cols: DailyColumn[] = [];
  for (let i = 0; i < days.length; i += group) {
    const chunk = days.slice(i, i + group);
    cols.push({ label: chunk.length === 1 ? chunk[0].slice(5) : `${chunk[0].slice(5)} to ${chunk[chunk.length - 1].slice(5)}`, days: chunk });
  }
  return cols;
}

export function dailyTable(d: StuData, f: Filters, group: number) {
  const scope = new Set(scopeUsers(d, f));
  const cols = dailyColumns(f, group);
  const rows = DAILY_METRICS.map((m) => ({
    def: m,
    cells: cols.map((c) => m.cell(d, f, new Set(c.days), scope)),
    total: m.cell(d, f, new Set(dayRange(f.start, f.end)), scope),
  }));
  return { cols, rows };
}

// -------------------------------------------------------------------- funnel

export interface FunnelRow {
  key: string;
  n: string;
  label: string;
  gate: boolean;
  cell: Cell;
  pctPrev: number | null;
  pctSignups: number | null;
  /** median ms from each person's latest earlier step */
  medianFromPrev: number | null;
  source: string;
  test?: boolean;
}

export function funnel(d: StuData, f: Filters, nested: boolean): { rows: FunnelRow[]; cohort: number[] } {
  const cohort = cohortOf(d, f);
  const steps = USER_STEPS;
  const rows: FunnelRow[] = [];
  let passed = cohort; // people who did every gate step so far
  let prevKey: string | null = null;
  let prevCount = cohort.length;
  for (const s of steps) {
    const pool = nested ? passed : cohort;
    const did = pool.filter((i) => stepAt(d, d.users[i], s.key) != null);
    // Time from the step before: for each person, the latest earlier step they
    // did (the row above, or the one before it when they skipped a branch step).
    const gaps: number[] = [];
    const pos = steps.findIndex((x) => x.key === s.key);
    if (pos > 0) {
      for (const i of did) {
        const b = stepAt(d, d.users[i], s.key)!;
        let a: number | null = null;
        for (let k = pos - 1; k >= 0 && a == null; k--) {
          const t = stepAt(d, d.users[i], steps[k].key);
          if (t != null && t <= b) a = t;
        }
        if (a != null) gaps.push(b - a);
      }
    }
    const isGate = "gate" in s && !!s.gate;
    const na = !(s.truth && d.truthOn[s.key]) && s.key !== "signed_up" && !d.journeyLive;
    rows.push({
      key: s.key, n: s.n, label: s.label, gate: isGate,
      cell: { ...cellOf(did), na },
      pctPrev: prevKey ? pct(did.length, prevCount) : null,
      pctSignups: pct(did.length, cohort.length),
      medianFromPrev: median(gaps),
      source: stepSource(d, s.key),
    });
    if (s.key === "paid") {
      const tp = pool.filter((i) => d.users[i].testPaid != null);
      rows.push({
        key: "paid_test", n: "23", label: "Paid (test payments)", gate: false, test: true,
        cell: cellOf(tp), pctPrev: null, pctSignups: pct(tp.length, cohort.length), medianFromPrev: null,
        source: "career_credit_orders test, career_plans source test, career_outreach_credits test_purchase",
      });
    }
    if (isGate && nested) passed = did;
    prevKey = s.key;
    prevCount = did.length;
  }
  return { rows, cohort };
}

/** Pre-sign-up steps for the range: visitors are not a cohort, they are counted by visitor id. */
export function arriveCells(d: StuData, f: Filters): Record<string, Cell> {
  const days = new Set(dayRange(f.start, f.end));
  return Object.fromEntries(ANON_STEPS.map((s) => [s.key, visitorCell(d, f, s.key, days)]));
}

// -------------------------------------------------------------------- ratios

export interface Ratio {
  key: string;
  label: string;
  num: Cell;
  den: Cell;
  value: number | null;
  source: string;
  /** a plain average, not a percentage */
  avg?: boolean;
}

export function ratios(d: StuData, f: Filters): Ratio[] {
  const cohort = cohortOf(d, f);
  const has = (key: string) => (i: number) => stepAt(d, d.users[i], key) != null;
  const sub = (pool: number[], key: string) => pool.filter(has(key));
  const signedUp = cohort;
  const called = sub(signedUp, "call_started");
  const completed = sub(called, "call_completed");
  const onboarded = sub(cohort, "onboarded");
  const sawJobs = sub(onboarded, "saw_jobs");
  const saved = sub(sawJobs, "saved_job");
  const outreach = sub(onboarded, "outreach_started");
  const paid = sub(cohort, "paid");
  const arrive = arriveCells(d, f);
  const visitors = arrive.visited_home;
  const R = (key: string, label: string, num: number[] | Cell, den: number[] | Cell, source: string): Ratio => {
    const n = Array.isArray(num) ? cellOf(num) : num;
    const dn = Array.isArray(den) ? cellOf(den) : den;
    return { key, label, num: n, den: dn, value: dn.na ? null : pct(n.v, dn.v), source };
  };
  const cohortSet = new Set(cohort);
  // Calls: the cohort's own calls, any time.
  const cohortCalls = d.calls.filter((c) => cohortSet.has(c[0]));
  const nonDesk = cohortCalls.filter(NON_DESK);
  const failedCalls = nonDesk.filter((c) => c[2] === "failed");
  const failsJ = d.fails.filter(([u]) => cohortSet.has(u));
  const tried = uniq([...nonDesk.map((c) => c[0]), ...failsJ.map(([u]) => u)]);
  const micDenied = uniq(failsJ.filter(([, , r]) => /mic/i.test(r)).map(([u]) => u));
  const anyFail = uniq([...failedCalls.map((c) => c[0]), ...failsJ.map(([u]) => u)]);
  const startedCalls = cohortCalls.filter((c) => c[5] != null);
  const chatActs = d.act.filter(([k, u]) => cohortSet.has(u) && (k === "chat_desk" || k === "chat_wa" || k === "chat_call"));
  const chatters = uniq(chatActs.map(([, u]) => u));
  const chatMsgs = chatActs.reduce((a, r) => a + r[3], 0);
  return [
    R("visit_signup", "Visit to sign-up", cellOf(cohort), visitors, "sign-ups in range over visitor ids in range (journey log)"),
    R("signup_call", "Sign-up to call", called, signedUp, stepSource(d, "call_started")),
    R("call_completed", "Call to completed", completed, called, stepSource(d, "call_completed")),
    R("completed_onboarded", "Completed to onboarded", sub(completed, "onboarded"), completed, stepSource(d, "onboarded")),
    R("onboarded_jobs", "Onboarded to saw jobs", sawJobs, onboarded, stepSource(d, "saw_jobs")),
    R("jobs_saved", "Saw jobs to saved", saved, sawJobs, stepSource(d, "saved_job")),
    R("onboarded_outreach", "Onboarded to outreach", outreach, onboarded, stepSource(d, "outreach_started")),
    R("signup_paid", "Sign-up to paid (real)", paid, signedUp, stepSource(d, "paid")),
    R("visit_paid", "Visit to paid (real)", cellOf(paid), visitors, "paid people in the cohort over visitor ids in range"),
    { ...R("mic_denied", "Mic denied rate (people)", micDenied, tried, "journey log call_failed reason mic over people who tried a call"), value: d.journeyLive ? pct(micDenied.length, tried.length) : null },
    R("call_fail", "Call failure rate (people)", anyFail, tried, "career_voice_calls failed plus journey call_failed, over people who tried a call"),
    R("call_fail_calls", "Call failure rate (calls)", cellOf(failedCalls.map((c) => c[0]), failedCalls.length), cellOf(nonDesk.map((c) => c[0]), nonDesk.length), "career_voice_calls status failed over calls made (not desk or interview)"),
    { key: "avg_calls", label: "Average calls per person who called", num: cellOf(startedCalls.map((c) => c[0]), startedCalls.length), den: cellOf(startedCalls.map((c) => c[0])), value: avg(startedCalls.length, uniq(startedCalls.map((c) => c[0])).length), source: "career_voice_calls started, every mode", avg: true },
    { key: "avg_calls_signup", label: "Average calls per sign-up", num: cellOf(startedCalls.map((c) => c[0]), startedCalls.length), den: cellOf(cohort), value: avg(startedCalls.length, cohort.length), source: "career_voice_calls started, every mode", avg: true },
    { key: "avg_chats", label: "Average chat messages per person who chatted", num: cellOf(chatters, chatMsgs), den: cellOf(chatters), value: avg(chatMsgs, chatters.length), source: "career_messages, career_channel_messages, desk and interview calls", avg: true },
    { key: "avg_chats_signup", label: "Average chat messages per sign-up", num: cellOf(chatters, chatMsgs), den: cellOf(cohort), value: avg(chatMsgs, cohort.length), source: "same", avg: true },
  ];
}

const avg = (n: number, dnm: number): number | null => (dnm > 0 ? Math.round((n / dnm) * 100) / 100 : null);

// ----------------------------------------------------------------- drop-offs

export interface DropRow {
  key: string;
  label: string;
  cell: Cell;
  of: Cell;
  source: string;
}

export function dropoffs(d: StuData, f: Filters): { stuck: { key: string; n: string; label: string; cell: Cell }[]; reasons: DropRow[]; callOutcomes: { key: string; cell: Cell }[] } {
  const cohort = cohortOf(d, f);
  const set = new Set(cohort);
  const has = (key: string) => (i: number) => stepAt(d, d.users[i], key) != null;
  const stuckMap = new Map<number, number[]>();
  for (const i of cohort) {
    const k = furthestStep(d, d.users[i]);
    stuckMap.set(k, [...(stuckMap.get(k) ?? []), i]);
  }
  const stuck = USER_STEPS.map((s, idx) => ({ key: s.key, n: s.n, label: s.label, cell: cellOf(stuckMap.get(idx) ?? []) }));
  const calls = d.calls.filter((c) => set.has(c[0]) && NON_DESK(c));
  const byOutcome = new Map<string, WireCall[]>();
  for (const c of calls) {
    const o = callOutcome(c);
    byOutcome.set(o, [...(byOutcome.get(o) ?? []), c]);
  }
  const callOutcomes = [...byOutcome.entries()].sort((a, b) => b[1].length - a[1].length)
    .map(([key, cs]) => ({ key, cell: cellOf(cs.map((c) => c[0]), cs.length) }));
  const fails = d.fails.filter(([u]) => set.has(u));
  const failReasons = new Map<string, number[]>();
  for (const [u, , r] of fails) failReasons.set(r || "unknown", [...(failReasons.get(r || "unknown") ?? []), u]);
  for (const c of calls.filter((c) => c[2] === "failed")) {
    const r = `server: ${(c[3] || "error").slice(0, 40)}`;
    failReasons.set(r, [...(failReasons.get(r) ?? []), c[0]]);
  }
  const tried = cellOf([...calls.map((c) => c[0]), ...fails.map(([u]) => u)]);
  const peopleWith = (o: string) => cellOf((byOutcome.get(o) ?? []).map((c) => c[0]));
  const onboarded = cohort.filter(has("onboarded"));
  const sawJobs = cohort.filter(has("saw_jobs"));
  const reasons: DropRow[] = [
    { key: "no_call", label: "Signed up, never started a call", cell: cellOf(cohort.filter((i) => !has("call_started")(i))), of: cellOf(cohort), source: stepSource(d, "call_started") },
    { key: "mic_denied", label: "Mic denied", cell: { ...cellOf(fails.filter(([, , r]) => /mic/i.test(r)).map(([u]) => u)), na: !d.journeyLive }, of: tried, source: "journey log call_failed, reason mic" },
    ...[...failReasons.entries()].filter(([r]) => !/mic/i.test(r)).map(([r, us]) => ({ key: `fail_${r}`, label: `Call failed: ${r}`, cell: cellOf(us), of: tried, source: r.startsWith("server:") ? "career_voice_calls status failed, error" : "journey log call_failed, reason" })),
    { key: "dropped", label: "Call dropped (connection went)", cell: peopleWith("dropped"), of: tried, source: "career_voice_calls.timeline dropped" },
    { key: "hung_early", label: "Hung up in the first minute", cell: peopleWith("hung_up_first_minute"), of: tried, source: "career_voice_calls under 60 s, not completed" },
    { key: "no_resume", label: "Call ended with no resume", cell: peopleWith("no_resume"), of: tried, source: "career_voice_calls error no_resume" },
    { key: "no_answers", label: "Call ended before the answers", cell: peopleWith("no_answers"), of: tried, source: "career_voice_calls error no_answers" },
    { key: "completed_not_onboarded", label: "Completed a call, never onboarded", cell: cellOf(cohort.filter((i) => has("call_completed")(i) && !has("onboarded")(i))), of: cellOf(cohort.filter(has("call_completed"))), source: stepSource(d, "onboarded") },
    { key: "no_desk", label: "Onboarded, never opened the desk", cell: { ...cellOf(onboarded.filter((i) => !has("opened_desk")(i))), na: !d.journeyLive }, of: cellOf(onboarded), source: stepSource(d, "opened_desk") },
    { key: "no_jobs", label: "Onboarded, never saw jobs", cell: cellOf(onboarded.filter((i) => !has("saw_jobs")(i))), of: cellOf(onboarded), source: stepSource(d, "saw_jobs") },
    { key: "jobs_no_save", label: "Saw jobs, saved none", cell: cellOf(sawJobs.filter((i) => !has("saved_job")(i))), of: cellOf(sawJobs), source: stepSource(d, "saved_job") },
  ];
  return { stuck, reasons, callOutcomes };
}

// ------------------------------------------------------------------- sources

export const SOURCE_STEPS = ["signed_up", "call_started", "call_completed", "onboarded", "saw_jobs", "saved_job", "outreach_started", "first_email_sent", "paid"] as const;

export function splitKey(u: WireUser, by: string): string {
  if (by === "device") return u.touch?.device || "unknown";
  if (by === "city") return u.touch?.city || "unknown";
  if (by === "campaign") return u.touch?.campaign || "(none)";
  if (by === "source") return [u.touch?.source || "(none)", u.touch?.medium || ""].filter(Boolean).join(" / ");
  return u.ch;
}

export function sources(d: StuData, f: Filters, by: string) {
  const cohort = cohortOf(d, f);
  const groups = new Map<string, number[]>();
  for (const i of cohort) {
    const k = splitKey(d.users[i], by);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const set = new Set(cohort);
  const rev = new Map<number, number>();
  for (const [k, u, , , amt] of d.act) if (k === "pay" && set.has(u)) rev.set(u, (rev.get(u) ?? 0) + amt);
  const rows = [...groups.entries()].map(([key, us]) => {
    const steps = Object.fromEntries(SOURCE_STEPS.map((s) => [s, cellOf(us.filter((i) => stepAt(d, d.users[i], s) != null))]));
    const testPaid = cellOf(us.filter((i) => d.users[i].testPaid != null));
    const revenue = us.reduce((a, i) => a + (rev.get(i) ?? 0), 0);
    return { key, users: us, steps, testPaid, revenue: cellOf(us.filter((i) => rev.has(i)), revenue) };
  }).sort((a, b) => b.users.length - a.users.length);
  // Visitors per channel (by the visitor's first touch).
  const vis = new Map<string, string[]>();
  if (by === "channel" && d.journeyLive) {
    const days = new Set(dayRange(f.start, f.end));
    for (const v of d.visitors) {
      if (!visitorInScope(v, d, f)) continue;
      if (!(v.days.visited_home ?? []).some((x) => days.has(x))) continue;
      const ch = v.u >= 0 ? d.users[v.u]?.ch ?? v.ch : v.ch;
      vis.set(ch, [...(vis.get(ch) ?? []), v.id]);
    }
  }
  return { rows, visitors: vis, cohort };
}

// ----------------------------------------------------------------- retention

export interface RetentionRow {
  week: string;
  size: Cell;
  d: Record<string, { back: Cell; eligible: Cell; value: number | null }>;
}

export const RETENTION_DAYS = [1, 7, 30] as const;

/**
 * Returned to the desk (journey opened_desk) on day N after the IST day they joined; `orLater` counts day N or any later day.
 * Rows are weeks of joining (Monday), or IST days of joining with `by` "day" (the Overview's cohort heatmap).
 */
export function retention(d: StuData, f: Filters, orLater: boolean, by: "week" | "day" = "week", ns: readonly number[] = RETENTION_DAYS): RetentionRow[] {
  const cohort = cohortOf(d, f);
  const deskDays = new Map<number, Set<string>>();
  for (const [k, u, day] of d.act) if (k === "desk") (deskDays.get(u) ?? deskDays.set(u, new Set()).get(u)!).add(day);
  const today = todayIst();
  const weeks = new Map<string, number[]>();
  for (const i of cohort) {
    const w = by === "day" ? istDay(d.users[i].joined) : weekOf(istDay(d.users[i].joined));
    weeks.set(w, [...(weeks.get(w) ?? []), i]);
  }
  return [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([week, us]) => {
    const row: RetentionRow = { week, size: cellOf(us), d: {} };
    for (const n of ns) {
      const eligible = us.filter((i) => addDays(istDay(d.users[i].joined), n) <= today);
      const back = eligible.filter((i) => {
        const j = istDay(d.users[i].joined);
        const target = addDays(j, n);
        const ds = deskDays.get(i);
        if (!ds) return false;
        if (!orLater) return ds.has(target);
        for (const x of ds) if (x >= target) return true;
        return false;
      });
      row.d[`d${n}`] = { back: { ...cellOf(back), na: !d.journeyLive }, eligible: cellOf(eligible), value: d.journeyLive ? pct(back.length, eligible.length) : null };
    }
    return row;
  });
}

// ---------------------------------------------------------------- self-check

export interface CheckRow {
  key: string;
  label: string;
  truth: Cell;
  journey: Cell;
  onlyTruth: Cell;
  onlyJourney: Cell;
  /** |truth - journey| / max(truth, journey), percent */
  gap: number | null;
  flagged: boolean;
}

export const CHECK_THRESHOLD_PCT = 2;

/**
 * The journey log against the product's own tables, per step, for people in
 * scope. A gap over 2% is flagged.
 *
 * Window (2 Nov 2026): "live" (the default) compares from the log's first live
 * event, so it checks the logging the product does now; "all" compares from the
 * log's first event, the backfill included (25 Oct on staging). The backfill
 * rebuilt history from the tables with its own rules (older accounts got no
 * signed_up, for one), so it is not a test of the live logging.
 */
export type CheckWindow = "live" | "all";

export function checkFrom(d: StuData, window: CheckWindow): number | null {
  if (window === "all" || d.journeyLiveStart === undefined) return d.journeyStart;
  return d.journeyLiveStart;
}

export function selfCheck(d: StuData, f: Filters, window: CheckWindow = "live"): { rows: CheckRow[]; from: number | null; flagged: number; window: CheckWindow } {
  const from = checkFrom(d, window);
  if (!d.journeyLive || from == null) return { rows: [], from, flagged: 0, window };
  const scope = scopeUsers(d, f);
  const rows: CheckRow[] = [];
  for (const s of USER_STEPS) {
    if (!s.truth || !d.truthOn[s.key] || s.key === "signed_up") continue;
    // Table side: people whose first time in the table falls in the window.
    const truth = scope.filter((i) => (d.users[i].t[s.key] ?? -1) >= from);
    const tSet = new Set(truth);
    // Log side: people the log has in the window, or with a log row for a table row in it.
    const journey = scope.filter((i) => d.users[i].j[s.key] != null && (d.users[i].j[s.key]! >= from || tSet.has(i)));
    const jSet = new Set(journey);
    const onlyT = truth.filter((i) => !jSet.has(i));
    // A log entry for someone whose table row is older than the window is a
    // repeat, not a gap; a log entry with no table row at all is a gap.
    const onlyJ = journey.filter((i) => !tSet.has(i) && d.users[i].t[s.key] == null);
    const big = Math.max(truth.length, journey.length);
    const diff = onlyT.length + onlyJ.length;
    const gap = big > 0 ? Math.round((diff / big) * 1000) / 10 : 0;
    rows.push({
      key: s.key, label: `${s.n}. ${s.label}`,
      truth: cellOf(truth), journey: cellOf(journey), onlyTruth: cellOf(onlyT), onlyJourney: cellOf(onlyJ),
      gap, flagged: gap > CHECK_THRESHOLD_PCT,
    });
  }
  // Signed up: the log against the accounts table. The log's signed_up carries
  // the account's created_at, so an older account's row can predate the window.
  const su = scope.filter((i) => d.users[i].joined >= from);
  const suSet = new Set(su);
  const suJ = scope.filter((i) => d.users[i].j.signed_up != null && (d.users[i].j.signed_up! >= from || suSet.has(i)));
  const suSetJ = new Set(suJ);
  const onlyT = su.filter((i) => !suSetJ.has(i));
  const onlyJ = suJ.filter((i) => !suSet.has(i) && d.users[i].joined >= from);
  const big = Math.max(su.length, suJ.length);
  const gap = big > 0 ? Math.round(((onlyT.length + onlyJ.length) / big) * 1000) / 10 : 0;
  rows.unshift({ key: "signed_up", label: "4. Signed up", truth: cellOf(su), journey: cellOf(suJ), onlyTruth: cellOf(onlyT), onlyJourney: cellOf(onlyJ), gap, flagged: gap > CHECK_THRESHOLD_PCT });
  return { rows, from, flagged: rows.filter((r) => r.flagged).length, window };
}

// ------------------------------------------------------------------ formatting

export const fmtN = (n: number): string => Math.round(n).toLocaleString("en-IN");
export const fmtInr = (paise: number): string => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
export const fmtPct = (p: number | null): string => (p == null ? "n/a" : `${p}%`);
export function fmtDur(ms: number | null): string {
  if (ms == null) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round((m / 60) * 10) / 10;
  if (h < 48) return `${h}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}
export const fmtIst = (ms: number | null | undefined): string => {
  if (ms == null) return "";
  const d = new Date(ms + IST_OFFSET_MS).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)} IST`;
};
