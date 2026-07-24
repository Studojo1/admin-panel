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
  // Closing: post-demo, chasing the signature / payment / final yes. Ayushi's.
  | "closing"
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
  | "comeback_scheduled"
  // Parked out of the active pipeline. NOT terminal: an exited company can be
  // brought back to gtm_active any time. Distinct from closed_lost, which is a
  // deal we pitched and lost; exited is "not worth chasing right now".
  | "exited";

export const PRE_GTM_STAGES: Stage[] = ["cold_call_done", "demo_scheduled", "leads_sent"];
export const OPEN_STAGES: Stage[] = ["whatsapp_group", "gtm_active", "negotiating", "closing"];
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
export const EXITED_STAGES: Stage[] = ["exited"];

export const ALL_STAGES: Stage[] = [
  ...PRE_GTM_STAGES,
  ...OPEN_STAGES,
  ...BLOCKED_STAGES,
  ...WON_STAGES,
  ...LOST_STAGES,
  ...EXITED_STAGES,
];

export const STAGE_LABELS: Record<Stage, string> = {
  cold_call_done: "Cold call done",
  demo_scheduled: "Demo scheduled",
  leads_sent: "Leads sent",
  whatsapp_group: "WhatsApp group",
  gtm_active: "GTM active",
  negotiating: "Negotiating",
  closing: "Closing",
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
  exited: "Exited pipeline",
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

/**
 * Why a company was pulled out of the active pipeline. Distinct from LostReason:
 * exiting is "not worth our time chasing right now", not "we pitched and lost".
 * Stored in the same lost_reason/lost_feedback columns (no schema change), but
 * with its own vocabulary and its own required-detail rule.
 */
export type ExitReason =
  | "not_interested"
  | "not_in_space"
  | "no_response"
  | "too_small"
  | "bad_fit"
  | "other";

export const EXIT_REASONS: ExitReason[] = [
  "not_interested",
  "not_in_space",
  "no_response",
  "too_small",
  "bad_fit",
  "other",
];

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  not_interested: "Not interested",
  not_in_space: "Not in this space",
  no_response: "Never responded",
  too_small: "Too small to be worth it",
  bad_fit: "Not a fit for BOB",
  other: "Other",
};

export function exitReasonNeedsNote(r: ExitReason | null): boolean {
  return r === "other" || r === "bad_fit";
}

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
  /** Cash reality — distinct from deal_value (committed). Net = collected - refunded. */
  cash_collected: string | null;
  deposit: string | null;
  collected_at: string | null;
  refunded: string | null;
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
export type ContactMethod = "call" | "whatsapp" | "meet" | "no_answer" | "no_show";

