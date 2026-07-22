/**
 * B2B GTM Motion tracker — shared vocabulary, types and follow-up rules.
 *
 * Core principle: no terminal states. A won deal is a baseline to grow, a lost
 * deal is a feedback obligation with a comeback date. Every company always has
 * a next action.
 *
 * All scheduling here is deterministic. No model calls.
 */

export type Temperature = "hot" | "warm" | "neutral" | "cold";

export const TEMPERATURES: Temperature[] = ["hot", "warm", "neutral", "cold"];

/** Verbatim from the Excel sheet. */
export type Status = "accepted" | "declined" | "awaiting_response";

export const STATUSES: Status[] = ["accepted", "declined", "awaiting_response"];

export type Stage =
  // Pre-GTM: tracked on the maintenance sheet, before a WhatsApp group exists.
  | "cold_call_done"
  | "demo_scheduled"
  | "leads_sent"
  // GTM open
  | "whatsapp_group"
  | "gtm_active"
  | "negotiating"
  // Blocked-but-warm: the product won, the circumstance did not.
  | "blocked_pricing"
  | "blocked_timing"
  | "blocked_approval"
  | "blocked_budget"
  // Silence, not an objection: they owe us a reply or a meeting.
  | "blocked_no_response"
  | "blocked_no_show"
  | "blocked_no_show_ghosted"
  // Won -> expansion. repeat_buyer loops back to renewal_due each cycle.
  | "closed_won"
  | "onboarding"
  | "using"
  | "renewal_due"
  | "expansion_pitch"
  | "repeat_buyer"
  // Lost -> feedback loop. comeback_scheduled re-enters gtm_active.
  | "closed_lost"
  | "feedback_pending"
  | "comeback_scheduled";

export const PRE_GTM_STAGES: Stage[] = ["cold_call_done", "demo_scheduled", "leads_sent"];
export const OPEN_STAGES: Stage[] = ["whatsapp_group", "gtm_active", "negotiating"];
export const BLOCKED_STAGES: Stage[] = [
  "blocked_pricing",
  "blocked_timing",
  "blocked_approval",
  "blocked_budget",
  "blocked_no_response",
  "blocked_no_show",
  "blocked_no_show_ghosted",
];
export const WON_STAGES: Stage[] = [
  "closed_won",
  "onboarding",
  "using",
  "renewal_due",
  "expansion_pitch",
  "repeat_buyer",
];
export const LOST_STAGES: Stage[] = ["closed_lost", "feedback_pending", "comeback_scheduled"];

export const ALL_STAGES: Stage[] = [
  ...PRE_GTM_STAGES,
  ...OPEN_STAGES,
  ...BLOCKED_STAGES,
  ...WON_STAGES,
  ...LOST_STAGES,
];

export const STAGE_LABELS: Record<Stage, string> = {
  cold_call_done: "Cold call done",
  demo_scheduled: "Demo scheduled",
  leads_sent: "Leads sent",
  whatsapp_group: "WhatsApp group",
  gtm_active: "GTM active",
  negotiating: "Negotiating",
  blocked_pricing: "Blocked: pricing",
  blocked_timing: "Blocked: timing",
  blocked_approval: "Blocked: approval",
  blocked_budget: "Blocked: budget",
  blocked_no_response: "Didn't get back to us",
  blocked_no_show: "Didn't join the meeting",
  blocked_no_show_ghosted: "No-showed, never came back",
  closed_won: "Closed won",
  onboarding: "Onboarding",
  using: "Using",
  renewal_due: "Renewal due",
  expansion_pitch: "Expansion pitch",
  repeat_buyer: "Repeat buyer",
  closed_lost: "Closed lost",
  feedback_pending: "Feedback pending",
  comeback_scheduled: "Comeback scheduled",
};

export type Objection =
  | "pricing"
  | "no_budget"
  | "competitor"
  | "timing"
  | "not_in_space"
  | "needs_approval"
  | "tool_fit"
  | "other";

export const OBJECTIONS: Objection[] = [
  "pricing",
  "no_budget",
  "competitor",
  "timing",
  "not_in_space",
  "needs_approval",
  "tool_fit",
  "other",
];

