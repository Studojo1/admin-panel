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
//
// STEP-ORDER (the owner, 4 Nov 2026: "this whole thing has to be a proper hierarchy ... how is your step number 5
// happening before your step number 4?"): the list is the order people really go through the product, numbered 1 to 24
// with no letters, so a person's times read top to bottom and "furthest step" means how far they got. From
// career-agent main and every prod person's journey since 2 Nov:
// - Sign up: Google sign-in, then /start loads (reached_stu), then its phone step before the call. One tap sends
//   "LINK <code>" on WhatsApp: the number is verified and, with "Send my matches and updates on WhatsApp" ticked (the
//   default), WhatsApp is linked by the same message (12 of 12 links so far). Verified without a link: the box
//   unticked, or WhatsApp not open to them (2 of 11).
// - Call: the call opens on the resume a few seconds before Stu's first question (7 of 8).
// - Onboarded (career_profiles.onboarded_at) lands before the desk opens; the desk only opens for someone set up.
// - Use: jobs, a job opened, then the plans (shown by the desk a few seconds later), then chat with Stu. Nobody can
//   chat before the call: a WhatsApp message before it only gets the link back to the call (CALL-FIRST).
// These numbers are the dashboard's; career-agent's docs/tracking-steps.md keeps its own. The journey names link them.

export const STEPS = [
  { key: "visited_home", n: "1", label: "Visited", phase: "Arrive", anon: true, journey: ["visited_home"], truth: null },
  { key: "clicked_join", n: "2", label: "Opened Stu", phase: "Arrive", anon: true, journey: ["clicked_join"], truth: null },
  { key: "saw_signup", n: "3", label: "Saw sign-up", phase: "Arrive", anon: true, partial: true, journey: ["signup_started", "saw_signup"], truth: null },
  { key: "signed_up", n: "4", label: "Signed up (Google)", phase: "Sign up", gate: true, journey: ["signed_up"], truth: 'public."user".created_at (first Stu activity for an older account)' },
  { key: "reached_stu", n: "5", label: "Reached Stu", phase: "Sign up", journey: ["reached_stu"], truth: null },
  { key: "verified_phone", n: "6", label: "Verified phone", phase: "Sign up", journey: ["phone_verified", "verified_phone"], truth: "career_phones.verified_at" },
  { key: "whatsapp_linked", n: "7", label: "WhatsApp linked", phase: "Sign up", journey: ["whatsapp_linked"], truth: "career_channel_links (whatsapp, imessage)" },
  { key: "call_started", n: "8", label: "Call started", phase: "Call", gate: true, journey: ["call_started"], truth: "career_voice_calls.started_at (onboarding, returning, build calls)" },
  { key: "resume_in_call", n: "9", label: "Resume in call", phase: "Call", journey: ["resume_in_call"], truth: "career_voice_calls.resume (onboarding calls), timeline phase reading" },
  { key: "first_question", n: "10", label: "First question asked", phase: "Call", journey: ["first_question"], truth: "career_voice_calls.timeline mic_open" },
  { key: "call_completed", n: "11", label: "Call completed", phase: "Call", gate: true, journey: ["call_completed"], truth: "career_voice_calls status ready or finished" },
  { key: "onboarded", n: "12", label: "Onboarded", phase: "Call", gate: true, journey: ["onboarded"], truth: "career_profiles.onboarded_at" },
  { key: "opened_desk", n: "13", label: "Opened desk", phase: "Use", journey: ["desk_opened", "opened_desk"], truth: null },
  { key: "saw_jobs", n: "14", label: "Saw jobs", phase: "Use", gate: true, journey: ["saw_jobs"], truth: "career_job_views.viewed_at (first view)" },
  { key: "opened_job", n: "15", label: "Opened a job", phase: "Use", journey: ["job_opened", "opened_job"], truth: null },
  { key: "saw_plans", n: "16", label: "Saw plans", phase: "Use", journey: ["saw_plans"], truth: null },
  { key: "chatted", n: "17", label: "Chatted with Stu", phase: "Use", journey: ["chatted"], truth: "career_messages, career_channel_messages, desk and interview calls (after onboarding)" },
  { key: "saved_job", n: "18", label: "Saved a job", phase: "Use", journey: ["job_saved", "saved_job"], truth: "career_matches state saved or applied" },
  { key: "apply_click", n: "19", label: "Apply click", phase: "Use", journey: ["apply_clicked", "apply_click"], truth: null },
  { key: "outreach_started", n: "20", label: "Outreach started", phase: "Outreach", journey: ["outreach_started"], truth: "career_outreach find run (find_at), career_campaigns not draft" },
  { key: "mailbox_connected", n: "21", label: "Mailbox connected", phase: "Outreach", journey: ["mailbox_connected"], truth: "career_mail_accounts.verified_at (not test inboxes)" },
  { key: "first_email_sent", n: "22", label: "First email sent", phase: "Outreach", journey: ["first_email_sent", "email_sent"], truth: "career_emails sent, not dry run" },
  { key: "first_reply", n: "23", label: "First reply", phase: "Outreach", journey: ["first_reply"], truth: "career_sequences.replied_at (not bounce, not dry run)" },
  { key: "paid", n: "24", label: "Paid (real)", phase: "Pay", journey: ["paid"], truth: "money in: career_credit_orders paid less refunds above zero (not test), autopay charges (career_plan_grants autopay, not refunded, subscription not test), career_plans not test or grant" },
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
  /**
   * ADMIN-AUDIT-STU (14 Nov 2026): recorded for only some of the people who did it (saw_signup: about 1 sign-up in 10,
   * the Google sign-in path writes none). Shown as "partly tracked", never a base for a % and never a drop.
   */
  partial?: boolean;
}