export const CONTACT_METHODS: { key: ContactMethod; label: string }[] = [
  { key: "call", label: "Phone call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "meet", label: "Google Meet" },
  { key: "no_answer", label: "No answer" },
  { key: "no_show", label: "Meet no-show" },
];

/**
 * Did we actually get a response? Drives whether the outcome questions show.
 * WhatsApp counts — a reply is a real exchange with a read on interest.
 */
export function methodReachedThem(m: ContactMethod): boolean {
  return m === "call" || m === "meet" || m === "whatsapp";
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
 * The stage a call outcome suggests moving a company into. Returns null to leave
 * it where it is. This is a SUGGESTION — the UI pre-selects it and the user
 * confirms with one tap; it is never applied silently.
 *
 * `owner` matters: an "interested" result while the deal is being worked by
 * Jeremy/Hegde/Ayushi means the buy decision is progressing (-> negotiating),
 * whereas the same result on my own warm lead just keeps it active.
 */
export function stageForOutcome(
  outcome: Outcome,
  current: Stage,
  blockerType?: BlockerType | null,
  owner?: string | null
): Stage | null {
  switch (outcome) {
    case "closed_won":
      // Already in the won loop: don't reset a using/renewal account to onboarding.
      if (WON_STAGES.includes(current)) return null;
      return "onboarding";

    case "closed_lost":
      return "feedback_pending";

    case "blocked":
      return blockerType ? BLOCKER_STAGE[blockerType] : null;

    case "interested": {
      // Never drag a won account backwards into the open pipeline.
      if (WON_STAGES.includes(current)) return null;
      // In someone's hands for the buy decision -> the deal is progressing.
      // Don't regress out of closing back into negotiating.
      if ((owner ?? "").trim() && current !== "negotiating" && current !== "closing") {
        return "negotiating";
      }
      // My own early-stage lead warming up -> into the open pipeline.
      if (PRE_GTM_STAGES.includes(current) || current === "whatsapp_group") return "gtm_active";
      return null;
    }

    case "asked_callback":
      // A callback request doesn't itself move the deal — don't regress a stage
      // just because they asked us to ring back.
      return null;

    case "neutral":
      // Non-committal but engaged: bring a brand-new lead into the open pipeline,
      // otherwise leave it. Never regress.
      if (PRE_GTM_STAGES.includes(current) || current === "whatsapp_group") return "gtm_active";
      return null;

    case "not_interested":
      // A soft "no" doesn't auto-exit or auto-lose — the user decides that
      // explicitly (Exit or Closed-lost). Leave the stage, let temperature/cadence
      // reflect the cooling.
      return null;

    default:
      return null;
  }
}

/**
 * The temperature a call outcome suggests. Pre-fills the temperature control;
 * always overridable. Returns null to leave the current reading alone.
 */
export function temperatureForOutcome(outcome: Outcome | null): Temperature | null {
  switch (outcome) {
    case "closed_won":
    case "interested":
      return "hot";
    case "blocked":
      // They like it, something external is in the way — still warm.
      return "warm";
    case "neutral":
      return "neutral";
    case "not_interested":
    case "closed_lost":
      return "cold";
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

/* ------------------------------------------------------------------ */
/* The relay — a company flows down one owner's page to the next        */
/* ------------------------------------------------------------------ */

/**
 * The pipeline as an explicit relay of roles. A company lives on exactly one
 * person's page at a time — its owner's — and advancing it hands it to the next.
 *
 *   Vivaan (Pre-GTM: cold-call, qualify, make the group)
 *     → Me (force a buy decision, or exit; ALL pre-demo chasing is mine)
 *     → Jeremy / Hegde (run the demo, work the deal)
 *     → Ayushi (closing + ALL post-demo follow-ups: chase the signature/payment,
 *               "why aren't you responding")
 *
 * Locked with the user: pre-demo first-response chasing is mine; once a demo has
 * happened, follow-ups and closing are Ayushi's.
 */
export type Role = "Vivaan" | "Me" | "Deal" | "Ayushi";

/**
 * URL slug ↔ owner string, for the per-person pages (/b2b-gtm/team/:who).
 * "me" maps to the empty owner. Case-insensitive on the way in.
 */
export const TEAM_SLUGS: { slug: string; owner: string; label: string }[] = [
  { slug: "vivaan", owner: "Vivaan", label: "Vivaan" },
  { slug: "me", owner: "", label: "Me" },
  { slug: "jeremy", owner: "Jeremy", label: "Jeremy" },
  { slug: "hegde", owner: "Hegde", label: "Hegde" },
  { slug: "ayushi", owner: "Ayushi", label: "Ayushi" },
];

/** Resolve a URL slug to an owner string. Returns null for an unknown slug. */
export function ownerForSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  const m = TEAM_SLUGS.find((t) => t.slug === slug.toLowerCase());
  return m ? m.owner : null;
}

/** The slug for an owner string ("" = me → "me"). */
export function slugForOwner(owner: string | null | undefined): string {
  const o = (owner ?? "").trim();
  return TEAM_SLUGS.find((t) => t.owner === o)?.slug ?? "me";
}

export const ROLES: { role: Role; owners: string[]; label: string; does: string }[] = [
  { role: "Vivaan", owners: ["Vivaan"], label: "Vivaan", does: "Cold calls & qualifies" },
  { role: "Me", owners: [""], label: "Me", does: "Force a decision or exit" },
  { role: "Deal", owners: ["Jeremy", "Hegde"], label: "Jeremy / Hegde", does: "Demo & work the deal" },
  { role: "Ayushi", owners: ["Ayushi"], label: "Ayushi", does: "Closing & all follow-ups" },
];

/**
 * A demo counts as "happened" once the deal is being worked by Jeremy/Hegde or
 * the company has reached negotiating/closing. Post that point, follow-ups route
 * to Ayushi; before it, chasing is mine. (Kept as a stage/owner heuristic so it
 * needs no extra column; a logged `meet` also moves the stage, so this tracks.)
 */
export function demoHasHappened(c: Company): boolean {
  return (
    c.stage === "negotiating" ||
    c.stage === "closing" ||
    ["Jeremy", "Hegde"].includes((c.owner ?? "").trim())
  );
}

/** Whose page a company currently belongs on — derived from owner, not stored twice. */
export function roleForCompany(c: Company): Role {
  const owner = (c.owner ?? "").trim();
  if (owner === "Vivaan") return "Vivaan";
  if (owner === "Jeremy" || owner === "Hegde") return "Deal";
  if (owner === "Ayushi") return "Ayushi";
  return "Me";
}

/**
 * The suggested next relay move for a company: the owner it should hand to and
 * why. Advisory — surfaced as a one-tap "advance" the user confirms, never
 * automatic. Returns null when there's no obvious next hand (e.g. it's already
 * with Ayushi, or it's parked/won/lost).
 */
export function nextRelayStep(c: Company): { owner: string; stage: Stage; reason: string } | null {
  if (
    EXITED_STAGES.includes(c.stage) ||
    WON_STAGES.includes(c.stage) ||
    LOST_STAGES.includes(c.stage)
  ) {
    return null;
  }
  const role = roleForCompany(c);
  switch (role) {
    case "Vivaan":
      // Qualified → hand to me to force the decision.
      return { owner: "", stage: "gtm_active", reason: "Qualified — over to me to push or exit" };
    case "Me":
      // I push it into the deal team for the demo.
      return { owner: "Jeremy", stage: "negotiating", reason: "Push to buy decision — demo it" };
    case "Deal":
      // After the demo, closing + follow-ups are Ayushi's.
      return { owner: "Ayushi", stage: "closing", reason: "Demo done — Ayushi to close & follow up" };
    case "Ayushi":
      // End of the relay — she closes it won, or it exits/loses. No further hand.
      return null;
  }
}

/**
 * Who a follow-up ("why aren't they responding/paying") should sit with.
 * Pre-demo that's me; post-demo it's Ayushi. Used to route the needs-follow-up
 * flag to the right person's page.
 */
export function followupOwnerFor(c: Company): string {
  return demoHasHappened(c) ? "Ayushi" : "";
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
  | "my_followups"
  | "exit";

/**
 * The main tab strip. `exit` is deliberately NOT in this list — it's rendered
 * separately, tucked in the corner of the tab strip, so parked companies stay
 * out of the way of the day-to-day work.
 */
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
  const exited = EXITED_STAGES.includes(c.stage);
  switch (view) {
    case "exit":
      return exited;
    // Every active view hides exited (parked) companies — they only live on the
    // Exit tab until they're brought back.
    case "overview":
      return !exited;
    case "today":
      return !exited && (isOnTodaysList(c.next_action_at, now) || isUpcoming(c.next_action_at, now));
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
      return !exited && c.needs_my_followup;
    default:
      return !exited;
  }
}

/* ------------------------------------------------------------------ */
/* "Working" sub-buckets — what to actually do with an active company  */
/* ------------------------------------------------------------------ */

export type WorkingBucket = "needs_decision" | "in_buy_decision" | "stale";

export const WORKING_BUCKETS: { key: WorkingBucket; label: string }[] = [
  { key: "needs_decision", label: "Needs a decision" },
  { key: "in_buy_decision", label: "In buy decision" },
  { key: "stale", label: "Stale" },
];

/**
 * Which working sub-bucket a company falls in. Only meaningful for companies
 * that already pass the "working" view filter.
 *
 * - in_buy_decision: handed off (owned by someone) and/or negotiating.
 * - stale: nobody's touched it in STALE_ACCOUNT_DAYS.
 * - needs_decision: mine, active, waiting on me to push it or exit it.
 */
export function workingBucket(c: Company, now: Date = new Date()): WorkingBucket {
  const owned = (c.owner ?? "").trim() !== "";
  if (owned || c.stage === "negotiating") return "in_buy_decision";
  const since = daysSince(c.updated_at, now);
  if (since !== null && since >= STALE_ACCOUNT_DAYS) return "stale";
  return "needs_decision";
}

/* ------------------------------------------------------------------ */
/* The open-company MCQ — which questions to ask, driven by stage       */
/* ------------------------------------------------------------------ */

/**
 * The guided flow shown when a company is opened. The branch is chosen from
 * where the company IS, so we never ask an irrelevant question — a cold Pre-GTM
 * lead is never asked "what should we send them" or for a fine next-action plan.
 *
 * Pure and deterministic: no model, just the stage.
 */
export type McqBranch =
  | "pre_gtm" // Vivaan's early lead: hand to me / log a cold-call outcome / exit
  | "mine_active" // my warm lead: push to buy decision / log a call / exit
  | "buy_decision" // Jeremy/Hegde/Ayushi working it: log a demo/call outcome
  | "blocked" // chase / still blocked / exit
  | "account" // won: expansion cadence only
  | "feedback" // lost, in the feedback loop: log feedback / schedule comeback
  | "exited"; // parked: bring back / leave parked

export function mcqBranchFor(c: Company): McqBranch {
  if (EXITED_STAGES.includes(c.stage)) return "exited";
  if (WON_STAGES.includes(c.stage)) return "account";
  if (LOST_STAGES.includes(c.stage)) return "feedback";
  if (BLOCKED_STAGES.includes(c.stage)) return "blocked";
  if (PRE_GTM_STAGES.includes(c.stage)) return "pre_gtm";
  // Open stages. Once it's in someone's hands, or in negotiating/closing, it's
  // a buy decision being worked.
  if ((c.owner ?? "").trim() || c.stage === "negotiating" || c.stage === "closing") {
    return "buy_decision";
  }
  return "mine_active";
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

/* ------------------------------------------------------------------ */
/* Cash model — the reality behind a committed deal value               */
/* ------------------------------------------------------------------ */

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isNaN(n) ? 0 : n;
}

export interface CashSummary {
  committed: number; // deal_value — what they agreed to
  collected: number; // cash actually in
  refunded: number; // clawed back
  net: number; // collected - refunded
  outstanding: number; // committed - collected (never below 0)
  pctCollected: number; // 0..100
  daysToCollect: number | null; // won date → paid-in-full date
}

export function cashSummary(c: Company): CashSummary {
  const committed = num(c.deal_value);
  const collected = num(c.cash_collected);
  const refunded = num(c.refunded);
  const outstanding = Math.max(committed - collected, 0);
  const pctCollected = committed > 0 ? Math.min(100, Math.round((collected / committed) * 100)) : 0;
  let daysToCollect: number | null = null;
  if (c.collected_at) {
    // From when it was won (best proxy: created_at of the won record) to paid.
    const from = new Date(c.created_at).getTime();
    const to = new Date(c.collected_at).getTime();
    daysToCollect = Math.max(0, Math.round((to - from) / (24 * 60 * 60 * 1000)));
  }
  return { committed, collected, refunded, net: collected - refunded, outstanding, pctCollected, daysToCollect };
}

/* ------------------------------------------------------------------ */
/* Forecast — deterministic, stage-weighted. No model.                  */
/* ------------------------------------------------------------------ */

/**
 * How likely a deal at each stage is to close, as a probability. Used to weight
 * open-pipeline value into an "expected" forecast. These are sensible defaults —
 * tune them once real close rates are known. Stages not listed contribute 0 to
 * the weighted forecast (won is already money, not a forecast).
 *
 * NOTE: at ~50 deals a weighted forecast is directional, not precise — one big
 * deal slipping moves it a lot. The renewals side (below) is the reliable part.
 */
export const STAGE_WEIGHTS: Partial<Record<Stage, number>> = {
  whatsapp_group: 0.1,
  gtm_active: 0.2,
  negotiating: 0.4,
  closing: 0.7,
  // Blocked-but-warm: they liked it, something external is in the way.
  blocked_pricing: 0.2,
  blocked_timing: 0.2,
  blocked_approval: 0.2,
  blocked_budget: 0.15,
  blocked_no_response: 0.1,
  blocked_no_show: 0.1,
  blocked_no_show_ghosted: 0.05,
};

export interface Forecast {
  // New-deal pipeline (directional).
  worst: number; // only what's in `closing`
  expected: number; // every open deal × its stage weight
  best: number; // all open pipeline at full value
  openCount: number; // how many open deals feed it
  // Renewals from won accounts due within the window (the trustworthy part).
  renewalsExpected: number;
  renewalsCount: number;
}

/**
 * Project revenue over the next `windowDays`. Open deals are stage-weighted;
 * renewals are won accounts whose next_purchase_due falls in the window. Pure —
 * derived from the companies already on screen, no extra query.
 */
export function forecast(companies: Company[], windowDays = 30, now: Date = new Date()): Forecast {
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  let worst = 0;
  let expected = 0;
  let best = 0;
  let openCount = 0;
  let renewalsExpected = 0;
  let renewalsCount = 0;

  for (const c of companies) {
    const value = num(c.deal_value);

    // Open pipeline (not won/lost/exited): stage-weighted.
    const weight = STAGE_WEIGHTS[c.stage];
    if (weight !== undefined && value > 0) {
      openCount++;
      best += value;
      expected += value * weight;
      if (c.stage === "closing") worst += value;
    }

    // Renewals: a won account with a purchase due inside the window. Repeat
    // revenue is the closest thing to guaranteed money here.
    if (WON_STAGES.includes(c.stage) && c.next_purchase_due) {
      const due = new Date(c.next_purchase_due);
      if (due >= now && due <= horizon) {
        renewalsExpected += value;
        renewalsCount++;
      }
    }
  }

  return {
    worst: Math.round(worst),
    expected: Math.round(expected),
    best: Math.round(best),
    openCount,
    renewalsExpected: Math.round(renewalsExpected),
    renewalsCount,
  };
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

/** Just the day — "17 Jul 2026", with an ordinal ("17th Jul 2026"). No time. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.getDate();
  const ord =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
      ? "rd"
      : "th";
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${day}${ord} ${month} ${d.getFullYear()}`;
}

/**
 * A timeline event as a plain sentence — "Called them on 17th Jul 2026, no
 * answer" — instead of a stacked date + status badge. Reads like a diary. The
 * date is the day the event happened; we don't surface the exact log time.
 */
export function logSentence(l: {
  kind: LogKind;
  picked_up: boolean;
  called_at: string;
  contact_name?: string | null;
  outcome?: Outcome | null;
}): string {
  const on = `on ${formatDay(l.called_at)}`;
  const who = l.contact_name ? l.contact_name : "them";

  switch (l.kind) {
    case "call":
      return l.picked_up
        ? `Called ${who} ${on} — spoke${l.outcome ? `, ${OUTCOME_LABELS[l.outcome].toLowerCase()}` : ""}.`
        : `Called ${who} ${on} — no answer.`;
    case "meet":
      return l.picked_up
        ? `Met ${who} ${on}${l.outcome ? ` — ${OUTCOME_LABELS[l.outcome].toLowerCase()}` : ""}.`
        : `${who[0].toUpperCase()}${who.slice(1)} no-showed the meet ${on}.`;
    case "note":
      return `Note ${on}.`;
    case "contact_change":
      return `Contact changed ${on}.`;
    case "handoff":
      return `Handed over ${on}.`;
    default:
      return `${on}.`;
  }
}

export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