export const OBJECTION_LABELS: Record<Objection, string> = {
  pricing: "Pricing",
  no_budget: "No budget",
  competitor: "Using a competitor",
  timing: "Timing / team busy",
  not_in_space: "Not in this space",
  needs_approval: "Needs internal approval",
  tool_fit: "Tool doesn't fit",
  other: "Other",
};

export type LostReason =
  | "no_budget"
  | "competitor_contract"
  | "not_in_space"
  | "tool_gap"
  | "went_silent"
  | "other";

export const LOST_REASONS: LostReason[] = [
  "no_budget",
  "competitor_contract",
  "not_in_space",
  "tool_gap",
  "went_silent",
  "other",
];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  no_budget: "No budget",
  competitor_contract: "Locked into a competitor contract",
  not_in_space: "Not venturing into this space",
  tool_gap: "Tool was missing something",
  went_silent: "Went silent",
  other: "Other",
};

export type BlockerType =
  | "pricing"
  | "timing"
  | "approval"
  | "budget"
  | "no_response"
  | "no_show"
  | "no_show_ghosted";

export const BLOCKER_TYPES: BlockerType[] = [
  "pricing",
  "timing",
  "approval",
  "budget",
  "no_response",
  "no_show",
  "no_show_ghosted",
];

export const BLOCKER_LABELS: Record<BlockerType, string> = {
  pricing: "Pricing",
  timing: "Timing",
  approval: "Approval",
  budget: "Budget",
  no_response: "Didn't get back to us",
  no_show: "Didn't join the meeting",
  no_show_ghosted: "No-showed, never came back",
};

export const BLOCKER_STAGE: Record<BlockerType, Stage> = {
  pricing: "blocked_pricing",
  timing: "blocked_timing",
  approval: "blocked_approval",
  budget: "blocked_budget",
  no_response: "blocked_no_response",
  no_show: "blocked_no_show",
  no_show_ghosted: "blocked_no_show_ghosted",
};

export type Outcome =
  | "interested"
  | "neutral"
  | "not_interested"
  | "asked_callback"
  | "blocked"
  | "closed_won"
  | "closed_lost";

export const OUTCOMES: Outcome[] = [
  "interested",
  "neutral",
  "not_interested",
  "asked_callback",
  "blocked",
  "closed_won",
  "closed_lost",
];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  interested: "Interested",
  neutral: "Neutral / non-committal",
  not_interested: "Not interested",
  asked_callback: "Asked to call back",
  blocked: "Likes it, but blocked",
  closed_won: "Closed — they're buying",
  closed_lost: "Closed — they said no",
};

/** An objection is mandatory on these outcomes. This is what makes the objection stats real. */
export function objectionRequired(outcome: Outcome): boolean {
  return outcome === "neutral" || outcome === "not_interested";
}

/**
 * "Other" with no detail is worse than useless — it reports a count of things
 * nobody can act on. If you pick it, you say what it was.
 */
export function objectionNeedsNote(o: Objection | null): boolean {
  return o === "other";
}

export function lostReasonNeedsNote(r: LostReason | null): boolean {
  return r === "other" || r === "tool_gap";
}

export interface Company {
  id: number;
  name: string;
  stage: Stage;
  temperature: Temperature | null;
  status: Status | null;
  owner: string | null;
  whatsapp_group_made: boolean;
  needs_brochure: boolean;
  brochure_note: string | null;
  /**
   * Someone else owns this, but I still need to chase it — a buy decision, a
   * warm lead gone quiet. Independent of `owner`: setting it reassigns nothing,
   * so the company stays on their sheet AND shows up on mine.
   */
  needs_my_followup: boolean;
  my_followup_note: string | null;
  /** They want leads they haven't been sent yet. */
  needs_leads: boolean;
  leads_note: string | null;
  /** They have leads, but the wrong ones — spec needs changing. */
  leads_change: boolean;
  leads_change_note: string | null;
  next_action_at: string | null;
  next_action_reason: string | null;
  they_reachout_on: string | null;
  deal_value: string | null;
  next_purchase_due: string | null;
  blocker_type: BlockerType | null;
  blocker_note: string | null;
  lost_reason: LostReason | null;
  lost_feedback: string | null;
  comeback_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts?: Contact[];
  last_log?: CallLog | null;
}

export interface Contact {
  id: number;
  company_id: number;
  name: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  /** They left the company or handed us on. Kept for history, never called again. */
  is_inactive?: boolean;
  left_note?: string | null;
}