/** ADMIN-AUDIT-STU: the words shown next to a partly tracked step. */
export const PARTLY_TRACKED = "partly tracked";

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
  /** SITE-TRACK (3 Nov 2026): the device their journey rows carry (mobile, tablet, desktop), else their visitor's */
  device?: string | null;
  /** the in-app browser they came through (instagram, facebook, linkedin, whatsapp, other, none) */
  inapp?: string | null;
}

export interface WireVisitor {
  id: string;
  /** index into users, or -1 */
  u: number;
  ch: string;
  device: string | null;
  inapp?: string | null;
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
  /** RESET: the time the pages count from (sinceReset), epoch ms */
  countFrom?: number;
  /**
   * REAL-VISITORS (4 Nov 2026): the first page_view, epoch ms. From here a visitor counts only with a page_view (the
   * site's script ran in a browser); before it, the old count (visited_home, a server row, crawlers included). Null:
   * no page_view in this log, so every visitor number is the old count.
   */
  pageViewStart?: number | null;
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

/** ADMIN-FIX (5 Nov 2026): the reason given to an account that shares a browser (a visitor id) with an internal one. */
export const SHARED_BROWSER = "shares a browser with a team account";

/**
 * ADMIN-FIX (5 Nov 2026): an account that shares a visitor id (one browser) with an internal account is internal too,
 * and so on along the chain. groups: the account indexes seen on each visitor id. Marks `internal` in place and
 * returns how many it marked. Pure.
 */
export function markSharedBrowsers(users: { internal: string | null }[], groups: Iterable<Iterable<number>>): number {
  const sets = [...groups].map((g) => [...new Set(g)].filter((i) => i >= 0 && i < users.length)).filter((g) => g.length > 1);
  let marked = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of sets) {
      if (!g.some((i) => users[i].internal)) continue;
      for (const i of g) {
        if (users[i].internal) continue;
        users[i].internal = SHARED_BROWSER;
        marked++;
        changed = true;
      }
    }
  }
  return marked;
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
  if (key === "visited_home") return visitSource(d);
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
  /** REAL-VISITORS: this log has no page_view at all, so the visitor count is visited_home, crawlers included (the old count) */
  old?: boolean;
  /** ADMIN-FIX (5 Nov 2026): the range starts before visitors were tracked; the count is page_view from this time, epoch ms */
  trackedFrom?: number;
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

/**
 * ACTIVES (14 Nov 2026, the owner: "i want better dau, mau and wau reporting"): the channels an active day was used
 * on, as bits. Web: the site (desk, jobs, chat on the desk, plans). Messaging: WhatsApp or iMessage. Call: a voice call.
 */
export const CH_WEB = 1;
export const CH_MSG = 2;
export const CH_CALL = 4;

/**
 * ACTIVES: what each Act kind says about a person's day. f: the feature; ch: the channel bits it shows; seen: it only
 * adds to a day already active and never makes one (career-agent writes these from an open desk by itself: job cards
 * a feed poll mounts are recorded by api/fit, which career-agent leaves out of active_day too).
 * Kinds not listed are not activity: rows our system makes, not the student (career_outreach rows the auto-add makes,
 * career_emails the sequences send, career_matches states an outreach add sets, digests sent or read, payments).
 */
const ACT_SIGNAL: Record<string, { f: string; ch: number; seen?: true }> = {
  desk: { f: "desk", ch: CH_WEB },
  job_open: { f: "job_open", ch: CH_WEB },
  apply: { f: "apply", ch: CH_WEB },
  plan_view: { f: "plans", ch: CH_WEB },
  job_saved: { f: "save", ch: CH_WEB },
  job_view: { f: "jobs", ch: CH_WEB, seen: true },
  chat_wa: { f: "whatsapp", ch: CH_MSG },
  digest_tapped: { f: "whatsapp", ch: CH_MSG },
  // The WhatsApp LINK code is sent from the web sign-up: activity that day, but it says nothing about the channel.
  wa_link: { f: "whatsapp", ch: 0 },
  chat_call: { f: "call", ch: CH_CALL },
};

/** ACTIVES: active_day's props.via to channel bits. */
const VIA_CH: Record<string, number> = { web: CH_WEB, whatsapp: CH_MSG, imessage: CH_MSG, voice: CH_CALL };

/**
 * ACTIVES: a feature_used beacon to its signal, or null when it is not the student's doing. "outreach" is left out:
 * career-agent's auto-add and campaign lanes write it with no one there. "chat" is the desk or WhatsApp (career-agent
 * does not say which), so it adds no channel. "jobs" is also written by an open desk's poll (api/fit), so it is seen.
 */
function featureSignal(feature: string): { f: string; ch: number; seen?: true } | null {
  if (feature === "outreach") return null;
  if (feature === "chat" || feature === "other" || !feature) return { f: feature || "other", ch: 0 };
  if (feature === "whatsapp") return { f: feature, ch: CH_MSG };
  if (feature === "call") return { f: feature, ch: CH_CALL };
  if (feature === "jobs") return { f: feature, ch: CH_WEB, seen: true };
  return { f: feature, ch: CH_WEB };
}

export interface Activity {
  /** person index -> IST day -> features used that day (empty set: active, feature not known) */
  days: Map<number, Map<string, Set<string>>>;
  /** ACTIVES: person index -> IST day -> channel bits (CH_WEB, CH_MSG, CH_CALL); 0: active, channel not known */
  ch: Map<number, Map<string, number>>;
  /** the journey log has active_day / feature_used rows */
  beacons: boolean;
}

const activityCache = new WeakMap<StuData, Activity>();

