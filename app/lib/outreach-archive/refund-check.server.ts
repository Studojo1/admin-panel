// Refund Policy v3.0 section 3.3 campaign check, ported from job-outreach-svc
// services/refund_check.py. Read only: it shows the evidence, nothing refunds.
import type { Query, Row } from "./db.server";
import {
  addDays,
  diffDays,
  firstLine,
  head,
  localDate,
  localDateMs,
  localMidnightUtc,
  pyIso,
  pyRound,
  truthy,
} from "./py";

const STREAK_DAYS = 7;
const REPORT_WINDOW_DAYS = 15;
const FIX_WINDOW_DAYS = 7;
const YES = "yes", NO = "no", CHECK = "check", OPEN = "open";

function days(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** null when the campaign does not exist. */
export async function campaignRefundCheck(q: Query, campaignId: number, reportedOn: string | null) {
  const nowMs = Date.now();
  const [campaign] = await q(
    `SELECT id, candidate_id, name, status, user_timezone, paused_at, started_at, completed_at, credits_reserved,
       outreach_order_id, pause_reason, paused_by, created_at
     FROM campaigns WHERE id = $1`,
    [campaignId],
  );
  if (!campaign) return null;
  const tz: string = campaign.user_timezone || "Asia/Kolkata";
  const [owner] = await q(
    `SELECT u.id, u.email FROM "user" u JOIN candidates cd ON cd.user_id = u.id WHERE cd.id = $1 LIMIT 1`,
    [campaign.candidate_id],
  );

  const today = localDateMs(nowMs, tz);
  let start = localDate(campaign.started_at || campaign.created_at, tz);
  let end: string | null =
    ["completed", "cancelled"].includes(campaign.status) && campaign.completed_at
      ? localDate(campaign.completed_at, tz)
      : today;
  if (start === null || end === null || end < start) {
    end = today;
    start = today;
  }

  const rows = await q(
    `SELECT sent_at, followup_number FROM emails_sent
     WHERE campaign_id = $1 AND sent_at IS NOT NULL AND is_test IS NOT true`,
    [campaign.id],
  );
  const perDay = new Map<string, number>();
  let firstTouchSent = 0;
  for (const r of rows) {
    const d = localDate(r.sent_at, tz)!;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    if (!truthy(r.followup_number)) firstTouchSent += 1;
  }
  const dayList = days(start, end);
  const daily = dayList.map((d) => ({ date: d, sent: perDay.get(d) ?? 0 }));

  // Longest run of zero-send days inside the campaign's life.
  let best: [string, string] | null = null;
  let runStart: string | null = null;
  for (const d of [...dayList, null]) {
    if (d !== null && (perDay.get(d) ?? 0) === 0) {
      runStart = runStart ?? d;
      continue;
    }
    if (runStart !== null) {
      const runEnd = d ? addDays(d, -1) : dayList[dayList.length - 1];
      if (best === null || diffDays(runEnd, runStart) > diffDays(best[1], best[0])) best = [runStart, runEnd];
      runStart = null;
    }
  }
  const streakLen = best ? diffDays(best[1], best[0]) + 1 : 0;

  type Pause = { date: string; reason: unknown; by: unknown; current?: boolean };
  const pauses: Pause[] = [];
  for (const ev of await q(`SELECT metadata, created_at FROM system_events WHERE event_type = 'campaign_paused'`)) {
    const meta = truthy(ev.metadata) ? ev.metadata : {};
    if (meta.campaign_id === campaign.id) {
      pauses.push({ date: localDate(ev.created_at, tz)!, reason: meta.pause_reason ?? null, by: meta.paused_by ?? null });
    }
  }
  if (campaign.status === "paused" && campaign.paused_at) {
    const cur: Pause = {
      date: localDate(campaign.paused_at, tz)!,
      reason: campaign.pause_reason,
      by: campaign.paused_by,
      current: true,
    };
    if (!pauses.some((p) => p.date === cur.date && p.reason === cur.reason)) pauses.push(cur);
  }
  pauses.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const inStreak = (iso: string) => !!best && best[0] <= iso && iso <= best[1];
  let streakPauses = pauses.filter((p) => inStreak(p.date));
  if (best && campaign.status === "paused" && campaign.paused_at && localDate(campaign.paused_at, tz)! <= best[1]) {
    if (!streakPauses.length) streakPauses = pauses.filter((p) => p.current);
  }

  const gmailNotices = (await q(`SELECT kind, created_at FROM campaign_notices WHERE campaign_id = $1`, [campaign.id]))
    .filter((n) => (n.kind || "").includes("gmail"))
    .map((n) => localDate(n.created_at, tz)!);
  const gmailProblems: Row[] = [
    ...streakPauses.filter((p) => p.reason === "gmail_auth"),
    ...gmailNotices.filter((d) => inStreak(d)).map((d) => ({ date: d, reason: "gmail reconnect email sent" })),
  ];

  // Evidence for condition 4: failures logged during the streak.
  const failures = new Map<string, number>();
  if (best) {
    const lo = localMidnightUtc(best[0], tz);
    const hi = localMidnightUtc(addDays(best[1], 1), tz);
    for (const r of await q(
      `SELECT status, error_message FROM emails_sent
       WHERE campaign_id = $1 AND status IN ('failed', 'generation_failed')
         AND status_changed_at >= $2 AND status_changed_at < $3`,
      [campaign.id, lo, hi],
    )) {
      const key = `${r.status}: ${head(firstLine(r.error_message || "no message"), 90)}`;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  }
  const evidence: { what: string; count: number }[] = [...failures.entries()]
    .map(([what, count], i) => ({ what, count, i }))
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .slice(0, 5)
    .map(({ what, count }) => ({ what, count }));
  for (const p of streakPauses) {
    if (p.by !== "user") evidence.push({ what: `paused by ${truthy(p.by) ? p.by : "system"}: ${p.reason ?? "None"}`, count: 1 });
  }

  const c1 = best && !streakPauses.length && campaign.status !== "draft" ? YES : best ? CHECK : NO;
  const c2 = best && !gmailProblems.length ? YES : gmailProblems.length ? NO : CHECK;
  const c3 = streakLen >= STREAK_DAYS ? YES : NO;
  const c4 = CHECK;

  let lastSendBefore: string | null = null;
  if (best) {
    for (const d of perDay.keys()) if (d < best[0] && (lastSendBefore === null || d > lastSendBefore)) lastSendBefore = d;
  }
  const anchor = lastSendBefore ?? start;
  let c5: string, c6: string, fixNote: string;
  if (reportedOn === null) {
    c5 = OPEN;
    c6 = OPEN;
    fixNote = "Enter the date the user reported it";
  } else {
    c5 = diffDays(reportedOn, anchor) <= REPORT_WINDOW_DAYS ? YES : NO;
    let resumed = 0;
    for (let i = 1; i <= FIX_WINDOW_DAYS; i++) {
      const d = addDays(reportedOn, i);
      if (d <= today) resumed += perDay.get(d) ?? 0;
    }
    const deadline = addDays(reportedOn, FIX_WINDOW_DAYS);
    if (resumed > 0) {
      c6 = NO;
      fixNote = `sending resumed (${resumed} sent) after the report`;
    } else if (today >= deadline) {
      c6 = YES;
      fixNote = `no sends in the 7 days to ${deadline}`;
    } else {
      c6 = OPEN;
      fixNote = `day ${diffDays(today, reportedOn)} of ${FIX_WINDOW_DAYS}`;
    }
  }

  // Money: each credit valued at what was actually paid for the pack.
  const reserved = campaign.credits_reserved || 0;
  const unsent = Math.max(reserved - firstTouchSent, 0);
  const [payment] = campaign.outreach_order_id
    ? await q(
        `SELECT id, provider, currency, amount_cents, refunded_cents, credits_granted, tier, razorpay_payment_id,
           dodo_payment_id
         FROM payment_orders WHERE outreach_order_id = $1 AND status IN ('paid', 'completed', 'refunded')
         ORDER BY created_at DESC LIMIT 1`,
        [campaign.outreach_order_id],
      )
    : [];
  let refund: Row | null = null;
  if (payment && payment.amount_cents && (payment.credits_granted || payment.tier)) {
    const bought = payment.credits_granted || payment.tier;
    const perCredit = payment.amount_cents / bought;
    const remaining = payment.amount_cents - (payment.refunded_cents || 0);
    const amount = Math.min(pyRound(unsent * perCredit), remaining);
    refund = {
      payment_id: payment.id,
      provider: payment.provider,
      currency: payment.currency,
      paid_cents: payment.amount_cents,
      already_refunded_cents: payment.refunded_cents || 0,
      credits_bought: bought,
      per_credit_cents: pyRound(perCredit, 2),
      unsent_credits: unsent,
      amount_cents: Math.max(amount, 0),
      provider_payment_id: payment.razorpay_payment_id || payment.dodo_payment_id,
    };
  }

  const conditions = [
    {
      n: 1,
      label: "Campaign active",
      result: c1,
      note:
        c1 === YES ? "no pauses in the streak" : best ? `${streakPauses.length} pause(s) in the streak` : "no zero-send streak",
    },
    {
      n: 2,
      label: "Gmail connected",
      result: c2,
      note: c2 === YES ? "no Gmail disconnection in the streak" : gmailProblems.map((g) => `${g.date} ${g.reason}`).join("; "),
    },
    { n: 3, label: `Zero sends for ${STREAK_DAYS} consecutive days`, result: c3, note: `${streakLen} days` },
    {
      n: 4,
      label: "Our fault",
      result: c4,
      note: evidence.map((e) => `${e.what} ×${e.count}`).join("; ") || "no failures logged: check worker logs",
    },
    {
      n: 5,
      label: `Reported within ${REPORT_WINDOW_DAYS} days of last send (${anchor})`,
      result: c5,
      note: reportedOn ? `reported ${reportedOn}` : "Enter the date the user reported it",
    },
    { n: 6, label: `Not fixed within ${FIX_WINDOW_DAYS} days of report`, result: c6, note: fixNote },
  ];
  const automatic = conditions.filter((c) => c.n !== 4).map((c) => c.result);
  const verdict = automatic.every((r) => r === YES) ? "met" : automatic.some((r) => r === NO) ? "not_met" : "open";

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      pause_reason: campaign.pause_reason,
      timezone: tz,
      created_at: pyIso(campaign.created_at),
      started_at: pyIso(campaign.started_at),
      user_id: owner ? owner.id : null,
      user_email: owner ? owner.email : null,
      credits_reserved: reserved,
      first_touch_sent: firstTouchSent,
    },
    daily,
    streak: { days: streakLen, start: best ? best[0] : null, end: best ? best[1] : null },
    gmail: { problems: gmailProblems },
    pauses,
    conditions,
    verdict,
    refund,
  };
}