/**
 * What kind of event a log row records.
 *
 * - `call`: a phone call, with an outcome.
 * - `meet`: a Google Meet. Same outcome questions as a call, but there's no
 *   "did they pick up" — it either happened or they no-showed.
 * - `contact_change`: the person moved on. NOT an interest signal — it says
 *   nothing about whether the company wants BOB, which is why it's not an
 *   `outcome`.
 * - `note`: something they said, feedback, or an action for us. Dated, never
 *   overwritten. The accumulation of these IS the context.
 */
export type LogKind = "call" | "meet" | "contact_change" | "note" | "handoff";

/**
 * How the check-in starts. A Meet has no pick-up question, so this replaces
 * the old yes/no rather than nesting under it.
 */
export type ContactMethod = "call" | "meet" | "no_answer" | "no_show";

export const CONTACT_METHODS: { key: ContactMethod; label: string }[] = [
  { key: "call", label: "Phone call" },
  { key: "meet", label: "Google Meet" },
  { key: "no_answer", label: "No answer" },
  { key: "no_show", label: "Meet no-show" },
];

/** Did we actually speak to them? Drives whether the outcome questions show. */
export function methodReachedThem(m: ContactMethod): boolean {
  return m === "call" || m === "meet";
}

export function methodToKind(m: ContactMethod): LogKind {
  return m === "meet" || m === "no_show" ? "meet" : "call";
}

export interface CallLog {
  id: number;
  company_id: number;
  contact_id: number | null;
  called_at: string;
  kind: LogKind;
  /** For a call: they answered. For a meet: it went ahead (false = no-show). */
  picked_up: boolean;
  /** Who turned up from their side. Meets often pull in more people than a call. */
  attendees: string | null;
  outcome: Outcome | null;
  objection: Objection | null;
  /** What they actually said. Required when the objection is "other". */
  objection_note: string | null;
  temperature_at_time: Temperature | null;
  note: string | null;
  next_action_at: string | null;
  value_discussed: string | null;
  logged_by: string | null;
  created_at: string;
  contact_name?: string | null;
}

/* ------------------------------------------------------------------ */
/* Follow-up rules — plain arithmetic, no model                        */
/* ------------------------------------------------------------------ */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function addMinutes(from: Date, n: number): Date {
  return new Date(from.getTime() + n * MINUTE);
}

export function addHours(from: Date, n: number): Date {
  return new Date(from.getTime() + n * HOUR);
}

export function addDays(from: Date, n: number): Date {
  return new Date(from.getTime() + n * DAY);
}

export interface Suggestion {
  at: Date;
  reason: string;
}

/**
 * Suggest the next touch. Always overridable by the user — this only pre-fills.
 */