/**
 * Who was active on which IST day, with which features and on which channels. ACTIVES (14 Nov 2026): active means the
 * student did something themselves that day:
 * - web: active_day with via web (career-agent: the first signed-in request of the day that is not a background poll),
 *   feature_used (desk, job opened, apply, save, resume, plans, email send), the journey's desk, job opened, job saved,
 *   apply and plans events, and chat messages on the desk;
 * - messaging: active_day with via whatsapp or imessage, their own WhatsApp or iMessage messages, taps on a WhatsApp
 *   digest;
 * - call: a voice call that started (any mode), active_day with via voice.
 * active_day's via is the first request of the day only, so a day's channels come from every signal above.
 * The desk chat table holds WhatsApp turns too (one thread for both), so desk chat rows add web only when there are
 * more of them that day than WhatsApp and iMessage messages in.
 */
export function activity(d: StuData): Activity {
  const hit = activityCache.get(d);
  if (hit) return hit;
  interface Slot { f: Set<string>; ch: number; real: boolean; desk: number; msg: number }
  const slots = new Map<number, Map<string, Slot>>();
  const slot = (u: number, day: string): Slot | null => {
    if (u < 0) return null;
    let m = slots.get(u);
    if (!m) slots.set(u, (m = new Map()));
    let s = m.get(day);
    if (!s) m.set(day, (s = { f: new Set(), ch: 0, real: false, desk: 0, msg: 0 }));
    return s;
  };
  const add = (u: number, day: string, sig: { f: string; ch: number; seen?: true }) => {
    const s = slot(u, day);
    if (!s) return;
    if (sig.f) s.f.add(sig.f);
    s.ch |= sig.ch;
    if (!sig.seen) s.real = true;
  };
  let beacons = false;
  for (const [k, u, day, n] of d.act) {
    if (k === "active_day" || k.startsWith("active_day:")) {
      beacons = true;
      add(u, day, { f: "", ch: VIA_CH[k.slice(11)] ?? 0 });
    } else if (k.startsWith("f:")) {
      beacons = true;
      const sig = featureSignal(k.slice(2));
      if (sig) add(u, day, sig);
    } else if (k === "chat_desk") {
      add(u, day, { f: "chat", ch: 0 });
      slot(u, day)!.desk += n || 1;
    } else if (ACT_SIGNAL[k]) {
      add(u, day, ACT_SIGNAL[k]);
      if (k === "chat_wa" || k === "wa_link" || k === "digest_tapped") slot(u, day)!.msg += n || 1;
    }
  }
  for (const c of d.calls) if (c[5] != null) add(c[0], istDay(c[5]), { f: "call", ch: CH_CALL });
  const days = new Map<number, Map<string, Set<string>>>();
  const ch = new Map<number, Map<string, number>>();
  for (const [u, m] of slots) {
    for (const [day, s] of m) {
      if (!s.real) continue;
      if (s.desk > s.msg) s.ch |= CH_WEB;
      if (!days.has(u)) {
        days.set(u, new Map());
        ch.set(u, new Map());
      }
      days.get(u)!.set(day, s.f);
      ch.get(u)!.set(day, s.ch);
    }
  }
  const out = { days, ch, beacons };
  activityCache.set(d, out);
  return out;
}

export const activitySource = (d: StuData): string =>
  activity(d).beacons
    ? "student-made only: active_day, feature_used, desk, job, save, apply and plan events, chats in, WhatsApp taps, calls; not outreach rows, sequence emails or match states"
    : "student-made only: chats in, WhatsApp taps, calls, desk, job, save, apply and plan events (active_day not in the log yet); not outreach rows, sequence emails or match states";

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
  /**
   * ADMIN-AUDIT-STU (14 Nov 2026): the metric has an exact time per event, so `until` can cut it at a time of day (the
   * same-time comparison). Without it the data is per IST day only, and a range that ends today is "so far".
   */
  timed?: true;
  /** days: the IST days in one column; until: count only what happened at or before this time, epoch ms */
  cell: (d: StuData, f: Filters, days: Set<string>, scope: Set<number>, until?: number | null) => Cell;
}

/** By the cut time (no cut: everything). */
const by = (t: number, until?: number | null) => until == null || t <= until;

