// EMAIL-PAGE (17 Nov 2026, the owner: "add open rate tracking etc, check and lmk go deep and see what a funnel needs to
// be"). The rules and the words behind /email-funnel: how Stu's own emails to students perform, from due to paid. The
// server (email.server.ts) reads the rows; this builds the report from them. Pure and with no imports, so
// `node --test scripts/email-funnel-model.test.mjs` reads it as is.
//
// The ledger (career_agent.career_daily_sends, channel 'email') holds one row per try, with the first open (read_at) and
// the first tap (tapped_at) stamped on it. Sent: the provider took it (meta.acs_id; a Google send carries
// 'google:<Message-ID>'), the product's own rule (career-agent reach.server.ts EMAIL_FUNNEL_SQL). The event log
// (career_email_events: every open, tap, reply, bounce and unsubscribe as a row), the skips (career_email_skips: why a due
// email was not sent) and the seed inbox checks (career_email_placements) come from the career-agent builder in parallel.
// Until a table is live here, its part reads the ledger (opens, taps), the student's inbound emails (replies), the email
// settings (unsubscribes) or shows that it waits. Per email, the log wins where it has a row of that signal, and the
// ledger's stamp stands in where it has none, so a range that spans the log going live reads right on both sides.

// ------------------------------------------------------------------ constants

export const RANGES = [1, 7, 30] as const;
export type RangeDays = (typeof RANGES)[number];
export const DEFAULT_DAYS: RangeDays = 7;
/** The days the trend shows, whatever the range. */
export const TREND_DAYS = 14;
/** Acted: the kind's goal within this long after the email's first open, click or reply. */
export const ACT_WINDOW_MS = 48 * 3_600_000;
/** Paid: a real payment within this long after the email's first open, click or reply. */
export const PAY_WINDOW_MS = 7 * 86_400_000;
/** A goal or payment stamped this much before the open (a click's redirect lands before the pixel loads) still counts. */
export const SLACK_MS = 2 * 60_000;
/** A reply answers the student's latest email from Stu in the 3 days before it (career-agent answer.server.ts CONTEXT_DAYS). */
export const REPLY_CONTEXT_MS = 3 * 86_400_000;
/** An unsubscribe in the settings is put on the student's latest email delivered in the 7 days before it. */
export const UNSUB_CONTEXT_MS = 7 * 86_400_000;
/** A reply stamps tapped_at on the day's email rows at the reply's own time (policy.server.ts INBOUND_SQL): not a click. */
export const REPLY_TOUCH_MS = 5_000;
/** Sent this recently with no delivery report: on its way, not missing. */
export const PENDING_MS = 30 * 60_000;
/** Rows in the recent emails list. */
export const RECENT_ROWS = 50;
/** Below this many emails a rate is shown but its colour says "small sample". */
export const SMALL_SAMPLE = 20;

/** The health strip's limits (the owner's brief, 17 Nov 2026) and the industry ranges for lifecycle email. */
export const LIMITS = {
  delivered: { warnBelow: 97 },
  bounce: { warnAbove: 2, badAbove: 5 },
  unsub: { warnAbove: 0.5, badAbove: 1 },
  primary: { warnBelow: 70 },
  complaint: { warnAbove: 0.1, badAbove: 0.3 },
} as const;
export const INDUSTRY = { open: [35, 55], click: [3, 10], unsubUnder: 0.3, bounceUnder: 2, spamUnder: 0.1, gmailSpamLimit: 0.3 } as const;

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

// ------------------------------------------------------------------ the kinds

export type KindKey =
  | "picks" | "floor" | "reply" | "ready" | "rollup" | "followups" | "inbox" | "closing" | "start" | "call" | "week" | "winback" | "answer" | "other";
export type GoalKey = "save_or_outreach" | "call" | "replies" | "inbox" | "desk";

/** Every kind Stu emails (career-agent channels/email/copy.ts KINDS), its plain name, its code in the plan, and its goal. */
export const KINDS: { key: KindKey; label: string; code: string; goal: GoalKey }[] = [
  { key: "picks", label: "Morning matches", code: "M1", goal: "save_or_outreach" },
  { key: "floor", label: "Twice-a-week floor", code: "M2", goal: "save_or_outreach" },
  { key: "reply", label: "Hiring manager replied", code: "C1", goal: "replies" },
  { key: "ready", label: "Email written", code: "C2", goal: "desk" },
  { key: "rollup", label: "Evening update", code: "C3", goal: "desk" },
  { key: "followups", label: "Follow-ups tomorrow", code: "C4", goal: "desk" },
  { key: "inbox", label: "Inbox disconnected", code: "C5", goal: "inbox" },
  { key: "closing", label: "Liked role closing", code: "C6", goal: "desk" },
  { key: "start", label: "We didn't talk yet", code: "J1", goal: "call" },
  { key: "call", label: "Finish your call", code: "J2", goal: "call" },
  { key: "week", label: "Sunday note", code: "W1", goal: "desk" },
  { key: "winback", label: "Still looking", code: "W2", goal: "desk" },
  { key: "answer", label: "Stu's answers", code: "Re", goal: "desk" },
  { key: "other", label: "Other", code: "", goal: "desk" },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label])) as Record<KindKey, string>;
const KIND_GOAL = Object.fromEntries(KINDS.map((k) => [k.key, k.goal])) as Record<KindKey, GoalKey>;
const KIND_KEYS = new Set<string>(KINDS.map((k) => k.key));

