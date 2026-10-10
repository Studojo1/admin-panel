/** The rules behind the "Needs attention" card on /daily.
 *
 * Lead discovery was down for six days in October and nobody knew: students
 * kept starting, none finished, and their orders sat at "generating leads".
 * The card exists so that shows up on the page the owner reads every day.
 *
 * No database or browser code in here, so /api/health-watch and the unit
 * tests (scripts/health-watch.test.mjs) run the same copy.
 */

export type DiscoveryState = "ok" | "watch" | "failing";

/** What GET /api/health-watch returns. Times are ISO strings in UTC. */
export type HealthWatch = {
  discovery: {
    state: DiscoveryState;
    stuck_count: number;
    /** When the oldest stuck order got stuck. `stuck` is capped, this is not. */
    stuck_since: string | null;
    stuck: { order_id: number; email: string; since: string; hours: number }[];
    last_success_at: string | null;
    completed_24h: number;
  };
  paid_nothing_sent: {
    count: number;
    rows: { email: string; paid_at: string; amount: number; currency: string; days_since: number; reason: string }[];
  };
};

/**
 * ok: nothing is stuck. failing: three or more orders are stuck, or one is
 * stuck and no run has finished since the oldest of them began. watch: one or
 * two are stuck but runs have finished since, so it is not a full outage.
 */
export function discoveryState(
  stuckCount: number,
  oldestStuckAt: string | null,
  lastSuccessAt: string | null,
): DiscoveryState {
  if (stuckCount <= 0) return "ok";
  if (stuckCount >= 3) return "failing";
  const succeededSince =
    !!oldestStuckAt && !!lastSuccessAt && Date.parse(lastSuccessAt) > Date.parse(oldestStuckAt);
  return succeededSince ? "watch" : "failing";
}

/** One paying customer's campaigns and mailbox, across all their resumes. */
export type CampaignFacts = {
  running: boolean;
  /** A paused campaign whose mailbox has lost its Gmail sign in. */
  pausedGmailInvalid: boolean;
  paused: boolean;
  pauseReason: string | null;
  draft: boolean;
  /** Campaigns in any status, finished and cancelled ones included. */
  campaigns: number;
  mailbox: boolean;
};

// The backend stores why a campaign paused as a short code. Anything it adds
// later is shown as stored, with the underscores taken out.
function pauseWords(code: string): string {
  switch (code) {
    case "gmail_auth": return "Gmail access was lost";
    case "gmail_disconnected": return "Gmail was disconnected";
    case "user": return "by the student";
    case "admin": return "by the team";
    default: return code.replace(/_/g, " ");
  }
}

/** Why a paying customer has had no email sent, in plain words. First match wins. */
export function nothingSentReason(f: CampaignFacts): string {
  if (f.running) return "Campaign running, nothing sent yet";
  if (f.pausedGmailInvalid) return "Campaign paused: Gmail needs reconnecting";
  if (f.paused) {
    const why = (f.pauseReason ?? "").trim();
    return why ? `Campaign paused (${pauseWords(why)})` : "Campaign paused";
  }
  if (f.draft) return "Campaign created, never launched";
  if (f.campaigns === 0) return f.mailbox ? "Gmail connected, never launched" : "Never connected Gmail";
  return "No campaign";
}