function firstStepCell(d: StuData, key: string, days: Set<string>, scope: Set<number>, until?: number | null): Cell {
  const users: number[] = [];
  for (const i of scope) {
    const t = stepAt(d, d.users[i], key);
    if (t != null && days.has(istDay(t)) && by(t, until)) users.push(i);
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

/** REAL-VISITORS: this log has no page_view at all, so every visitor count is the old one (visited_home, crawlers included). */
export function oldVisitCount(d: StuData, _days?: Iterable<string>): boolean {
  return d.pageViewStart == null;
}

/**
 * ADMIN-FIX (5 Nov 2026): visitors are page_view only, tracked from the first page_view (3 Nov 2026 21:58 IST on
 * production). A range that reaches that day or earlier counts from then: the time to say so, else null.
 */
export function visitorsTrackedFrom(d: StuData, days: Iterable<string>): number | null {
  if (d.pageViewStart == null) return null;
  const first = istDay(d.pageViewStart);
  for (const x of days) if (x <= first) return d.pageViewStart;
  return null;
}

/** "3 Nov 21:58": when visitors began to be tracked, for the range notes. */
export const trackedFromText = (ms: number): string => {
  const iso = new Date(ms + IST_OFFSET_MS).toISOString();
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${iso.slice(11, 16)}`;
};

/** Where the visitor count comes from, for the source notes. */
export function visitSource(d: StuData): string {
  const log = d.journeyLive ? "journey log" : "journey log (not live yet)";
  if (d.pageViewStart == null) return `${log}: visited_home, distinct visitor ids. The old count, crawlers included: this log has no page_view yet`;
  return `${log}: page_view (the site's script ran in a browser), distinct visitor ids, tracked from ${fmtIst(d.pageViewStart)}; server-only hits (crawlers) are never counted`;
}

function visitorCell(d: StuData, f: Filters, key: string, days: Set<string>): Cell {
  if (!d.journeyLive) return { v: 0, users: [], visitors: [], na: true };
  // Visitors are page_view only: days before the first one were not tracked (not zero).
  const from = key === "visited_home" ? visitorsTrackedFrom(d, days) : null;
  if (from != null && ![...days].some((x) => x >= istDay(from))) return { v: 0, users: [], visitors: [], na: true };
  const ids: string[] = [];
  const users: number[] = [];
  for (const v of d.visitors) {
    if (!visitorInScope(v, d, f)) continue;
    if ((v.days[key] ?? []).some((x) => days.has(x))) {
      ids.push(v.id);
      if (v.u >= 0) users.push(v.u);
    }
  }
  const out: Cell = { v: ids.length, users: uniq(users), visitors: ids };
  if (key === "visited_home" && oldVisitCount(d)) out.old = true;
  if (from != null) out.trackedFrom = from;
  return out;
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

function callCell(d: StuData, days: Set<string>, scope: Set<number>, pred: CallPred, at: (c: WireCall) => number | null, until?: number | null): Cell {
  const users: number[] = [];
  let n = 0;
  for (const c of d.calls) {
    if (!scope.has(c[0]) || !pred(c)) continue;
    const t = at(c);
    if (t == null || !days.has(istDay(t)) || !by(t, until)) continue;
    n++;
    users.push(c[0]);
  }
  return cellOf(users, n);
}

/**
 * ADMIN-AUDIT-STU 2 (14 Nov 2026): a burst of call_failed rows from one person (a blocked mic and retry tapped again and
 * again: one student logged 53 in a week) is one failed attempt. A row within FAIL_BURST_MS of that person's previous
 * counted row is the same attempt, so a retry storm no longer reads as 26% of calls failing.
 */
export const FAIL_BURST_MS = 10 * 60_000;
const failAttemptsCache = new WeakMap<readonly WireFail[], WireFail[]>();
export function failAttempts(fails: readonly WireFail[]): WireFail[] {
  const hit = failAttemptsCache.get(fails);
  if (hit) return hit;
  const sorted = [...fails].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: WireFail[] = [];
  const last = new Map<number, number>();
  for (const f of sorted) {
    const prev = last.get(f[0]);
    if (prev != null && f[1] - prev < FAIL_BURST_MS) continue;
    last.set(f[0], f[1]);
    out.push(f);
  }
  failAttemptsCache.set(fails, out);
  return out;
}

function failCell(d: StuData, days: Set<string>, scope: Set<number>, until?: number | null): Cell {
  const users: number[] = [];
  let n = 0;
  for (const [u, t] of failAttempts(d.fails)) {
    if (!scope.has(u) || !days.has(istDay(t)) || !by(t, until)) continue;
    n++;
    users.push(u);
  }
  return { ...cellOf(users, n), na: !d.journeyLive };
}

const both = (a: Cell, b: Cell): Cell => ({ v: a.v + b.v, users: uniq([...a.users, ...b.users]), na: a.na && b.na });

const T = (s: string) => () => s;

/** ADMIN-AUDIT-STU (14 Nov 2026): the one definition of a failed call attempt, for Daily, Ratios and Call health. */
export const FAILED_ATTEMPTS = "failed call attempts: onboarding calls with status failed, plus journey call_failed (mic denied, no mic, network, error), one a person per 10 minutes";
const J = (d: StuData) => (d.journeyLive ? "journey log" : "journey log (not live yet)");

export const DAILY_METRICS: DailyMetricDef[] = [
  { key: "visitors", label: "Visitors", group: "Arrive", source: (d) => visitSource(d), cell: (d, f, days) => visitorCell(d, f, "visited_home", days) },
  { key: "stu_opens", label: "Stu opens", group: "Arrive", source: (d) => `${J(d)}: clicked_join, distinct visitor ids`, cell: (d, f, days) => visitorCell(d, f, "clicked_join", days) },
  { key: "saw_signup", label: `Saw sign-up (${PARTLY_TRACKED})`, group: "Arrive", source: (d) => `${J(d)}: saw_signup, distinct visitor ids. Partly tracked: recorded for about 1 sign-up in 10 (the Google sign-in path writes none), so it is never a base or a drop`, cell: (d, f, days) => visitorCell(d, f, "saw_signup", days) },
  { key: "signups", label: "Sign-ups", group: "Sign up", timed: true, source: (d) => stepSource(d, "signed_up"), cell: (d, _f, days, s, u) => firstStepCell(d, "signed_up", days, s, u) },
  { key: "reached", label: "Reached Stu", group: "Sign up", timed: true, source: (d) => stepSource(d, "reached_stu"), cell: (d, _f, days, s, u) => firstStepCell(d, "reached_stu", days, s, u) },
  { key: "phone", label: "Phone verified", group: "Sign up", timed: true, source: (d) => stepSource(d, "verified_phone"), cell: (d, _f, days, s, u) => firstStepCell(d, "verified_phone", days, s, u) },
  { key: "wa_linked", label: "WhatsApp linked", group: "Sign up", timed: true, source: (d) => stepSource(d, "whatsapp_linked"), cell: (d, _f, days, s, u) => firstStepCell(d, "whatsapp_linked", days, s, u) },
  { key: "calls_started", label: "Calls started", group: "Call", timed: true, source: T("career_voice_calls.started_at, onboarding, returning and build calls (each call)"), cell: (d, _f, days, s, u) => callCell(d, days, s, NON_DESK, (c) => c[5], u) },
  { key: "calls_completed", label: "Calls completed", group: "Call", timed: true, source: T("career_voice_calls status ready or finished, by end time (each call)"), cell: (d, _f, days, s, u) => callCell(d, days, s, (c) => NON_DESK(c) && c[10] === 1, (c) => c[6] ?? c[5], u) },
  { key: "calls_failed", label: "Failed call attempts", group: "Call", timed: true, source: (d) => `${FAILED_ATTEMPTS}; ${J(d)} for call_failed`, cell: (d, _f, days, s, u) => both(callCell(d, days, s, (c) => NON_DESK(c) && c[2] === "failed", (c) => c[4], u), failCell(d, days, s, u)) },
  { key: "calls_dropped", label: "Calls dropped", group: "Call", timed: true, source: T("career_voice_calls.timeline dropped (the connection went)"), cell: (d, _f, days, s, u) => callCell(d, days, s, (c) => NON_DESK(c) && callOutcome(c) === "dropped", (c) => c[5] ?? c[4], u) },
  { key: "calls_hung_early", label: "Hung up in first minute", group: "Call", timed: true, source: T("career_voice_calls: under 60 s, not completed, not dropped"), cell: (d, _f, days, s, u) => callCell(d, days, s, (c) => NON_DESK(c) && callOutcome(c) === "hung_up_first_minute", (c) => c[5] ?? c[4], u) },
  { key: "resumes", label: "Resumes in call", group: "Call", timed: true, source: T("career_voice_calls: onboarding calls with a resume read (each call)"), cell: (d, _f, days, s, u) => callCell(d, days, s, (c) => c[1] === "onboarding" && c[9] === 1, (c) => c[5] ?? c[4], u) },
  { key: "onboarded", label: "Onboarded", group: "Call", timed: true, source: (d) => stepSource(d, "onboarded"), cell: (d, _f, days, s, u) => firstStepCell(d, "onboarded", days, s, u) },
  { key: "active", label: "Active (did something)", group: "Use", source: (d) => activitySource(d), cell: (d, _f, days, s) => activeCell(d, days, s) },
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
  { key: "saw_jobs", label: "Saw jobs (first time)", group: "Use", timed: true, source: (d) => stepSource(d, "saw_jobs"), cell: (d, _f, days, s, u) => firstStepCell(d, "saw_jobs", days, s, u) },
  { key: "job_opens", label: "Job opens", group: "Use", source: (d) => `${J(d)}: opened_job (each)`, cell: (d, _f, days, s) => actCell(d, ["job_open"], days, s, "sum", !d.journeyLive) },
  { key: "saved", label: "Saved a job (first time)", group: "Use", timed: true, source: (d) => stepSource(d, "saved_job"), cell: (d, _f, days, s, u) => firstStepCell(d, "saved_job", days, s, u) },
  { key: "apply_clicks", label: "Apply clicks", group: "Use", source: (d) => `${J(d)}: apply_click (each)`, cell: (d, _f, days, s) => actCell(d, ["apply"], days, s, "sum", !d.journeyLive) },
  { key: "chats", label: "Chat messages to Stu", group: "Use", source: T("career_messages (desk chat), career_channel_messages in (WhatsApp), desk and interview calls"), cell: (d, _f, days, s) => actCell(d, ["chat_desk", "chat_wa", "chat_call"], days, s, "sum") },
  { key: "chatters", label: "People who chatted", group: "Use", source: T("same tables, distinct people a day"), cell: (d, _f, days, s) => actCell(d, ["chat_desk", "chat_wa", "chat_call"], days, s, "users") },
  { key: "digest_sent", label: "Digests sent", group: "Use", source: T("career_daily_sends whatsapp picks, sent_at"), cell: (d, _f, days, s) => actCell(d, ["digest_sent"], days, s, "sum") },
  { key: "digest_read", label: "Digests read", group: "Use", source: T("career_daily_sends whatsapp picks, read_at"), cell: (d, _f, days, s) => actCell(d, ["digest_read"], days, s, "sum") },
  { key: "digest_tapped", label: "Digests tapped", group: "Use", source: T("career_daily_sends whatsapp picks, tapped_at"), cell: (d, _f, days, s) => actCell(d, ["digest_tapped"], days, s, "sum") },
  { key: "outreach_people", label: "Outreach started (people)", group: "Outreach", timed: true, source: (d) => stepSource(d, "outreach_started"), cell: (d, _f, days, s, u) => firstStepCell(d, "outreach_started", days, s, u) },
  { key: "outreach_rows", label: "Jobs added to outreach", group: "Outreach", source: T("career_outreach.created_at (each)"), cell: (d, _f, days, s) => actCell(d, ["outreach_row"], days, s, "sum") },
  { key: "mailboxes", label: "Mailboxes connected", group: "Outreach", timed: true, source: (d) => stepSource(d, "mailbox_connected"), cell: (d, _f, days, s, u) => firstStepCell(d, "mailbox_connected", days, s, u) },
  { key: "emails", label: "Emails sent (real)", group: "Outreach", source: T("career_emails status sent, not a dry run or test inbox (each)"), cell: (d, _f, days, s) => actCell(d, ["email"], days, s, "sum") },
  { key: "emails_test", label: "Emails sent (dry run / test)", group: "Outreach", kind: "test", source: T("career_emails sent as a dry run or from a test inbox (each)"), cell: (d, _f, days, s) => actCell(d, ["email_test"], days, s, "sum") },
  { key: "replies", label: "Replies (real)", group: "Outreach", source: T("career_sequences.replied_at, not bounce, not dry run (each)"), cell: (d, _f, days, s) => actCell(d, ["reply"], days, s, "sum") },
  { key: "replies_test", label: "Replies (dry run / test)", group: "Outreach", kind: "test", source: T("career_sequences.replied_at on dry-run sequences"), cell: (d, _f, days, s) => actCell(d, ["reply_test"], days, s, "sum") },
  { key: "plan_views", label: "Plan views", group: "Pay", source: (d) => `${J(d)}: saw_plans (each)`, cell: (d, _f, days, s) => actCell(d, ["plan_view"], days, s, "sum", !d.journeyLive) },
  { key: "paid_users", label: "Paid users (real)", group: "Pay", source: T("money in: career_credit_orders paid, not test, less refunds above zero; autopay charges (career_plan_grants autopay, not refunded, subscription not test, not also an order); career_plans jobs, not test or grant"), cell: (d, _f, days, s) => actCell(d, ["pay"], days, s, "users") },
  { key: "revenue", label: "Revenue (real, INR)", group: "Pay", kind: "inr", source: T("career_credit_orders amount_paise less refunds, paid and not test; plus each autopay charge at its subscription's amount"), cell: (d, _f, days, s) => actCell(d, ["pay"], days, s, "amount") },
  { key: "test_payments", label: "Test payments", group: "Pay", kind: "test", source: T("career_credit_orders test, test autopay charges, career_plans source test (latest change), career_outreach_credits test_purchase"), cell: (d, _f, days, s) => actCell(d, ["pay_test"], days, s, "sum") },
];

export interface DailyColumn {
  label: string;
  days: string[];
  /** ADMIN-AUDIT-STU (14 Nov 2026): the column holds today (IST), which is not over: "so far", never coloured */
  soFar?: boolean;
}

export function dailyColumns(f: Filters, group: number, today: string = todayIst()): DailyColumn[] {
  const days = dayRange(f.start, f.end);
  const cols: DailyColumn[] = [];
  for (let i = 0; i < days.length; i += group) {
    const chunk = days.slice(i, i + group);
    const soFar = chunk.includes(today);
    const label = chunk.length === 1 ? chunk[0].slice(5) : `${chunk[0].slice(5)} to ${chunk[chunk.length - 1].slice(5)}`;
    cols.push({ label: soFar ? `${label} so far` : label, days: chunk, ...(soFar ? { soFar } : {}) });
  }
  return cols;
}

/**
 * ADMIN-AUDIT-STU (14 Nov 2026): the Daily colour of a cell against the column before it. Never for a test row, a
 * missing number, an old visitor count next to a real one, or a column that holds today (a day not over against a
 * whole day).
 */
export function dailyTone(def: Pick<DailyMetricDef, "kind">, cur: Cell, prev: Cell | null, col: Pick<DailyColumn, "soFar">): "up" | "down" | "" {
  if (def.kind === "test" || !prev || col.soFar || cur.na || prev.na || cur.old !== prev.old) return "";
  return cur.v > prev.v ? "up" : cur.v < prev.v ? "down" : "";
}

/**
 * ADMIN-AUDIT-STU (14 Nov 2026): what a range is compared with. The period just before, the same number of days; when
 * the range ends today (IST) it is cut at the same time of day (now less the range's length: yesterday up to this time,
 * or the 7 days before up to this time on their last day), as today is not over. `until` is that cut, else null.
 * A metric with no time per event (per IST day only) cannot be cut: soFar says to show it as "so far", with no %.
 */
export interface CompareBasis {
  pf: Filters;
  until: number | null;
  soFar: boolean;
}

export function compareBasis(f: Filters, now: number): CompareBasis {
  const n = dayRange(f.start, f.end).length;
  const pf = { ...f, start: addDays(f.start, -n), end: addDays(f.start, -1) };
  const soFar = f.end >= istDay(now);
  return { pf, until: soFar ? now - n * 86_400_000 : null, soFar };
}

/** The time the dataset was read (what "now" is for its numbers), else the clock. */
export const dataNow = (d: Pick<StuData, "generatedAt">): number => {
  const t = Date.parse(d.generatedAt);
  return Number.isFinite(t) ? t : Date.now();
};

/** "vs yesterday at this time", "vs the day before", "vs the 7 days before at this time". */
export function compareText(f: Filters, c: Pick<CompareBasis, "until">): string {
  const n = dayRange(f.start, f.end).length;
  if (n === 1) return c.until != null ? "vs yesterday at this time" : "vs the day before";
  return c.until != null ? `vs the ${n} days before at this time` : `vs the ${n} days before`;
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
  /** % of the last gate step above (fromKey), never over 100 */
  pctPrev: number | null;
  /** the gate step the % is of */
  fromKey?: string | null;
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
  // ADMIN-FIX (5 Nov 2026): a step's % is of the last gate step above it, not of the row above. A branch step
  // (phone, desk, plans, outreach, paid) does not follow the branch before it, so "% of the row above" went past 100.
  let gateKey: string | null = null;
  let gateCount = cohort.length;
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
      pctPrev: gateKey ? capPct(pct(did.length, gateCount)) : null,
      fromKey: gateKey,
      pctSignups: pct(did.length, cohort.length),
      medianFromPrev: median(gaps),
      source: stepSource(d, s.key),
    });
    if (s.key === "paid") {
      const tp = pool.filter((i) => d.users[i].testPaid != null);
      rows.push({
        key: "paid_test", n: s.n, label: "Paid (test payments)", gate: false, test: true,
        cell: cellOf(tp), pctPrev: null, pctSignups: pct(tp.length, cohort.length), medianFromPrev: null,
        source: "career_credit_orders test, career_plans source test, career_outreach_credits test_purchase",
      });
    }
    if (isGate && nested) passed = did;
    if (isGate) {
      gateKey = s.key;
      gateCount = did.length;
    }
  }
  return { rows, cohort };
}

/** ADMIN-FIX (5 Nov 2026): the rows (IST days) on or after the count-from line; days before it were not counted, they are not zeros. */
export const liveDays = <T extends { day: string }>(rows: T[], from: number | null | undefined): T[] =>
  from == null ? rows : rows.filter((x) => x.day >= istDay(from));

/** A funnel % is a share: never over 100 (a step that is not a subset of its base, like sign-ups of visitors). */
export const capPct = (p: number | null): number | null => (p == null ? null : Math.min(100, p));

/** ADMIN-FIX (5 Nov 2026): someone outside the team has paid for real (Paid joins the "biggest drop" from then). */
export const paidLive = (d: StuData): boolean => d.users.some((u) => !u.internal && stepAt(d, u, "paid") != null);

/** A funnel bar as funnelBasis reads and sets it (the Overview's FunnelBar adds its labels and the median time). */
export interface BasisBar {
  key: string;
  anon: boolean;
  gate: boolean;
  cell: Cell;
  /** the journey log is live but has never recorded this step (a beacon not wired yet) */
  untracked: boolean;
  /** the bar the % (and the time) is measured from */
  fromKey: string | null;
  /** % of that bar, never over 100 */
  pctPrev: number | null;
  /** fewer people than a later step they come before: the beacon misses people, so it is not a drop */
  gap?: boolean;
  /** ADMIN-AUDIT-STU: a partly tracked step (StepDef.partial): no %, never a base and never a drop */
  partial?: boolean;
}

/**
 * ADMIN-FIX (5 Nov 2026), the % of each funnel bar and the biggest drop, for any list of bars in plan order (the
 * Overview's short funnel calls it on the bars it shows):
 * - Before sign-up, a visitor step is % of the visitor step above it, and Signed up is % of the last of them.
 * - After sign-up, a gate step (signed up, call started, call completed, onboarded, saw jobs) is % of the gate above;
 *   a branch step (phone, desk, plans, outreach, paid) is % of the last gate above, as it does not follow the branch
 *   before it.
 * - Never over 100%. A step with fewer people than the sign-ups below it (a visitor step), or at zero with people
 *   later, is a beacon gap: not a base and not a drop.
 * - The biggest drop is the lowest % among the visitor steps and the gates, and Paid once someone has really paid.
 * Sets fromKey, pctPrev and gap on the bars it is given; returns the key of the biggest drop, or null.
 */
export function funnelBasis(bars: BasisBar[], withPaid: boolean): string | null {
  const signed = bars.find((b) => b.key === "signed_up" && !b.untracked && !b.cell.na);
  let lastAnon: BasisBar | null = null;
  let lastGate: BasisBar | null = null;
  let drop: BasisBar | null = null;
  bars.forEach((b, k) => {
    b.fromKey = null;
    b.pctPrev = null;
    b.gap = false;
    if (b.untracked || b.partial) return;
    b.gap = (b.cell.v === 0 && bars.slice(k + 1).some((x) => !x.untracked && x.cell.v > 0)) || (b.anon && signed != null && b.cell.v < signed.cell.v);
    const from = b.anon || b.key === "signed_up" ? lastAnon : lastGate;
    if (from) {
      b.fromKey = from.key;
      b.pctPrev = from.cell.na || b.cell.na ? null : capPct(pct(b.cell.v, from.cell.v));
    }
    const candidate = b.anon || b.gate || (b.key === "paid" && withPaid);
    if (candidate && !b.gap && from && from.cell.v > 0 && b.pctPrev != null && b.pctPrev < 100 && (!drop || b.pctPrev < drop.pctPrev!)) drop = b;
    if (b.anon && !b.gap) lastAnon = b;
    if (!b.anon && b.gate) lastGate = b;
  });
  return drop ? (drop as BasisBar).key : null;
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
  const failsJ = failAttempts(d.fails).filter(([u]) => cohortSet.has(u));
  // ADMIN-AUDIT-STU (14 Nov 2026): one definition (FAILED_ATTEMPTS) for calls and people: a mic denied or any other
  // call_failed is a failed attempt too. Attempts: calls made plus those call_failed rows.
  const failedAttempts = [...failedCalls.map((c) => c[0]), ...failsJ.map(([u]) => u)];
  const attempts = [...nonDesk.map((c) => c[0]), ...failsJ.map(([u]) => u)];
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
    R("call_fail", "Call failure rate (people)", anyFail, tried, `people with a failed attempt (${FAILED_ATTEMPTS}) over people who tried a call`),
    R("call_fail_calls", "Call failure rate (attempts)", cellOf(failedAttempts, failedAttempts.length), cellOf(attempts, attempts.length), `${FAILED_ATTEMPTS}, over calls made (not desk or interview) plus those call_failed rows`),
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
  if (by === "device") return u.device || u.touch?.device || "unknown";
  if (by === "inapp") return u.inapp || "unknown";
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

/**
 * ADMIN-FIX (5 Nov 2026): where the range's sign-ups came from, by channel (the referrer counts, so a Google search is
 * not "(none)"), with the campaign most of that channel's sign-ups carry. "mostly" only above half.
 */
export function signupSourceText(d: StuData, f: Filters, total: number, channelName: (k: string) => string = (k) => k): string {
  if (total <= 0) return "";
  const top = sources(d, f, "channel").rows.filter((r) => r.key !== "not_captured")[0];
  if (!top) return "";
  const n = top.users.length;
  const camps = new Map<string, number>();
  for (const i of top.users) {
    const c = d.users[i].touch?.campaign;
    if (c) camps.set(c, (camps.get(c) ?? 0) + 1);
  }
  const [camp, cn] = [...camps.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const campText = camp && cn * 2 > n ? `, ${cn === n ? "all" : cn} on campaign ${camp}` : "";
  return n * 2 > total ? `, mostly from ${channelName(top.key)} (${n} of ${total}${campText})` : `; the top source is ${channelName(top.key)} (${n} of ${total}${campText})`;
}

// ----------------------------------------------------------------- retention

export interface RetentionRow {
  week: string;
  size: Cell;
  /** soFar (ADMIN-AUDIT-STU, 14 Nov 2026): day N is today for some of the people, so the day is not over */
  d: Record<string, { back: Cell; eligible: Cell; value: number | null; soFar?: boolean }>;
}

export const RETENTION_DAYS = [1, 7, 30] as const;

/**
 * Came back (any activity, as "Active students" counts it: model.ts activity) on day N after the IST day they joined;
 * `orLater` counts day N or any later day. ADMIN-FIX (5 Nov 2026): it was desk opens only, so someone who came back
 * and sent an email without opening the desk read as gone. Rows are weeks of joining (Monday), or IST days of
 * joining with `by` "day" (the Overview's cohort heatmap).
 */
export function retention(d: StuData, f: Filters, orLater: boolean, by: "week" | "day" = "week", ns: readonly number[] = RETENTION_DAYS, today: string = todayIst()): RetentionRow[] {
  const cohort = cohortOf(d, f);
  const backDays = new Map<number, Set<string>>();
  for (const [u, m] of activity(d).days) backDays.set(u, new Set(m.keys()));
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
        const ds = backDays.get(i);
        if (!ds) return false;
        if (!orLater) return ds.has(target);
        for (const x of ds) if (x >= target) return true;
        return false;
      });
      const soFar = eligible.some((i) => addDays(istDay(d.users[i].joined), n) === today);
      row.d[`d${n}`] = { back: cellOf(back), eligible: cellOf(eligible), value: pct(back.length, eligible.length), ...(soFar ? { soFar } : {}) };
    }
    return row;
  });
}