/** What "acted" means for each goal, in words. */
export const GOAL_TEXT: Record<GoalKey, string> = {
  save_or_outreach: "saved a job or started outreach",
  call: "started a call",
  replies: "opened their replies",
  inbox: "connected an inbox",
  desk: "opened Stu from the email",
};

/** The ledger's kind of each email kind (copy.ts KINDS ledgerKind), for a row with no meta.email_kind and for the skips. */
const LEDGER_KIND: Record<string, KindKey> = {
  picks: "picks", reply_alert: "reply", emails_ready: "ready", emails_sent: "rollup", followup_scheduled: "followups",
  inbox_disconnected: "inbox", liked_job_closing: "closing", email_answer: "answer", email_start: "start", email_call: "call",
  recap: "week", winback: "winback",
};

/** The email kind of a row or a skip: meta.email_kind, else from the ledger's kind (a picks row with meta.floor is M2). */
export function kindOf(emailKind: string | null | undefined, ledgerKind?: string | null, floor = false): KindKey {
  const e = (emailKind ?? "").trim();
  if (KIND_KEYS.has(e) && e !== "other") return e as KindKey;
  const k = LEDGER_KIND[(ledgerKind ?? e).trim()];
  if (k === "picks" && floor) return "floor";
  return k ?? "other";
}

/** Why a due email was not sent (career_email_skips.reason), in plain words; "refused" is ours: the provider said no. */
export const SKIP_REASONS: { key: string; label: string }[] = [
  { key: "whatsapp_reached", label: "WhatsApp reached them" },
  { key: "cap", label: "Daily cap (warm-up)" },
  { key: "hourly_cap", label: "Hourly cap" },
  { key: "quiet_hours", label: "Outside email hours" },
  { key: "prefs", label: "They turned emails off" },
  { key: "suppressed", label: "Address bounced before" },
  { key: "not_set_up", label: "Not set up" },
  { key: "cadence", label: "Not due by cadence" },
  { key: "no_picks", label: "No picks" },
  { key: "team_only", label: "Team only (students off)" },
  { key: "already_sent", label: "Already sent" },
  { key: "refused", label: "Provider refused the send" },
  { key: "other", label: "Other" },
];
const SKIP_LABEL = Object.fromEntries(SKIP_REASONS.map((r) => [r.key, r.label])) as Record<string, string>;
export const skipLabel = (k: string): string => SKIP_LABEL[k] ?? k.replace(/_/g, " ");

/** What came of a message in Stu's inbox (career_email_inbound.outcome; inbox.server.ts InboxOutcome). */
const INBOUND_LABEL: Record<string, string> = {
  answered: "Answered by Stu", stopped: "Asked to stop", quiet: "Over Stu's answer limits", repeat: "Seen before", empty: "Empty",
  held: "Held for the team", failed: "Answer failed", unread: "Left for the team", old: "Older than 24 h", dsn: "Bounce notice",
  stranger: "Not a student", audience: "Student not in the audience", banned: "Banned", suppressed: "Suppressed address",
  no_sender: "No sender", own: "Our own mail", bounce: "Bounce notice", noreply: "No-reply sender", list: "Mailing list",
  auto: "Auto reply", unauthenticated: "Failed sender checks",
};
export const inboundLabel = (k: string): string => INBOUND_LABEL[k] ?? k.replace(/_/g, " ");

export const PLACEMENTS = ["primary", "promotions", "updates", "social", "forums", "spam", "not_found"] as const;
export type PlacementKey = (typeof PLACEMENTS)[number];
export const PLACEMENT_LABEL: Record<PlacementKey, string> = {
  primary: "Primary", promotions: "Promotions", updates: "Updates", social: "Social", forums: "Forums", spam: "Spam", not_found: "Not found",
};

/** How an open was seen (career_email_events.detail on 'opened'). Apple's are machine opens: out of the open rate. */
export const OPEN_SOURCES = ["gmail_proxy", "yahoo_proxy", "client", "apple_mpp"] as const;
export const OPEN_SOURCE_LABEL: Record<string, string> = {
  gmail_proxy: "Gmail (image proxy)", yahoo_proxy: "Yahoo (image proxy)", client: "Mail app", apple_mpp: "Apple Mail Privacy (machine)",
  ledger: "Ledger stamp (source unknown)",
};

// ------------------------------------------------------------------ input

/** One email try on the ledger. Times are epoch ms. `to` is already masked on the server. */
export interface EmailRowIn {
  id: number;
  user: string;
  /** the student's local day (career_daily_sends.local_day) */
  day: string;
  kind: KindKey;
  /** meta.key: the claim (a retry of the same email shares it) */
  key: string | null;
  sentAt: number;
  /** the provider took it (meta.acs_id) */
  taken: boolean;
  deliveredAt: number | null;
  readAt: number | null;
  tappedAt: number | null;
  /** meta.opens, every open the pixel saw */
  opens: number;
  failed: boolean;
  bounced: boolean;
  team: boolean;
  via: "acs" | "google";
  to: string;
}

export type EventName =
  | "sent" | "delivered" | "bounced" | "suppressed" | "failed" | "opened" | "tapped" | "replied" | "unsubscribed" | "resubscribed" | "complained";