export function suggestNextAction(input: {
  pickedUp: boolean;
  method?: ContactMethod | null;
  outcome?: Outcome | null;
  blockerType?: BlockerType | null;
  temperature?: Temperature | null;
  lostReason?: LostReason | null;
  competitorExpiry?: Date | null;
  nextPurchaseDue?: Date | null;
  stage?: Stage | null;
  now?: Date;
}): Suggestion {
  const now = input.now ?? new Date();

  if (!input.pickedUp) {
    // A no-show is a stronger signal than a missed call: they committed to a
    // time and didn't come. Chase it sooner, and say what it was.
    if (input.method === "no_show") {
      return { at: addDays(now, 1), reason: "No-showed the meet — reschedule" };
    }
    return { at: addDays(now, 1), reason: "No answer — retry tomorrow" };
  }

  switch (input.outcome) {
    case "asked_callback":
      return { at: addMinutes(now, 30), reason: "They asked for a callback shortly" };

    case "blocked":
      // Silence needs chasing sooner than an objection does: the trail goes
      // cold, and each of these is a different kind of quiet.
      if (input.blockerType === "no_response") {
        return { at: addDays(now, 3), reason: "No reply yet — chase them" };
      }
      if (input.blockerType === "no_show") {
        return { at: addDays(now, 1), reason: "Missed the meeting — rebook it" };
      }
      if (input.blockerType === "no_show_ghosted") {
        return { at: addDays(now, 7), reason: "No-showed and went quiet — last try" };
      }
      return { at: addDays(now, 14), reason: "Chase the blocker" };

    case "closed_won":
      return { at: addDays(now, 3), reason: "Onboarding check — make sure they start using it" };

    case "closed_lost": {
      if (input.lostReason === "competitor_contract" && input.competitorExpiry) {
        return {
          at: input.competitorExpiry,
          reason: "Their competitor contract expires — the window reopens",
        };
      }
      if (input.lostReason === "no_budget") {
        return { at: addDays(now, 90), reason: "No budget now — revisit next cycle" };
      }
      return { at: addDays(now, 7), reason: "Get feedback on why this was a no" };
    }

    case "not_interested":
      return { at: addDays(now, 30), reason: "Not interested — revisit and gather feedback" };

    case "neutral":
      return { at: addDays(now, 14), reason: "Non-committal — keep warm" };

    case "interested":
      break;

    default:
      break;
  }

  // Won-stage cadence: these accounts are never done.
  if (input.stage && WON_STAGES.includes(input.stage)) {
    if (input.stage === "renewal_due" || input.stage === "expansion_pitch") {
      if (input.nextPurchaseDue) {
        return {
          at: addDays(input.nextPurchaseDue, -7),
          reason: "Renewal approaching — pitch the next cycle",
        };
      }
    }
    if (input.stage === "onboarding") {
      return { at: addDays(now, 3), reason: "Onboarding check" };
    }
    return { at: addDays(now, 30), reason: "Expansion check — can this account grow?" };
  }

  switch (input.temperature) {
    case "hot":
      return { at: addDays(now, 3), reason: "Hot lead — keep the momentum" };
    case "warm":
      return { at: addDays(now, 7), reason: "Warm lead — steady follow-up" };
    case "neutral":
      return { at: addDays(now, 14), reason: "Neutral — check back in" };
    case "cold":
      return { at: addDays(now, 30), reason: "Cold — long-cycle nurture" };
    default:
      return { at: addDays(now, 7), reason: "Follow up" };
  }
}

/**
 * The stage a call outcome moves a company into. Returns null to leave it alone.
 */
export function stageForOutcome(
  outcome: Outcome,
  current: Stage,
  blockerType?: BlockerType | null
): Stage | null {
  switch (outcome) {
    case "closed_won":
      return "onboarding";
    case "closed_lost":
      return "feedback_pending";
    case "blocked":
      return blockerType ? BLOCKER_STAGE[blockerType] : null;
    case "interested":
      // Don't drag a won account backwards into the open pipeline.
      if (WON_STAGES.includes(current)) return null;
      if (current === "whatsapp_group") return "gtm_active";
      return null;
    default:
      return null;
  }
}

/**
 * The team. Owner is stored as a plain string, so these are buttons rather than
 * free text — typing a name slightly differently would split the Team view.
 * Blank owner means it's yours.
 */
export const TEAM = ["Vivaan", "Jeremy", "Hegde", "Ayushi"] as const;

/**
 * The handoff pipeline, in order:
 *   Vivaan cold-calls → Me (warm, no-response, buy-decision follow-ups)
 *   → Jeremy or Hegde → Ayushi closes.
 *
 * Order is advisory, never enforced: you can hand a company to anyone. It only
 * drives the suggested next owner and the order of the team tabs.
 * "" means me — an unowned company is mine.
 */
export const PIPELINE: { owner: string; label: string; does: string }[] = [
  { owner: "Vivaan", label: "Vivaan", does: "Cold calls" },
  { owner: "", label: "Me", does: "Warm, no-response, buy decisions" },
  { owner: "Jeremy", label: "Jeremy", does: "Works the deal" },
  { owner: "Hegde", label: "Hegde", does: "Works the deal" },
  { owner: "Ayushi", label: "Ayushi", does: "Closes" },
];

/** Who normally comes next. Advisory only. */
export function nextInPipeline(owner: string | null): string | null {
  const i = PIPELINE.findIndex((p) => p.owner === (owner ?? ""));
  if (i === -1 || i === PIPELINE.length - 1) return null;
  return PIPELINE[i + 1].owner;
}

export function ownerLabel(owner: string | null | undefined): string {
  return owner && owner.trim() ? owner : "Me";
}

/** An account that has gone quiet this long needs attention regardless of its next action. */
export const STALE_ACCOUNT_DAYS = 45;

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