// --------------------------------------------------------------------- reset

/**
 * RESET (3 Nov 2026, the owner: "reset the admin dashboard to 0"): every Stu
 * page counts from COUNT_FROM, as if the product's data began then. Nothing is
 * deleted: the loader drops what came before (sinceReset), so moving the line
 * (env STU_COUNT_FROM, an ISO time) brings it back. Someone active before it
 * who comes back joins on their first time after it, a new sign-up that day
 * (the owner's rule of 2 Nov: every first sign-in counts as new).
 */
export const COUNT_FROM_DEFAULT = "2026-11-03T00:00:00+05:30";

/** STU_COUNT_FROM as epoch ms: an ISO time, else COUNT_FROM_DEFAULT. Pure. */
export function countFrom(raw: string | undefined): number {
  const t = raw ? Date.parse(raw.trim()) : NaN;
  return Number.isFinite(t) ? t : Date.parse(COUNT_FROM_DEFAULT);
}

/**
 * The dataset from `from` on: earlier step times, days, calls and failures
 * dropped, people left with nothing dropped (indexes renumbered), and a person
 * who joined before it joins at their first time after it. Pure.
 */
export function sinceReset(d: StuData, from: number): StuData {
  const fromDay = istDay(from);
  const times = <T extends Partial<Record<string, number>>>(o: T): T =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v >= from)) as T;
  const act = d.act.filter((a) => a[2] >= fromDay);
  const calls = d.calls.filter((c) => c[4] >= from);
  const fails = d.fails.filter((f) => f[1] >= from);
  const visitors = d.visitors
    .map((v) => ({
      ...v,
      first: times(v.first),
      days: Object.fromEntries(Object.entries(v.days).map(([k, ds]) => [k, (ds ?? []).filter((x) => x >= fromDay)]).filter(([, ds]) => ds.length)),
    }))
    .filter((v) => Object.keys(v.first).length > 0 || Object.keys(v.days).length > 0);
  const people = d.users.map((u) => ({ ...u, t: times(u.t), j: times(u.j), testPaid: u.testPaid != null && u.testPaid >= from ? u.testPaid : null }));
  // Each person's first time from `from` on, from everything that still names them. ADMIN-FIX (5 Nov 2026): the
  // first exact time wins; a day-level row (activity counted by IST day) only knows the date, so its 00:00 is used
  // only when nothing exact exists, or when that day is earlier than the first exact time's day.
  const exact = new Map<number, number>();
  const byDay = new Map<number, number>();
  const seen = (m: Map<number, number>, i: number, at: number) => {
    if (i >= 0 && !(m.get(i)! <= at)) m.set(i, at);
  };
  people.forEach((u, i) => {
    if (u.joined >= from) seen(exact, i, u.joined);
    for (const v of [...Object.values(u.t), ...Object.values(u.j), u.testPaid]) if (v != null) seen(exact, i, v);
  });
  for (const a of act) seen(byDay, a[1], Math.max(from, Date.parse(`${a[2]}T00:00:00+05:30`)));
  for (const c of calls) seen(exact, c[0], c[4]);
  for (const f of fails) seen(exact, f[0], f[1]);
  for (const v of visitors) {
    const ts = Object.values(v.first).filter((x): x is number => x != null);
    if (v.u < 0) continue;
    if (ts.length) seen(exact, v.u, Math.min(...ts));
    else seen(byDay, v.u, from);
  }
  const first = new Map<number, number>();
  for (const i of new Set([...exact.keys(), ...byDay.keys()])) {
    const e = exact.get(i);
    const dd = byDay.get(i);
    first.set(i, e != null && (dd == null || istDay(dd) >= istDay(e)) ? e : dd!);
  }
  const keep = [...first.keys()].sort((a, b) => a - b);
  const at = new Map(keep.map((old, n) => [old, n]));
  const re = (i: number) => at.get(i) ?? -1;
  return {
    ...d,
    countFrom: from,
    journeyStart: d.journeyStart == null ? null : Math.max(d.journeyStart, from),
    journeyLiveStart: d.journeyLiveStart == null ? d.journeyLiveStart : Math.max(d.journeyLiveStart, from),
    users: keep.map((i) => (people[i].joined >= from ? people[i] : { ...people[i], joined: first.get(i)! })),
    visitors: visitors.map((v) => ({ ...v, u: v.u >= 0 ? re(v.u) : -1 })),
    act: act.map((a): Act => [a[0], re(a[1]), a[2], a[3], a[4]]),
    calls: calls.map((c): WireCall => [re(c[0]), c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10]]),
    fails: fails.map((f): WireFail => [re(f[0]), f[1], f[2]]),
  };
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