/** career_email_events, one line per row, event and detail: how many, the first and last time. */
export interface EventIn {
  row: number;
  event: EventName | string;
  detail: string | null;
  n: number;
  first: number;
  last: number;
  sender: string | null;
}

/** career_email_skips, one per local day, kind and student (the latest reason). */
export interface SkipIn {
  day: string;
  kind: string;
  user: string;
  reason: string;
  at: number;
}

export interface PlacementIn {
  id: number;
  day: string;
  kind: string;
  via: string | null;
  sender: string | null;
  /** the seed inbox, masked on the server */
  seed: string;
  status: string | null;
  placement: string | null;
  sentAt: number | null;
  placedAt: number | null;
}

/**
 * A goal step from the journey log (career_journey_events), or a mailbox connect from career_mail_accounts as
 * mailbox_connected. desk_opened only when it came from an email link (props.utm_source 'email').
 */
export interface GoalIn {
  user: string;
  step: "job_saved" | "outreach_started" | "call_started" | "desk_opened" | "mailbox_connected" | string;
  at: number;
}

/** A real payment (money in, the Stu pages' rule): a credit order less refunds above zero, an autopay charge, a plan. */
export interface PayIn {
  user: string;
  at: number;
}

/** A student's own email to Stu (career_channel_messages, channel 'email', in). */
export interface ReplyIn {
  user: string;
  at: number;
}

/** career_email_prefs: an unsubscribe or a spam mark in the range. */
export interface PrefIn {
  user: string;
  unsubAt: number | null;
  complainedAt: number | null;
}

/** WhatsApp business rows in the range, per student. */
export interface WaUserIn {
  user: string;
  sent: number;
  delivered: number;
  read: number;
  tapped: number;
}

export interface EmailInput {
  /** the database's now, epoch ms */
  now: number;
  days: RangeDays;
  /** include the team (meta.team) and internal accounts */
  team: boolean;
  /** which of the new tables are live here */
  live: { events: boolean; skips: boolean; placements: boolean };
  /** the event log's first row, epoch ms (null: none yet) */
  eventsSince: number | null;
  /** internal accounts: id to why (staff, studojo.com, test account, guest) */
  internal: Record<string, string>;
  rows: EmailRowIn[];
  events: EventIn[];
  skips: SkipIn[];
  placements: PlacementIn[];
  goals: GoalIn[];
  pays: PayIn[];
  replies: ReplyIn[];
  prefs: PrefIn[];
  wa: WaUserIn[];
  inbound: { outcome: string; n: number }[];
}

// ----------------------------------------------------------------- output

export interface Ratio {
  n: number;
  of: number;
  /** one decimal; null when there is nothing to divide by */
  pct: number | null;
}

/** Everything we know about one email, worked out once. */
export interface RowFacts {
  id: number;
  user: string;
  kind: KindKey;
  day: string;
  key: string | null;
  sentAt: number;
  student: boolean;
  internal: string | null;
  taken: boolean;
  refused: boolean;
  delivered: boolean;
  bounced: boolean;
  /** taken, then dropped by the provider (Azure's spam filter): not delivered, not a bounce */
  dropped: boolean;
  pending: boolean;
  /** a person opened it (not Apple's machine open), or it was clicked or answered: an open is implied */
  opened: boolean;
  /** only Apple Mail Privacy opened it: a machine open, left out */
  machineOnly: boolean;
  opens: number;
  openBy: Record<string, number>;
  clicked: boolean;
  /** the link codes tapped (from the event log) */
  codes: string[];
  replied: boolean;
  engagedAt: number | null;
  acted: boolean;
  /** opened, not acted yet, and the 48 h are not over */
  actOpen: boolean;
  /** acted, then paid within 7 days */
  paid: boolean;
  /** opened and paid within 7 days, acted or not */
  paidAny: boolean;
  payOpen: boolean;
  unsub: boolean;
  complained: boolean;
  route: "acs" | "google";
  sender: string;
  to: string;
}

export type StepKey = "due" | "sent" | "delivered" | "opened" | "clicked" | "acted" | "paid";
export interface FunnelStep {
  key: StepKey;
  label: string;
  /** null: not known here yet (Due without the skips) */
  n: number | null;
  /** the step this one is a share of */
  base: StepKey | null;
  ofBase: number | null;
  /** lost from the base */
  drop: number | null;
  /** the bar: a share of the first known step */
  ofTop: number | null;
  note: string;
}

export type HealthState = "good" | "warn" | "bad" | "none" | "empty";
export interface HealthTile {
  key: "delivered" | "bounce" | "unsub" | "open" | "click" | "cto" | "reply" | "primary" | "complaint";
  label: string;
  ratio: Ratio;
  state: HealthState;
  /** the limit or reference, in words */
  rule: string;
  /** shown in place of a number when there is no data of this kind */
  empty: string | null;
  small: boolean;
}

/** A row of the "by kind" and "by route" tables. */
export interface RateRow {
  key: string;
  label: string;
  sub: string;
  sent: number;
  delivered: Ratio;
  open: Ratio;
  click: Ratio;
  cto: Ratio;
  reply: Ratio;
  acted: Ratio;
  unsub: Ratio;
  bounce: Ratio;
  refused: number;
  skipped: number;
}