/** Already slipped: the moment has passed. */
export function isOverdue(nextActionAt: string | null, now: Date = new Date()): boolean {
  if (!nextActionAt) return false;
  return new Date(nextActionAt).getTime() <= now.getTime();
}

/**
 * Scheduled for today but not yet reached — a 3pm callback seen at 9am.
 * These must show all day: you plan the day when you open the dashboard, not
 * at the exact minute each call falls due.
 */
export function isLaterToday(nextActionAt: string | null, now: Date = new Date()): boolean {
  if (!nextActionAt) return false;
  const d = new Date(nextActionAt);
  return d.getTime() > now.getTime() && isSameCalendarDay(d, now);
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** On today's list: anything overdue, plus everything else scheduled today. */
export function isOnTodaysList(nextActionAt: string | null, now: Date = new Date()): boolean {
  return isOverdue(nextActionAt, now) || isLaterToday(nextActionAt, now);
}

export const LOOKAHEAD_DAYS = 7;

/** Coming up in the next `days` days, after today. */
export function isUpcoming(
  nextActionAt: string | null,
  now: Date = new Date(),
  days = LOOKAHEAD_DAYS
): boolean {
  if (!nextActionAt) return false;
  const d = new Date(nextActionAt);
  if (isOnTodaysList(nextActionAt, now)) return false;
  const horizon = new Date(now.getTime() + days * DAY);
  return d.getTime() > now.getTime() && d.getTime() <= horizon.getTime();
}

export type ViewKey =
  | "overview"
  | "today"
  | "pre_gtm"
  | "working"
  | "blocked"
  | "accounts"
  | "feedback"
  | "my_followups";

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "today", label: "Today" },
  { key: "my_followups", label: "My follow-ups" },
  { key: "pre_gtm", label: "Pre-GTM" },
  { key: "working", label: "Working" },
  { key: "blocked", label: "Blocked" },
  { key: "accounts", label: "Accounts (Won)" },
  { key: "feedback", label: "Feedback Loop" },
];

/** One sheet per person, in pipeline order. `owner: ""` is mine. */
export const TEAM_VIEWS = PIPELINE.map((p) => ({
  key: `owner:${p.owner}` as const,
  label: p.label,
  owner: p.owner,
  does: p.does,
}));

export function matchesOwnerView(c: Company, owner: string): boolean {
  return (c.owner ?? "").trim() === owner;
}

export function companyMatchesView(c: Company, view: ViewKey, now: Date = new Date()): boolean {
  switch (view) {
    case "overview":
      return true;
    case "today":
      return isOnTodaysList(c.next_action_at, now) || isUpcoming(c.next_action_at, now);
    case "pre_gtm":
      return !c.whatsapp_group_made && PRE_GTM_STAGES.includes(c.stage);
    // Everything actively in play, including companies sitting at whatsapp_group
    // (that stage no longer has its own tab, so it must land somewhere).
    case "working":
      return OPEN_STAGES.includes(c.stage);
    case "blocked":
      return BLOCKED_STAGES.includes(c.stage);
    case "accounts":
      return WON_STAGES.includes(c.stage);
    case "feedback":
      return LOST_STAGES.includes(c.stage);
    case "my_followups":
      return c.needs_my_followup;
    default:
      return true;
  }
}

/**
 * Things we owe them. Defined once so a flag can't be added to the form but
 * forgotten in the row, the counts or the filters.
 */
export interface FlagDef {
  key: "needs_brochure" | "needs_leads" | "leads_change";
  noteKey: "brochure_note" | "leads_note" | "leads_change_note";
  label: string;
  short: string;
  dot: string;
  badge: string;
  placeholder: string;
}

export const FLAGS: FlagDef[] = [
  {
    key: "needs_brochure",
    noteKey: "brochure_note",
    label: "Needs a brochure",
    short: "Brochure",
    dot: "bg-yellow-500",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    placeholder: "What should the brochure cover?",
  },
  {
    key: "needs_leads",
    noteKey: "leads_note",
    label: "Needs leads",
    short: "Leads",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    placeholder: "What leads do they want?",
  },
  {
    key: "leads_change",
    noteKey: "leads_change_note",
    label: "Leads need changing",
    short: "Fix leads",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    placeholder: "What's wrong with the leads we sent?",
  },
];

export function activeFlags(c: Company): FlagDef[] {
  return FLAGS.filter((f) => c[f.key]);
}

export function formatValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