export interface TrendDay {
  day: string;
  soFar: boolean;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export interface PlacementLatest {
  kind: string;
  seed: string;
  via: string | null;
  sender: string | null;
  placement: string | null;
  status: string | null;
  at: number | null;
}

export interface Side {
  sent: number;
  delivered: Ratio;
  read: Ratio;
  tapped: Ratio;
}

export type StatusKey = "refused" | "bounced" | "dropped" | "replied" | "clicked" | "opened" | "machine" | "delivered" | "pending" | "no_report";
export const STATUS_LABEL: Record<StatusKey, string> = {
  refused: "Not sent", bounced: "Bounced", dropped: "Dropped", replied: "Replied", clicked: "Clicked", opened: "Opened",
  machine: "Machine open", delivered: "Delivered", pending: "On its way", no_report: "No report",
};

export interface RecentRow {
  id: number;
  to: string;
  kind: KindKey;
  sentAt: number;
  route: "acs" | "google";
  delivered: boolean;
  opens: number;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
  unsub: boolean;
  status: StatusKey;
  internal: string | null;
  team: boolean;
}

export interface EmailReport {
  now: number;
  days: RangeDays;
  from: number;
  team: boolean;
  live: { events: boolean; skips: boolean; placements: boolean };
  /** emails in range left out as team or internal (0 when included) */
  leftOut: number;
  health: HealthTile[];
  funnel: {
    steps: FunnelStep[];
    skips: { key: string; label: string; n: number }[];
    skipped: number;
    refused: number;
    paidAny: number;
    actOpen: number;
    payOpen: number;
    machineOnly: number;
  };
  kinds: RateRow[];
  trend: TrendDay[];
  routes: RateRow[];
  placement: {
    latest: PlacementLatest[];
    shares: { key: PlacementKey; label: string; ratio: Ratio }[];
    checks: number;
    any: boolean;
  };
  vsWhatsapp: { email: Side; whatsapp: Side; students: { email: number; whatsapp: number } };
  opens: { by: { key: string; label: string; n: number }[]; machineOnly: number };
  inbound: { key: string; label: string; n: number }[];
  recent: RecentRow[];
}

export interface EmailEnvelope {
  report: EmailReport;
  generatedAt: string;
  env: string;
  ms: number;
  /** the new tables not live here yet */
  waiting: string[];
  /** no email ledger here at all */
  missing: boolean;
}

// ------------------------------------------------------------------ helpers

export const istDay = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** The instant an IST day starts, epoch ms. */
export const dayStart = (day: string): number => Date.parse(`${day}T00:00:00+05:30`);
/** The range's first instant: the start of the IST day `days - 1` before today. */
export const rangeFrom = (now: number, days: number): number => dayStart(addDays(istDay(now), -(Math.max(1, days) - 1)));
/** "15 Nov 09:12", IST. */
export function istText(ms: number): string {
  const d = new Date(ms + IST_MS);
  const mon = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${d.getUTCDate()} ${mon} ${d.toISOString().slice(11, 16)}`;
}
export function parseDays(v: string | null | undefined): RangeDays {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : DEFAULT_DAYS;
}

export function ratio(n: number, of: number): Ratio {
  return { n, of, pct: of > 0 ? Math.round((n / of) * 1000) / 10 : null };
}

/** "j•••@gmail.com": the first letter and the domain, never the rest. */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e ? "•••" : "";
  return `${e[0]}•••${e.slice(at)}`;
}

/** The domain of an address, or of the route's default sender (Azure: hello.studojo.com, Google: studojo.com). */
export function senderDomain(sender: string | null | undefined, route: "acs" | "google"): string {
  const s = (sender ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at >= 0 && at < s.length - 1) return s.slice(at + 1).replace(/>.*$/, "");
  if (s && !s.includes(" ")) return s;
  return route === "google" ? "studojo.com" : "hello.studojo.com";
}
export const ROUTE_LABEL: Record<"acs" | "google", string> = { acs: "Azure", google: "Google Workspace" };

/** The state of a health number against its limits. */
export function stateOf(key: HealthTile["key"], pct: number | null): HealthState {
  if (pct == null) return "empty";
  switch (key) {
    case "delivered":
      return pct < LIMITS.delivered.warnBelow ? "warn" : "good";
    case "bounce":
      return pct > LIMITS.bounce.badAbove ? "bad" : pct > LIMITS.bounce.warnAbove ? "warn" : "good";
    case "unsub":
      return pct > LIMITS.unsub.badAbove ? "bad" : pct > LIMITS.unsub.warnAbove ? "warn" : "good";
    case "primary":
      return pct < LIMITS.primary.warnBelow ? "warn" : "good";
    case "complaint":
      return pct > LIMITS.complaint.badAbove ? "bad" : pct > LIMITS.complaint.warnAbove ? "warn" : "good";
    default:
      return "none";
  }
}

/** Whether a goal step answers the kind's goal. */
export function goalMatches(goal: GoalKey, step: string): boolean {
  switch (goal) {
    case "save_or_outreach":
      return step === "job_saved" || step === "outreach_started";
    case "call":
      return step === "call_started";
    case "replies":
      return step === "desk_opened";
    case "inbox":
      return step === "mailbox_connected";
    default:
      return step === "desk_opened";
  }
}

const byUser = <T extends { user: string }>(xs: T[]): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const a = m.get(x.user);
    if (a) a.push(x);
    else m.set(x.user, [x]);
  }
  return m;
};

const inWindow = (t: number, start: number, len: number) => t >= start - SLACK_MS && t <= start + len;

// ------------------------------------------------------------------ the facts of each email

/**
 * Works out every email's facts. Per signal, the event log wins where the email has a row of it, else the ledger:
 * opens (read_at, meta.opens), clicks (tapped_at, less a reply's touch), replies (the student's own email, put on their
 * latest email from Stu in the 3 days before it), unsubscribes and spam marks (the settings, on their latest delivered
 * email in the 7 days before). Replies and unsubscribes are read from the ledger only for emails sent before the log's
 * first row, so the two never count one reply twice.
 */
export function factsOf(i: EmailInput): RowFacts[] {
  const ev = new Map<number, EventIn[]>();
  for (const e of i.events) {
    const a = ev.get(e.row);
    if (a) a.push(e);
    else ev.set(e.row, [e]);
  }
  const logFrom = i.live.events && i.eventsSince != null ? i.eventsSince : Infinity;
  const repliesOf = byUser(i.replies);
  const goalsOf = byUser(i.goals);
  const paysOf = byUser(i.pays);

  // Ledger-only replies, unsubscribes and spam marks: each on the student's latest email before it.
  const rowsOf = byUser([...i.rows].filter((r) => r.taken).sort((a, b) => a.sentAt - b.sentAt));
  const latestBefore = (user: string, t: number, within: number, deliveredOnly: boolean): EmailRowIn | null => {
    const xs = rowsOf.get(user) ?? [];
    let best: EmailRowIn | null = null;
    for (const r of xs) {
      if (r.sentAt > t) break;
      if (r.sentAt < t - within) continue;
      if (deliveredOnly && (r.bounced || r.failed)) continue;
      best = r;
    }
    return best && best.sentAt < logFrom ? best : null;
  };
  const ledgerReply = new Map<number, number>();
  for (const m of i.replies) {
    const r = latestBefore(m.user, m.at, REPLY_CONTEXT_MS, false);
    if (r && (ledgerReply.get(r.id) ?? Infinity) > m.at) ledgerReply.set(r.id, m.at);
  }
  const ledgerUnsub = new Set<number>();
  const ledgerComplaint = new Set<number>();
  for (const p of i.prefs) {
    if (p.unsubAt != null) {
      const r = latestBefore(p.user, p.unsubAt, UNSUB_CONTEXT_MS, true);
      if (r) ledgerUnsub.add(r.id);
    }
    if (p.complainedAt != null) {
      const r = latestBefore(p.user, p.complainedAt, UNSUB_CONTEXT_MS, true);
      if (r) ledgerComplaint.add(r.id);
    }
  }
  // A retried email: a try the provider refused is "refused" only when no try of the same claim went.
  const wentKeys = new Set(i.rows.filter((r) => r.taken && r.key).map((r) => `${r.user}|${r.key}`));

  return i.rows.map((r) => {
    const es = ev.get(r.id) ?? [];
    const of = (name: string) => es.filter((e) => e.event === name);
    const first = (xs: EventIn[]) => (xs.length ? Math.min(...xs.map((e) => e.first)) : null);
    const internal = i.internal[r.user] ?? null;

    // Opens: the log's, Apple's machine opens apart; else the ledger's first open and count.
    const openEv = of("opened");
    const openBy: Record<string, number> = {};
    let humanOpen: number | null = null;
    let machine = false;
    let opens = 0;
    if (openEv.length) {
      for (const e of openEv) {
        const src = (e.detail ?? "").trim() || "client";
        openBy[src] = (openBy[src] ?? 0) + e.n;
        opens += e.n;
        if (src === "apple_mpp") machine = true;
        else humanOpen = humanOpen == null ? e.first : Math.min(humanOpen, e.first);
      }
    } else if (r.readAt != null) {
      humanOpen = r.readAt;
      opens = Math.max(1, r.opens);
      openBy.ledger = opens;
    }

    // Clicks: the log's taps (with their link codes); else tapped_at unless a reply stamped it.
    const tapEv = of("tapped");
    let click: number | null = first(tapEv);
    const codes = [...new Set(tapEv.map((e) => (e.detail ?? "").trim()).filter(Boolean))];
    if (!tapEv.length && r.tappedAt != null) {
      const touch = (repliesOf.get(r.user) ?? []).some((m) => Math.abs(m.at - r.tappedAt!) <= REPLY_TOUCH_MS);
      if (!touch) click = r.tappedAt;
    }

    const replyEv = of("replied");
    const reply: number | null = replyEv.length ? first(replyEv) : ledgerReply.get(r.id) ?? null;

    const bounced = r.taken && (r.bounced || of("bounced").length > 0 || of("suppressed").length > 0);
    const dropped = r.taken && !bounced && (r.failed || of("failed").length > 0);
    const engagedAt = [humanOpen, click, reply].filter((x): x is number => x != null).reduce<number | null>((a, b) => (a == null ? b : Math.min(a, b)), null);
    const reported = r.deliveredAt != null || of("delivered").length > 0;
    const delivered = r.taken && !bounced && !dropped && (reported || engagedAt != null);
    const pending = r.taken && !delivered && !bounced && !dropped && i.now - r.sentAt < PENDING_MS;
    const opened = delivered && engagedAt != null;
    const clicked = delivered && click != null;
    const replied = delivered && reply != null;

    // Acted: the kind's goal within 48 h of the first open, click or reply. C1's goal is opening the replies: Stu from
    // the email, or a tap on its replies link (the log's code r; with the ledger only, its one link is that one).
    const goal = KIND_GOAL[r.kind];
    let acted = false;
    if (opened && engagedAt != null) {
      acted = (goalsOf.get(r.user) ?? []).some((g) => goalMatches(goal, g.step) && inWindow(g.at, engagedAt, ACT_WINDOW_MS));
      if (!acted && goal === "replies" && click != null && click <= engagedAt + ACT_WINDOW_MS) acted = tapEv.length ? codes.includes("r") : true;
    }
    const actOpen = opened && !acted && engagedAt != null && engagedAt + ACT_WINDOW_MS > i.now;
    const paidAny = opened && engagedAt != null && (paysOf.get(r.user) ?? []).some((p) => inWindow(p.at, engagedAt, PAY_WINDOW_MS));
    const paid = acted && paidAny;
    const payOpen = acted && !paid && engagedAt != null && engagedAt + PAY_WINDOW_MS > i.now;

    const unsubEv = of("unsubscribed");
    const unsub = delivered && (unsubEv.length > 0 || ledgerUnsub.has(r.id));
    const complained = r.taken && (of("complained").length > 0 || ledgerComplaint.has(r.id));
    const sentEv = of("sent").find((e) => e.sender) ?? es.find((e) => e.sender);

    return {
      id: r.id, user: r.user, kind: r.kind, day: r.day, key: r.key, sentAt: r.sentAt,
      student: !r.team && !internal, internal,
      taken: r.taken, refused: !r.taken && !(r.key && wentKeys.has(`${r.user}|${r.key}`)),
      delivered, bounced, dropped, pending,
      opened, machineOnly: delivered && machine && humanOpen == null && click == null && reply == null,
      opens, openBy, clicked, codes, replied, engagedAt, acted, actOpen, paid, paidAny, payOpen, unsub, complained,
      route: r.via, sender: senderDomain(sentEv?.sender ?? null, r.via), to: r.to,
    };
  });
}

export function statusOf(f: RowFacts): StatusKey {
  if (!f.taken) return "refused";
  if (f.bounced) return "bounced";
  if (f.dropped) return "dropped";
  if (f.replied) return "replied";
  if (f.clicked) return "clicked";
  if (f.opened) return "opened";
  if (f.machineOnly) return "machine";
  if (f.delivered) return "delivered";
  return f.pending ? "pending" : "no_report";
}

// ------------------------------------------------------------------ the rates

interface Tally {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  acted: number;
  paid: number;
  unsub: number;
  bounced: number;
  refused: number;
}

function tally(fs: RowFacts[]): Tally {
  const t: Tally = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, acted: 0, paid: 0, unsub: 0, bounced: 0, refused: 0 };
  const claims = new Set<string>();
  for (const f of fs) {
    // A refused email counts once, however many tries its claim had.
    if (f.refused && !claims.has(`${f.user}|${f.key ?? f.id}`)) {
      claims.add(`${f.user}|${f.key ?? f.id}`);
      t.refused++;
    }
    if (!f.taken) continue;
    t.sent++;
    if (f.bounced) t.bounced++;
    if (!f.delivered) continue;
    t.delivered++;
    if (f.opened) t.opened++;
    if (f.clicked) t.clicked++;
    if (f.replied) t.replied++;
    if (f.acted) t.acted++;
    if (f.paid) t.paid++;
    if (f.unsub) t.unsub++;
  }
  return t;
}

function rateRow(key: string, label: string, sub: string, fs: RowFacts[], skipped = 0): RateRow {
  const t = tally(fs);
  return {
    key, label, sub, sent: t.sent,
    delivered: ratio(t.delivered, t.sent),
    open: ratio(t.opened, t.delivered),
    click: ratio(t.clicked, t.delivered),
    cto: ratio(t.clicked, t.opened),
    reply: ratio(t.replied, t.delivered),
    acted: ratio(t.acted, t.delivered),
    unsub: ratio(t.unsub, t.delivered),
    bounce: ratio(t.bounced, t.sent),
    refused: t.refused, skipped,
  };
}

// ------------------------------------------------------------------ the report

export function buildEmail(i: EmailInput): EmailReport {
  const now = i.now;
  const from = rangeFrom(now, i.days);
  const all = factsOf(i);
  const inScope = (f: RowFacts) => i.team || f.student;
  const userIn = (u: string) => i.team || !i.internal[u];
  const cohortAll = all.filter((f) => f.sentAt >= from && f.sentAt <= now);
  const cohort = cohortAll.filter(inScope);
  const t = tally(cohort);

  // Skips: a due email of a day, kind and student not sent. One that went after all (a sent email of the same day, kind
  // and student) is not a skip; a refused try with a skip for it counts once, as the skip.
  const sentDue = new Set(cohort.filter((f) => f.taken).map((f) => `${f.user}|${f.day}|${f.kind}`));
  const skipKeys = new Set<string>();
  const skipCount = new Map<string, number>();
  const skipsByKind = new Map<string, number>();
  if (i.live.skips) {
    for (const s of i.skips) {
      if (s.at < from || s.at > now || !userIn(s.user)) continue;
      const kind = kindOf(s.kind, s.kind);
      const k = `${s.user}|${s.day}|${kind}`;
      if (sentDue.has(k) || skipKeys.has(k)) continue;
      skipKeys.add(k);
      const reason = (s.reason || "other").trim();
      skipCount.set(reason, (skipCount.get(reason) ?? 0) + 1);
      skipsByKind.set(kind, (skipsByKind.get(kind) ?? 0) + 1);
    }
  }
  const refusedKeys = new Set<string>();
  let refused = 0;
  for (const f of cohort) {
    if (!f.refused) continue;
    const k = `${f.user}|${f.day}|${f.kind}`;
    const claim = `${f.user}|${f.key ?? f.id}`;
    if (sentDue.has(k) || skipKeys.has(k) || refusedKeys.has(claim)) continue;
    refusedKeys.add(claim);
    refused++;
  }
  const skipped = [...skipCount.values()].reduce((a, b) => a + b, 0);
  const skips = [...skipCount.entries()].map(([key, n]) => ({ key, label: skipLabel(key), n }));
  if (refused) skips.push({ key: "refused", label: skipLabel("refused"), n: refused });
  skips.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  // The funnel. Clicked and Acted are both shares of Opened (acting does not need a click); Paid is a share of Acted.
  const due = i.live.skips ? t.sent + skipped + refused : null;
  const top = due ?? t.sent;
  const step = (key: StepKey, label: string, n: number | null, base: StepKey | null, baseN: number | null, note: string): FunnelStep => ({
    key, label, n, base,
    ofBase: n != null && baseN != null && baseN > 0 ? ratio(n, baseN).pct : null,
    drop: n != null && baseN != null ? Math.max(0, baseN - n) : null,
    ofTop: n != null && top > 0 ? ratio(n, top).pct : null,
    note,
  });
  const steps: FunnelStep[] = [
    step("due", "Due", due, null, null, i.live.skips ? "sent, skipped or refused" : "waits for the skips table"),
    step("sent", "Sent", t.sent, i.live.skips ? "due" : null, due, "the provider took it"),
    step("delivered", "Delivered", t.delivered, "sent", t.sent, "delivery report, or an open or click proves it"),
    step("opened", "Opened", t.opened, "delivered", t.delivered, "unique; a click or reply counts as an open"),
    step("clicked", "Clicked", t.clicked, "opened", t.opened, "unique link taps"),
    step("acted", "Acted", t.acted, "opened", t.opened, "the kind's goal within 48 h of the open"),
    step("paid", "Paid", t.paid, "acted", t.acted, "real money within 7 days of the open"),
  ];

  // Health.
  const placementsIn = i.placements.filter((p) => p.placement && (p.sentAt ?? p.placedAt ?? 0) >= from && (p.sentAt ?? p.placedAt ?? 0) <= now);
  const primary = ratio(placementsIn.filter((p) => p.placement === "primary").length, placementsIn.length);
  const complained = cohort.filter((f) => f.complained).length;
  const tile = (key: HealthTile["key"], label: string, r: Ratio, rule: string, empty: string | null = null): HealthTile => ({
    key, label, ratio: r, rule, empty,
    state: empty ? "empty" : stateOf(key, r.pct),
    small: r.of > 0 && r.of < SMALL_SAMPLE,
  });
  const health: HealthTile[] = [
    tile("delivered", "Delivered", ratio(t.delivered, t.sent), `warn below ${LIMITS.delivered.warnBelow}%`),
    tile("bounce", "Bounced", ratio(t.bounced, t.sent), `warn above ${LIMITS.bounce.warnAbove}%, bad above ${LIMITS.bounce.badAbove}%`),
    tile("unsub", "Unsubscribed", ratio(t.unsub, t.delivered), `warn above ${LIMITS.unsub.warnAbove}%, bad above ${LIMITS.unsub.badAbove}%`),
    tile("open", "Open rate", ratio(t.opened, t.delivered), `typical ${INDUSTRY.open[0]} to ${INDUSTRY.open[1]}%`),
    tile("click", "Click rate", ratio(t.clicked, t.delivered), `typical ${INDUSTRY.click[0]} to ${INDUSTRY.click[1]}%`),
    tile("cto", "Click to open", ratio(t.clicked, t.opened), "clicks among opens"),
    tile("reply", "Reply rate", ratio(t.replied, t.delivered), "replies among delivered"),
    tile("primary", "Primary inbox", primary, `warn below ${LIMITS.primary.warnBelow}%`, placementsIn.length ? null : "no seed inboxes yet"),
    tile("complaint", "Spam complaints", ratio(complained, t.delivered), `warn above ${LIMITS.complaint.warnAbove}%, Gmail's limit ${INDUSTRY.gmailSpamLimit}%`,
      complained ? null : "only in Google Postmaster"),
  ];

  // By kind (every kind with an email or a skip in range), then by route and sender.
  const kinds: RateRow[] = [];
  for (const k of KINDS) {
    const fs = cohort.filter((f) => f.kind === k.key);
    const sk = skipsByKind.get(k.key) ?? 0;
    if (!fs.length && !sk) continue;
    kinds.push(rateRow(k.key, k.label, GOAL_TEXT[k.goal], fs, sk));
  }
  kinds.sort((a, b) => b.sent - a.sent || b.skipped - a.skipped);
  const routeKeys = new Map<string, RowFacts[]>();
  for (const f of cohort) {
    if (!f.taken) continue;
    const k = `${f.route}|${f.sender}`;
    const a = routeKeys.get(k);
    if (a) a.push(f);
    else routeKeys.set(k, [f]);
  }
  const routes = [...routeKeys.entries()]
    .map(([k, fs]) => {
      const [route, sender] = k.split("|") as ["acs" | "google", string];
      return rateRow(k, ROUTE_LABEL[route], sender, fs);
    })
    .sort((a, b) => b.sent - a.sent);

  // Trend: the last 14 IST days by send time, whatever the range.
  const today = istDay(now);
  const trend: TrendDay[] = [];
  const perDay = new Map<string, TrendDay>();
  for (let k = TREND_DAYS - 1; k >= 0; k--) {
    const day = addDays(today, -k);
    const d = { day, soFar: k === 0, sent: 0, delivered: 0, opened: 0, clicked: 0 };
    trend.push(d);
    perDay.set(day, d);
  }
  for (const f of all) {
    if (!f.taken || f.sentAt > now || !inScope(f)) continue;
    const d = perDay.get(istDay(f.sentAt));
    if (!d) continue;
    d.sent++;
    if (f.delivered) d.delivered++;
    if (f.opened) d.opened++;
    if (f.clicked) d.clicked++;
  }

  // Inbox placement: the latest check of each kind and seed (any time), and the shares over the range.
  const latestMap = new Map<string, PlacementIn>();
  const when = (p: PlacementIn) => p.placedAt ?? p.sentAt ?? 0;
  for (const p of i.placements) {
    const k = `${p.kind}|${p.seed}`;
    const cur = latestMap.get(k);
    if (!cur || when(p) > when(cur) || (when(p) === when(cur) && p.id > cur.id)) latestMap.set(k, p);
  }
  const latest = [...latestMap.values()]
    .map((p) => ({ kind: p.kind, seed: p.seed, via: p.via, sender: p.sender, placement: p.placement, status: p.status, at: p.placedAt ?? p.sentAt }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.seed.localeCompare(b.seed));
  const shares = PLACEMENTS.map((key) => ({ key, label: PLACEMENT_LABEL[key], ratio: ratio(placementsIn.filter((p) => p.placement === key).length, placementsIn.length) }));

  // Email against WhatsApp, students only: delivered, read or opened, tapped (a click or a reply on email; a button or a
  // message on WhatsApp).
  const stu = cohortAll.filter((f) => f.student && f.taken);
  const eDelivered = stu.filter((f) => f.delivered);
  const email: Side = {
    sent: stu.length,
    delivered: ratio(eDelivered.length, stu.length),
    read: ratio(eDelivered.filter((f) => f.opened).length, eDelivered.length),
    tapped: ratio(eDelivered.filter((f) => f.clicked || f.replied).length, eDelivered.length),
  };
  const wa = i.wa.filter((w) => !i.internal[w.user]);
  const sum = (k: keyof Omit<WaUserIn, "user">) => wa.reduce((a, w) => a + w[k], 0);
  const whatsapp: Side = {
    sent: sum("sent"),
    delivered: ratio(sum("delivered"), sum("sent")),
    read: ratio(sum("read"), sum("delivered")),
    tapped: ratio(sum("tapped"), sum("delivered")),
  };

  // How the opens were seen.
  const openBy = new Map<string, number>();
  for (const f of cohort) for (const [k, n] of Object.entries(f.openBy)) openBy.set(k, (openBy.get(k) ?? 0) + n);
  const order: string[] = [...OPEN_SOURCES, "ledger"];
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const opensBy = [...openBy.entries()]
    .map(([key, n]) => ({ key, label: OPEN_SOURCE_LABEL[key] ?? key, n }))
    .sort((a, b) => rank(a.key) - rank(b.key) || b.n - a.n);
  const machineOnly = cohort.filter((f) => f.machineOnly).length;

  const recent: RecentRow[] = all
    .filter((f) => inScope(f) && f.sentAt <= now)
    .sort((a, b) => b.sentAt - a.sentAt || b.id - a.id)
    .slice(0, RECENT_ROWS)
    .map((f) => ({
      id: f.id, to: f.to, kind: f.kind, sentAt: f.sentAt, route: f.route, delivered: f.delivered, opens: f.opens, opened: f.opened,
      clicked: f.clicked, replied: f.replied, unsub: f.unsub, status: statusOf(f), internal: f.internal, team: !f.student && !f.internal,
    }));

  return {
    now, days: i.days, from, team: i.team, live: i.live,
    leftOut: i.team ? 0 : cohortAll.length - cohort.length,
    health,
    funnel: {
      steps, skips, skipped, refused, paidAny: cohort.filter((f) => f.paidAny).length,
      actOpen: cohort.filter((f) => f.actOpen).length, payOpen: cohort.filter((f) => f.payOpen).length, machineOnly,
    },
    kinds, trend, routes,
    placement: { latest, shares, checks: placementsIn.length, any: i.placements.length > 0 },
    vsWhatsapp: { email, whatsapp, students: { email: new Set(stu.map((f) => f.user)).size, whatsapp: wa.filter((w) => w.sent > 0).length } },
    opens: { by: opensBy, machineOnly },
    inbound: [...i.inbound].filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) => ({ key: x.outcome, label: inboundLabel(x.outcome), n: x.n })),
    recent,
  };
}
