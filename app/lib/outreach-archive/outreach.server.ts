// The outreach admin reads job-outreach-svc used to serve
// (api/routes_admin.py), ported to read the same tables directly. Same rules,
// same numbers, same JSON. Runs inside readOnly() (./db.server.ts).
import type { Query, Row } from "./db.server";
import { micros, pyIso, pyOr, pyRound, truthy } from "./py";

// ── Stage tables (routes_admin.py) ──────────────────────────────────────────

const MAIN_FLOW_STAGES: [string, string, string][] = [
  ["resume_uploaded", "Resume Uploaded", "resume_uploaded_at"],
  ["quiz_completed", "Quiz Completed", "quiz_completed_at"],
  ["leads_generated", "Leads Generated", "leads_generated_at"],
  ["leads_viewed", "Leads Viewed", "leads_viewed_at"],
  ["payment_page_reached", "Payment Page Reached", "payment_page_reached_at"],
  ["payment_made", "Payment Made", "payment_made_at"],
  ["gmail_connected", "Gmail Connected", "gmail_connected_at"],
  ["email_style_selected", "Email Style Selected", "email_style_selected_at"],
  ["campaign_setup", "Campaign Setup", "campaign_setup_at"],
  ["campaign_launched", "Campaign Launched", "campaign_launched_at"],
  ["campaign_completed", "Campaign Completed", "campaign_completed_at"],
];
const SIDE_STAGES: [string, string, string][] = [["campaign_paused", "Campaign Paused", "campaign_paused_at"]];
const FUNNEL_STAGES = [...MAIN_FLOW_STAGES.slice(0, -1), ...SIDE_STAGES, ...MAIN_FLOW_STAGES.slice(-1)];

const STUCK_THRESHOLD_HOURS = 6;
const ACTIVE_STATUSES = [
  "profile_complete", "leads_generating", "leads_ready", "enriching",
  "enrichment_complete", "campaign_setup", "email_connected", "campaign_running",
];
const SYSTEM_PROCESSING_STATUSES = ["leads_generating", "enriching", "campaign_running"];

// UC-Q40: leads_viewed_at is only written since 27 Sep 2026 05:00 UTC.
const LEADS_VIEWED_SINCE = "2026-09-27 05:00:00";

// Test and team accounts left out of the stats (three lists, as in the service).
const STATS_EXCL = [
  "businessconnect.pranav@gmail.com",
  "pranav.hegde126@gmail.com",
  "pranavshastry4@gmail.com",
  "studojo@gmail.com",
  "benjenstark.578239@gmail.com",
  "pranavs.hegde@bbafeh.christuniversity.in",
];
const PAYMENTS_EXCL = ["businessconnect.pranav@gmail.com", "pranav.hegde126@gmail.com", "benjenstark.578239@gmail.com"];
const FUNNEL_EXCL = STATS_EXCL;

const ORDER_COLS = `id, user_id, candidate_id, campaign_id, status, leads_collected, leads_target, action_log,
  ${FUNNEL_STAGES.map(([, , c]) => c).join(", ")}, created_at, updated_at`;
const CAMPAIGN_COLS = `c.id, c.candidate_id, c.email_account_id, c.name, c.status, c.daily_limit, c.paused_at,
  c.started_at, c.completed_at, c.credits_reserved, c.credits_released, c.outreach_order_id, c.pause_reason,
  c.paused_by, c.created_at`;

const nowMicros = () => Date.now() * 1000;
const stuckCutoffMicros = () => nowMicros() - STUCK_THRESHOLD_HOURS * 3600 * 1_000_000;

function statusMap(rows: Row[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.status] = r.n;
  return m;
}

function campaignsForUser(q: Query, userId: string) {
  return q(
    `SELECT ${CAMPAIGN_COLS} FROM campaigns c JOIN candidates cd ON cd.id = c.candidate_id
     WHERE cd.user_id = $1 ORDER BY c.created_at DESC`,
    [userId],
  );
}

// ── GET /overview ───────────────────────────────────────────────────────────

async function funnelAggregate(q: Query) {
  const reached = async (i: number, since?: string): Promise<number> => {
    const cols = MAIN_FLOW_STAGES.slice(i).map(([, , c]) => `${c} IS NOT NULL`).join(" OR ");
    const rows = since
      ? await q(`SELECT count(DISTINCT user_id) AS n FROM outreach_orders WHERE (${cols}) AND created_at >= $1`, [since])
      : await q(`SELECT count(DISTINCT user_id) AS n FROM outreach_orders WHERE (${cols})`);
    return rows[0]?.n ?? 0;
  };
  const drop = (prev: number | null, cur: number): [number | null, number | null] => {
    if (prev === null || prev <= 0) return [null, null];
    const d = Math.max(prev - cur, 0);
    return [d, pyRound((d / prev) * 100, 1)];
  };
  const funnel: Row[] = [];
  let prev: number | null = null;
  for (let i = 0; i < MAIN_FLOW_STAGES.length; i++) {
    const [key, label] = MAIN_FLOW_STAGES[i];
    if (key === "leads_viewed") {
      const users = await reached(i, LEADS_VIEWED_SINCE);
      const [d, pct] = drop(i > 0 ? await reached(i - 1, LEADS_VIEWED_SINCE) : null, users);
      funnel.push({
        stage: key,
        label: `${label} (orders since 27 Sep)`,
        users_reached: users,
        drop_off_from_prev: d,
        drop_off_pct_from_prev: pct,
        counted_since: "2026-09-27T05:00:00Z",
      });
      continue;
    }
    const users = await reached(i);
    const [d, pct] = drop(prev, users);
    funnel.push({ stage: key, label, users_reached: users, drop_off_from_prev: d, drop_off_pct_from_prev: pct });
    if (key === "campaign_launched") {
      const [{ n }] = await q(`SELECT count(DISTINCT user_id) AS n FROM outreach_orders WHERE campaign_paused_at IS NOT NULL`);
      funnel.push({
        stage: "campaign_paused",
        label: "Campaign Paused",
        users_reached: n ?? 0,
        drop_off_from_prev: null,
        drop_off_pct_from_prev: null,
      });
    }
    prev = users;
  }
  return funnel;
}

const PAID_LEAD_JOIN = `FROM emails_sent es
  JOIN campaigns c ON c.id = es.campaign_id
  JOIN candidates cd ON cd.id = c.candidate_id
  JOIN "user" u ON u.id = cd.user_id
  JOIN payment_orders po ON po.user_id = u.id`;
const PAID_LEAD_WHERE = `NOT es.is_test AND es.lead_id IS NOT NULL AND po.status = 'paid'
  AND po.amount_cents > 0 AND u.email <> ALL($1::text[])`;

export async function overview(q: Query) {
  const ordersByStatus = statusMap(await q(`SELECT status, count(*) AS n FROM outreach_orders GROUP BY status`));
  const totalOrders = Object.values(ordersByStatus).reduce((a, b) => a + b, 0);
  const activeOrders = ACTIVE_STATUSES.reduce((a, s) => a + (ordersByStatus[s] ?? 0), 0);
  const completedOrders = ordersByStatus.completed ?? 0;

  const one = async (sql: string, values: unknown[] = []) => (await q(sql, values))[0]?.n ?? 0;
  const stuck = await one(
    `SELECT count(*) AS n FROM outreach_orders WHERE status = ANY($1::text[]) AND updated_at < now() - interval '${STUCK_THRESHOLD_HOURS} hours'`,
    [SYSTEM_PROCESSING_STATUSES],
  );
  const paidOrders = await one(`SELECT count(*) AS n FROM payment_orders WHERE status = 'paid'`);
  const revenue = await one(`SELECT coalesce(sum(amount_cents), 0) AS n FROM payment_orders WHERE status = 'paid'`);

  const emailMap = statusMap(await q(`SELECT status, count(*) AS n FROM emails_sent GROUP BY status`));
  const totalSent = (emailMap.sent ?? 0) + (emailMap.replied ?? 0);
  const totalReplied = emailMap.replied ?? 0;
  const totalBounced = emailMap.bounced ?? 0;
  const trackable = await one(
    `SELECT count(*) AS n FROM emails_sent WHERE tracking_token IS NOT NULL AND status IN ('sent', 'replied')`,
  );
  const opened = await one(`SELECT count(*) AS n FROM emails_sent WHERE open_count > 0`);
  const openRate = trackable > 0 ? pyRound((opened / trackable) * 100, 1) : 0.0;
  const openedAndReplied = await one(`SELECT count(*) AS n FROM emails_sent WHERE open_count > 0 AND status = 'replied'`);

  const contacted = await one(
    `SELECT count(DISTINCT es.lead_id) AS n ${PAID_LEAD_JOIN}
     WHERE es.followup_number = 0 AND es.status IN ('sent', 'replied') AND ${PAID_LEAD_WHERE}`,
    [STATS_EXCL],
  );
  const repliedLeads = await one(
    `SELECT count(DISTINCT es.lead_id) AS n ${PAID_LEAD_JOIN}
     WHERE es.reply_received_at IS NOT NULL AND ${PAID_LEAD_WHERE}`,
    [STATS_EXCL],
  );
  const replyRate = contacted > 0 ? pyRound((repliedLeads / contacted) * 100, 1) : 0.0;

  const months: Record<string, Row> = {};
  for (const r of await q(
    `SELECT to_char(created_at, 'YYYY-MM') AS month, count(*) AS n FROM outreach_orders
     WHERE created_at >= now() - interval '365 days' GROUP BY month`,
  )) (months[r.month] ??= {}).orders_created = r.n;
  for (const r of await q(
    `SELECT to_char(created_at, 'YYYY-MM') AS month, coalesce(sum(amount_cents), 0) AS n FROM payment_orders
     WHERE status = 'paid' AND created_at >= now() - interval '365 days' GROUP BY month`,
  )) (months[r.month] ??= {}).revenue_cents = Math.trunc(r.n);
  for (const r of await q(
    `SELECT to_char(sent_at, 'YYYY-MM') AS month, count(*) AS sent,
       sum(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied,
       sum(CASE WHEN open_count > 0 THEN 1 ELSE 0 END) AS opened
     FROM emails_sent WHERE sent_at IS NOT NULL AND sent_at >= now() - interval '365 days' GROUP BY month`,
  )) {
    const m = (months[r.month] ??= {});
    m.emails_sent = r.sent;
    m.emails_replied = r.replied ?? 0;
    m.emails_opened = r.opened ?? 0;
  }
  const monthly = Object.entries(months)
    .map(([month, d]) => ({
      month,
      orders_created: d.orders_created ?? 0,
      revenue_cents: d.revenue_cents ?? 0,
      emails_sent: d.emails_sent ?? 0,
      emails_replied: d.emails_replied ?? 0,
      emails_opened: d.emails_opened ?? 0,
    }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  const funnel = await funnelAggregate(q);

  const periods = await q(
    `WITH fc AS (
       SELECT es.lead_id AS lead_id, to_char(min(es.sent_at), 'YYYY-MM') AS cohort_month ${PAID_LEAD_JOIN}
       WHERE es.followup_number = 0 AND es.status IN ('sent', 'replied') AND es.sent_at IS NOT NULL AND ${PAID_LEAD_WHERE}
       GROUP BY es.lead_id
     ), ar AS (
       SELECT DISTINCT lead_id FROM emails_sent WHERE reply_received_at IS NOT NULL AND lead_id IS NOT NULL
     )
     SELECT fc.cohort_month, count(fc.lead_id) AS contacted, count(ar.lead_id) AS replied
     FROM fc LEFT OUTER JOIN ar ON ar.lead_id = fc.lead_id
     GROUP BY fc.cohort_month ORDER BY fc.cohort_month`,
    [STATS_EXCL],
  );

  return {
    total_orders: totalOrders,
    paid_orders: paidOrders,
    active_orders: activeOrders,
    completed_orders: completedOrders,
    stuck_orders: stuck,
    total_revenue_cents: revenue,
    total_emails_sent: totalSent,
    total_emails_replied: totalReplied,
    total_emails_bounced: totalBounced,
    total_emails_opened: opened,
    total_emails_trackable: trackable,
    total_emails_opened_and_replied: openedAndReplied,
    reply_rate_pct: replyRate,
    open_rate_pct: openRate,
    leads_contacted: contacted,
    leads_replied: repliedLeads,
    period_reply_rates: periods.map((r) => ({
      month: r.cohort_month,
      leads_contacted: r.contacted,
      leads_replied: r.replied,
      reply_rate: r.contacted > 0 ? pyRound((r.replied / r.contacted) * 100, 1) : 0.0,
    })),
    orders_by_status: ordersByStatus,
    monthly_metrics: monthly,
    funnel,
  };
}

// ── GET /users ──────────────────────────────────────────────────────────────

/** _meaningful_ts: the order's last activity, or the user's signup when the order was never progressed. */
function meaningfulTs(order: Row, fallback: string | null): string | null {
  let ts: string | null = order.updated_at ?? order.created_at ?? null;
  if (ts === null) return fallback ? pyIso(fallback) : null;
  const created = order.created_at;
  if (created) {
    const delta = Math.abs(micros(ts) - micros(created)) / 1_000_000;
    if (delta < 2) ts = fallback ?? ts;
  }
  return ts ? pyIso(ts) : null;
}

/** Python `a and b and c ...` for is_stuck: False, None (no updated_at) or the comparison. */
function isStuck(order: Row | undefined | null): boolean | null {
  if (!order) return false;
  if (!SYSTEM_PROCESSING_STATUSES.includes(order.status)) return false;
  if (!order.updated_at) return null;
  return micros(order.updated_at) < stuckCutoffMicros();
}

export async function users(q: Query, p: { limit: number; offset: number; search: string; statusFilter: string }) {
  const where: string[] = [];
  const values: unknown[] = [];
  const inner = p.statusFilter
    ? (values.push(p.statusFilter), `SELECT DISTINCT user_id FROM outreach_orders WHERE status = $${values.length}`)
    : `SELECT DISTINCT user_id FROM outreach_orders`;
  where.push(`u.id IN (${inner})`);
  if (p.search) {
    values.push(`%${p.search}%`);
    where.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  const W = where.join(" AND ");
  const [{ n: total }] = await q(`SELECT count(*) AS n FROM "user" u WHERE ${W}`, values);
  const page = await q(
    `SELECT u.id, u.name, u.email, u.created_at FROM "user" u WHERE ${W}
     ORDER BY (SELECT max(o.updated_at) FROM outreach_orders o WHERE o.user_id = u.id) DESC NULLS LAST, u.id DESC
     OFFSET $${values.length + 1} LIMIT $${values.length + 2}`,
    [...values, p.offset, p.limit],
  );

  const result: Row[] = [];
  for (const u of page) {
    const orders = await q(`SELECT ${ORDER_COLS} FROM outreach_orders WHERE user_id = $1`, [u.id]);
    const active = orders.find((o) => ACTIVE_STATUSES.includes(o.status));
    let latest: Row | null = null;
    for (const o of orders) {
      const k = o.updated_at ?? o.created_at;
      if (latest === null || micros(k) > micros(latest.updated_at ?? latest.created_at)) latest = o;
    }
    const campaigns = await campaignsForUser(q, u.id);
    const running = campaigns.find((c) => c.status === "running");
    const [{ n: totalPaid }] = await q(
      `SELECT coalesce(sum(amount_cents), 0) AS n FROM payment_orders WHERE user_id = $1 AND status = 'paid'`,
      [u.id],
    );
    const [credit] = await q(`SELECT total_credits, used_credits FROM user_credits WHERE user_id = $1 LIMIT 1`, [u.id]);

    let sent = 0, replied = 0, bounced = 0;
    if (campaigns.length) {
      const m = statusMap(
        await q(`SELECT status, count(*) AS n FROM emails_sent WHERE campaign_id = ANY($1::int[]) GROUP BY status`, [
          campaigns.map((c) => c.id),
        ]),
      );
      sent = (m.sent ?? 0) + (m.replied ?? 0);
      replied = m.replied ?? 0;
      bounced = m.bounced ?? 0;
    }
    const candidateIds = orders.map((o) => o.candidate_id).filter((x) => truthy(x));
    let totalLeads = 0;
    if (candidateIds.length) {
      totalLeads = (await q(`SELECT count(*) AS n FROM leads WHERE candidate_id = ANY($1::int[])`, [candidateIds]))[0]?.n ?? 0;
    }

    const stageTs: Record<string, string | null> = {};
    for (const [key, , col] of FUNNEL_STAGES) {
      let best: string | null = null;
      for (const o of orders) {
        const v = o[col];
        if (v != null && (best === null || micros(v) < micros(best))) best = v;
      }
      stageTs[key] = best;
    }
    let current: string | null = null;
    let currentLabel: string | null = null;
    for (const [k, l] of [...MAIN_FLOW_STAGES].reverse()) {
      if (stageTs[k] != null) {
        current = k;
        currentLabel = l;
        break;
      }
    }
    for (const k of Object.keys(stageTs)) stageTs[k] = pyIso(stageTs[k]);

    result.push({
      user_id: u.id,
      user_name: u.name,
      user_email: u.email,
      total_orders: orders.length,
      stage_timestamps: stageTs,
      current_stage: current,
      current_stage_label: currentLabel,
      active_order_status: running ? "campaign_running" : latest ? latest.status : null,
      active_order_id: latest ? latest.id : null,
      active_campaign_id: running ? running.id : campaigns.length ? campaigns[0].id : null,
      active_order_updated_at: latest ? meaningfulTs(latest, u.created_at) : null,
      is_stuck: isStuck(active),
      total_paid_cents: totalPaid,
      total_credits: credit ? credit.total_credits : 0,
      used_credits: credit ? credit.used_credits : 0,
      total_emails_sent: sent,
      total_emails_replied: replied,
      total_emails_bounced: bounced,
      total_leads: totalLeads,
      created_at: pyIso(u.created_at),
    });
  }
  return { users: result, total };
}

// ── GET /payments ───────────────────────────────────────────────────────────

export async function payments(q: Query, p: { limit: number; offset: number; search: string; statusFilter: string }) {
  const values: unknown[] = [PAYMENTS_EXCL];
  const where = [`u.email <> ALL($1::text[])`];
  if (p.statusFilter === "paid") where.push(`po.status = 'paid'`);
  else if (p.statusFilter === "abandoned") where.push(`po.status = 'created'`);
  else if (p.statusFilter === "refunded") where.push(`(po.status IN ('refunded', 'refunding') OR po.refunded_cents > 0)`);
  if (p.search) {
    values.push(`%${p.search}%`);
    where.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  const FROM = `FROM payment_orders po JOIN "user" u ON po.user_id = u.id LEFT OUTER JOIN coupons cp ON po.coupon_id = cp.id
    WHERE ${where.join(" AND ")}`;
  const [{ n: total }] = await q(`SELECT count(*) AS n ${FROM}`, values);
  const rows = await q(
    `SELECT po.id, po.amount_cents, po.currency, po.provider, po.tier, po.plan_id, po.status, po.geo_country,
       po.credits_granted, po.razorpay_order_id, po.razorpay_payment_id, po.dodo_checkout_id, po.dodo_payment_id,
       po.refunded_cents, po.refunded_at, po.refund_id, po.created_at,
       u.id AS u_id, u.name AS u_name, u.email AS u_email, cp.id AS cp_id, cp.code AS cp_code
     ${FROM} ORDER BY po.created_at DESC OFFSET $${values.length + 1} LIMIT $${values.length + 2}`,
    [...values, p.offset, p.limit],
  );

  const STATS_FROM = `FROM payment_orders po JOIN "user" u ON po.user_id = u.id WHERE u.email <> ALL($1::text[])`;
  const paidRows = await q(`SELECT po.amount_cents, po.refunded_cents, po.currency ${STATS_FROM} AND po.status = 'paid'`, [
    PAYMENTS_EXCL,
  ]);
  const [{ n: abandoned }] = await q(`SELECT count(*) AS n ${STATS_FROM} AND po.status = 'created'`, [PAYMENTS_EXCL]);
  const net = (r: Row) => r.amount_cents - (r.refunded_cents || 0);
  const totalInr = paidRows.filter((r) => r.currency === "INR").reduce((a, r) => a + net(r), 0);
  const totalUsd = paidRows.filter((r) => r.currency === "USD").reduce((a, r) => a + net(r), 0);

  const result: Row[] = [];
  for (const po of rows) {
    const [latest] = await q(`SELECT status FROM outreach_orders WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`, [
      po.u_id,
    ]);
    result.push({
      id: po.id,
      user_id: po.u_id,
      user_name: po.u_name,
      user_email: po.u_email,
      amount_cents: po.amount_cents,
      currency: po.currency,
      provider: po.provider,
      tier: po.tier,
      plan_id: po.plan_id,
      status: po.status,
      geo_country: po.geo_country,
      coupon_code: po.cp_id != null ? po.cp_code : null,
      credits_granted: po.credits_granted,
      razorpay_order_id: po.razorpay_order_id,
      razorpay_payment_id: po.razorpay_payment_id,
      dodo_checkout_id: po.dodo_checkout_id,
      dodo_payment_id: po.dodo_payment_id,
      refunded_cents: po.refunded_cents || 0,
      refunded_at: pyIso(po.refunded_at),
      refund_id: po.refund_id,
      refundable:
        ["paid", "completed"].includes(po.status) &&
        ["razorpay", "dodo"].includes(po.provider) &&
        (po.amount_cents || 0) > (po.refunded_cents || 0),
      outreach_order_status: latest ? latest.status : null,
      created_at: pyIso(po.created_at),
    });
  }
  return {
    payments: result,
    total,
    stats: { total_paid: paidRows.length, total_inr_paise: totalInr, total_usd_cents: totalUsd, total_abandoned: abandoned },
  };
}

// ── GET /users/{id}/detail ──────────────────────────────────────────────────

/** services/order_links.current_campaign_id */
async function currentCampaignId(q: Query, order: Row): Promise<number | null> {
  const rows = await q(`SELECT id, status FROM campaigns WHERE outreach_order_id = $1 ORDER BY created_at DESC`, [order.id]);
  if (order.campaign_id && rows.every((c) => c.id !== order.campaign_id)) {
    const legacy = await q(`SELECT id, status FROM campaigns WHERE id = $1`, [order.campaign_id]);
    if (legacy.length) rows.push(legacy[0]);
  }
  const live = rows.find((c) => c.status === "running" || c.status === "paused");
  if (live) return live.id;
  return rows.length ? rows[0].id : null;
}

async function adminCampaignRow(q: Query, c: Row, orderIds: Set<number>, pointedAt: Set<number>) {
  const e = statusMap(await q(`SELECT status, count(*) AS n FROM emails_sent WHERE campaign_id = $1 GROUP BY status`, [c.id]));
  const [{ m: lastSent }] = await q(`SELECT max(sent_at) AS m FROM emails_sent WHERE campaign_id = $1`, [c.id]);
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    pause_reason: c.pause_reason,
    paused_by: c.paused_by,
    daily_limit: c.daily_limit,
    created_at: pyIso(c.created_at),
    last_sent_at: pyIso(lastSent),
    order_id: c.outreach_order_id,
    orphan: !pointedAt.has(c.id) && !orderIds.has(c.outreach_order_id),
    credits_reserved: c.credits_reserved,
    credits_released: c.credits_released,
    email_stats: {
      sent: (e.sent ?? 0) + (e.replied ?? 0),
      replied: e.replied ?? 0,
      bounced: e.bounced ?? 0,
      failed: e.failed ?? 0,
      unsent: ["pending_enrichment", "queued", "followup_pending"].reduce((a, k) => a + (e[k] ?? 0), 0),
    },
  };
}

export async function userDetail(q: Query, userId: string) {
  const [user] = await q(`SELECT id, name, email, created_at FROM "user" WHERE id = $1 LIMIT 1`, [userId]);
  if (!user) return null;
  const [credit] = await q(`SELECT total_credits, used_credits FROM user_credits WHERE user_id = $1 LIMIT 1`, [userId]);
  const pays = await q(
    `SELECT id, amount_cents, currency, tier, plan_id, status, credits_granted, created_at FROM payment_orders
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  const orders = await q(`SELECT ${ORDER_COLS} FROM outreach_orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  const campaigns = await campaignsForUser(q, userId);
  const orderIds = new Set<number>(orders.map((o) => o.id));
  const pointedAt = new Set<number>([
    ...campaigns.filter((c) => orderIds.has(c.outreach_order_id)).map((c) => c.id),
    ...orders.filter((o) => o.campaign_id).map((o) => o.campaign_id),
  ]);

  const ordersData: Row[] = [];
  for (const order of orders) {
    let campaignData: Row | null = null;
    const cid = await currentCampaignId(q, order);
    if (cid) {
      const [c] = await q(`SELECT id, name, status, daily_limit, created_at FROM campaigns WHERE id = $1 LIMIT 1`, [cid]);
      if (c) {
        const e = statusMap(
          await q(`SELECT status, count(*) AS n FROM emails_sent WHERE campaign_id = $1 GROUP BY status`, [c.id]),
        );
        const styles: Record<string, number> = {};
        for (const r of await q(
          `SELECT assigned_style, count(*) AS n FROM emails_sent WHERE campaign_id = $1 AND assigned_style IS NOT NULL
           GROUP BY assigned_style`,
          [c.id],
        ))
          styles[r.assigned_style] = r.n;
        campaignData = {
          id: c.id,
          name: c.name,
          status: c.status,
          daily_limit: c.daily_limit,
          created_at: pyIso(c.created_at),
          email_stats: {
            queued: e.queued ?? 0,
            scheduled: e.scheduled ?? 0,
            sent: (e.sent ?? 0) + (e.replied ?? 0),
            replied: e.replied ?? 0,
            bounced: e.bounced ?? 0,
            failed: e.failed ?? 0,
          },
          style_breakdown: styles,
        };
      }
    }
    const stageTs: Record<string, string | null> = {};
    for (const [key, , col] of FUNNEL_STAGES) stageTs[key] = order[col] ? pyIso(order[col]) : null;
    ordersData.push({
      id: order.id,
      status: order.status,
      leads_collected: order.leads_collected,
      leads_target: order.leads_target,
      is_stuck: isStuck(order),
      action_log: pyOr(order.action_log, []),
      stage_timestamps: stageTs,
      created_at: pyIso(order.created_at),
      updated_at: pyIso(order.updated_at),
      campaign: campaignData,
    });
  }

  const candidateIds = orders.map((o) => o.candidate_id).filter((x) => truthy(x));
  const leadSummary = { total: 0, with_email: 0, email_verified: 0, avg_score: 0 as number };
  if (candidateIds.length) {
    const ids = [candidateIds];
    leadSummary.total = (await q(`SELECT count(*) AS n FROM leads WHERE candidate_id = ANY($1::int[])`, ids))[0]?.n ?? 0;
    leadSummary.with_email =
      (await q(`SELECT count(*) AS n FROM leads WHERE candidate_id = ANY($1::int[]) AND email IS NOT NULL`, ids))[0]?.n ?? 0;
    leadSummary.email_verified =
      (await q(`SELECT count(*) AS n FROM leads WHERE candidate_id = ANY($1::int[]) AND email_verified = true`, ids))[0]?.n ??
      0;
    const [{ a }] = await q(
      `SELECT avg(ls.overall_score) AS a FROM lead_scores ls JOIN leads l ON l.id = ls.lead_id WHERE l.candidate_id = ANY($1::int[])`,
      ids,
    );
    leadSummary.avg_score = truthy(a) ? pyRound(Number(a), 1) : 0;
  }

  const campaignRows: Row[] = [];
  for (const c of campaigns) campaignRows.push(await adminCampaignRow(q, c, orderIds, pointedAt));

  return {
    user: { id: user.id, name: user.name, email: user.email, created_at: pyIso(user.created_at) },
    credits: {
      total: credit ? credit.total_credits : 0,
      used: credit ? credit.used_credits : 0,
      available: credit ? credit.total_credits - credit.used_credits : 0,
    },
    payments: pays.map((x) => ({
      id: x.id,
      amount_cents: x.amount_cents,
      currency: x.currency,
      tier: x.tier,
      plan_id: x.plan_id,
      status: x.status,
      credits_granted: x.credits_granted,
      created_at: pyIso(x.created_at),
    })),
    orders: ordersData,
    campaigns: campaignRows,
    lead_summary: leadSummary,
  };
}

// ── GET /opened-emails ──────────────────────────────────────────────────────

export async function openedEmails(q: Query, p: { limit: number; offset: number }) {
  const [{ n: total }] = await q(`SELECT count(*) AS n FROM emails_sent WHERE open_count > 0`);
  const rows = await q(
    `SELECT es.id, es.campaign_id, es.to_email, es.subject, es.sent_at, es.first_opened_at, es.open_count, es.status,
       l.id AS l_id, l.name AS l_name, l.company AS l_company, u.id AS u_id, u.name AS u_name, u.email AS u_email
     FROM emails_sent es
     LEFT OUTER JOIN leads l ON l.id = es.lead_id
     LEFT OUTER JOIN campaigns c ON c.id = es.campaign_id
     LEFT OUTER JOIN candidates cd ON cd.id = c.candidate_id
     LEFT OUTER JOIN "user" u ON u.id = cd.user_id
     WHERE es.open_count > 0
     ORDER BY es.first_opened_at DESC NULLS LAST LIMIT $1 OFFSET $2`,
    [p.limit, p.offset],
  );
  return {
    total,
    emails: rows.map((r) => ({
      id: r.id,
      campaign_id: r.campaign_id,
      student_name: r.u_id != null ? r.u_name : "Unknown",
      student_email: r.u_id != null ? r.u_email : "",
      student_id: r.u_id != null ? r.u_id : null,
      lead_name: r.l_id != null ? r.l_name : "Unknown",
      lead_company: r.l_id != null ? r.l_company : "",
      to_email: r.to_email,
      subject: r.subject,
      sent_at: pyIso(r.sent_at),
      first_opened_at: pyIso(r.first_opened_at),
      open_count: r.open_count || 0,
      status: r.status,
    })),
  };
}

// ── GET /campaign/{id}/emails ───────────────────────────────────────────────

export async function campaignEmails(q: Query, campaignId: number) {
  const [c] = await q(`SELECT id, name, status, daily_limit, candidate_id FROM campaigns WHERE id = $1 LIMIT 1`, [campaignId]);
  if (!c) return null;
  const emails = await q(
    `SELECT id, lead_id, to_email, subject, body, status, assigned_style, sent_at, reply_text, reply_sentiment,
       reply_received_at, bounce_reason, error_message, first_opened_at, open_count
     FROM emails_sent WHERE campaign_id = $1 ORDER BY coalesce(scheduled_at, created_at) ASC`,
    [campaignId],
  );
  const leadIds = [...new Set(emails.map((e) => e.lead_id).filter((x) => truthy(x)))];
  const leads = new Map<number, Row>();
  if (leadIds.length) {
    for (const l of await q(`SELECT id, name, company, title FROM leads WHERE id = ANY($1::int[])`, [leadIds])) leads.set(l.id, l);
  }
  const [owner] = await q(
    `SELECT u.id, u.name, u.email FROM "user" u JOIN candidates cd ON cd.user_id = u.id WHERE cd.id = $1 LIMIT 1`,
    [c.candidate_id],
  );
  return {
    campaign: { id: c.id, name: c.name, status: c.status, daily_limit: c.daily_limit },
    owner: { id: owner ? owner.id : null, name: owner ? owner.name : "Unknown", email: owner ? owner.email : "" },
    emails: emails.map((e) => {
      const lead = truthy(e.lead_id) ? leads.get(e.lead_id) : undefined;
      return {
        id: e.id,
        lead_name: lead ? lead.name : "Unknown",
        lead_company: lead ? lead.company : "",
        lead_title: lead ? lead.title : "",
        to_email: e.to_email,
        subject: e.subject,
        body: e.body,
        status: e.status,
        assigned_style: e.assigned_style,
        sent_at: pyIso(e.sent_at),
        reply_text: e.reply_text,
        reply_sentiment: e.reply_sentiment,
        reply_received_at: pyIso(e.reply_received_at),
        bounce_reason: e.bounce_reason,
        error_message: e.error_message,
        first_opened_at: pyIso(e.first_opened_at),
        open_count: e.open_count || 0,
      };
    }),
  };
}

// ── GET /paid-funnel (Campaign Health) ──────────────────────────────────────

const FUNNEL_STAGE_COLS: [string, string][] = [
  ["resume_uploaded", "resume_uploaded_at"],
  ["quiz_completed", "quiz_completed_at"],
  ["leads_generated", "leads_generated_at"],
  ["gmail_connected", "gmail_connected_at"],
  ["email_style_selected", "email_style_selected_at"],
  ["campaign_launched", "campaign_launched_at"],
  ["campaign_paused", "campaign_paused_at"],
  ["campaign_completed", "campaign_completed_at"],
];
const CAMPAIGN_PRIORITY: Record<string, number> = { running: 0, paused: 1, completed: 2, cancelled: 3, draft: 4 };
const MIN_MICROS = -Infinity; // datetime.min

const AUTH_PATTERNS = [
  "%invalid authentication%",
  "%authError%",
  '%"code": 401%',
  "%Token refresh failed%",
  "%auth expired%",
  "%must reconnect%",
  "%insufficient authentication scopes%",
];
const AUTH_SQL = `(${AUTH_PATTERNS.map((_, i) => `error_message ILIKE $${i + 2}`).join(" OR ")})`;
const IS_INITIAL = `(followup_number IS NULL OR followup_number = 0)`;
const IS_FOLLOWUP = `(followup_number IS NOT NULL AND followup_number > 0)`;

function roundOrNull(v: unknown): number | null {
  return v !== null && v !== undefined ? pyRound(Number(v), 1) : null;
}

export async function paidFunnel(q: Query) {
  const pays = await q(
    `SELECT po.amount_cents, po.currency, po.created_at, u.id AS u_id, u.name AS u_name, u.email AS u_email
     FROM payment_orders po JOIN "user" u ON po.user_id = u.id
     WHERE po.status = 'paid' AND po.amount_cents > 0 AND po.provider != 'coupon' AND u.email <> ALL($1::text[])
     ORDER BY po.created_at ASC`,
    [FUNNEL_EXCL],
  );
  const buckets = new Map<string, { user: Row; payments: Row[] }>();
  for (const p of pays) {
    if (!buckets.has(p.u_id)) buckets.set(p.u_id, { user: { id: p.u_id, name: p.u_name, email: p.u_email }, payments: [] });
    buckets.get(p.u_id)!.payments.push(p);
  }

  const result: Row[] = [];
  for (const [userId, { user: u, payments: ps }] of buckets) {
    let firstPaid = ps[0].created_at;
    for (const p of ps) if (micros(p.created_at) < micros(firstPaid)) firstPaid = p.created_at;
    const totalPaid = ps.reduce((a, p) => a + p.amount_cents, 0);
    const currency = ps[0].currency;

    const orders = await q(`SELECT ${ORDER_COLS} FROM outreach_orders WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
    const stage: Record<string, string | null> = {};
    for (const [key, col] of FUNNEL_STAGE_COLS) {
      if (key === "campaign_paused" || key === "campaign_completed") {
        stage[key] = null;
        continue;
      }
      let best: string | null = null;
      for (const o of orders) {
        const v = o[col];
        if (v && (best === null || micros(v) < micros(best))) best = v;
      }
      stage[key] = best ? pyIso(best) : null;
    }

    const accounts = await q(`SELECT id, created_at FROM email_accounts WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
    const gmail = accounts.length > 0;
    if (gmail && !stage.gmail_connected) stage.gmail_connected = pyIso(accounts[0].created_at);

    const key = (c: Row) => (c.created_at ? micros(c.created_at) : MIN_MICROS);
    const all = (await campaignsForUser(q, userId))
      .map((c, i) => ({ c, i }))
      .sort((a, b) => key(a.c) - key(b.c) || a.i - b.i)
      .map((x) => x.c);

    if (all.length || gmail) {
      let earliestOrder: string | null = null;
      for (const o of orders) if (o.created_at && (earliestOrder === null || micros(o.created_at) < micros(earliestOrder))) earliestOrder = o.created_at;
      let earliestCampaign: Row | null = null;
      for (const c of all) if (earliestCampaign === null || key(c) < key(earliestCampaign)) earliestCampaign = c;
      if (earliestOrder) {
        for (const k of ["resume_uploaded", "quiz_completed", "leads_generated"]) if (!stage[k]) stage[k] = pyIso(earliestOrder);
      }
      if (earliestCampaign) {
        if (!stage.email_style_selected && earliestCampaign.created_at) stage.email_style_selected = pyIso(earliestCampaign.created_at);
        if (!stage.campaign_launched) {
          const ts = earliestCampaign.started_at || earliestCampaign.created_at;
          if (ts) stage.campaign_launched = pyIso(ts);
        }
      }
      for (const c of all) {
        if (c.paused_at && !stage.campaign_paused) stage.campaign_paused = pyIso(c.paused_at);
        if (c.completed_at && c.status === "completed" && !stage.campaign_completed) stage.campaign_completed = pyIso(c.completed_at);
      }
    }

    let best: Row | null = null;
    for (const c of all) {
      const pr = CAMPAIGN_PRIORITY[c.status] ?? 5;
      if (best === null || pr < (CAMPAIGN_PRIORITY[best.status] ?? 5)) best = c;
    }

    let campaignData: Row | null = null;
    if (best) {
      const cid = best.id;
      const stats = async (filt: string) =>
        statusMap(await q(`SELECT status, count(*) AS n FROM emails_sent WHERE campaign_id = $1 AND ${filt} GROUP BY status`, [cid]));
      const init = await stats(IS_INITIAL);
      const fups = await stats(IS_FOLLOWUP);
      const contacted = (init.sent ?? 0) + (init.replied ?? 0);
      const replied = init.replied ?? 0;
      const bounced = init.bounced ?? 0;
      const failed = init.failed ?? 0;
      const count = async (where: string, values: unknown[] = []) =>
        (await q(`SELECT count(*) AS n FROM emails_sent WHERE campaign_id = $1 AND ${where}`, [cid, ...values]))[0]?.n ?? 0;
      const queued = await count(`status IN ('queued', 'pending_enrichment') AND ${IS_INITIAL}`);
      const [{ m: lastSent }] = await q(`SELECT max(sent_at) AS m FROM emails_sent WHERE campaign_id = $1`, [cid]);
      const enrichment = await count(`status = 'failed' AND ${IS_INITIAL} AND error_message ILIKE '%enrichment failed%'`);
      const auth = await count(`status = 'failed' AND ${AUTH_SQL}`, AUTH_PATTERNS);
      const authRecent = await count(
        `status = 'failed' AND ${AUTH_SQL} AND coalesce(status_changed_at, created_at) > $${AUTH_PATTERNS.length + 2}`,
        [...AUTH_PATTERNS, new Date(Date.now() - 7 * 86_400_000).toISOString().replace("T", " ").replace("Z", "")],
      );
      const samples = (
        await q(
          `SELECT error_message FROM emails_sent WHERE campaign_id = $1 AND status = 'failed' AND error_message IS NOT NULL
           GROUP BY error_message ORDER BY count(*) DESC LIMIT 3`,
          [cid],
        )
      )
        .map((r) => r.error_message)
        .filter((x) => truthy(x));
      const [account] = best.email_account_id
        ? await q(`SELECT email_address, token_expiry FROM email_accounts WHERE id = $1 LIMIT 1`, [best.email_account_id])
        : [];
      const repBounce = await count(`replacement_reason = 'bounce'`);
      const repEnrich = await count(`replacement_reason = 'enrichment_exhausted'`);
      const initialLeads = await count(`replacement_for_id IS NULL AND (followup_number = 0 OR followup_number IS NULL)`);
      const cap = Math.ceil(initialLeads * 0.25);

      campaignData = {
        id: best.id,
        name: best.name,
        status: best.status,
        pause_reason: best.pause_reason,
        paused_by: best.paused_by,
        daily_limit: best.daily_limit,
        started_at: pyIso(best.started_at),
        gmail_account: account ? account.email_address : null,
        token_expiry: account && account.token_expiry ? pyIso(account.token_expiry) : null,
        stats: {
          leads_contacted: contacted,
          replied,
          bounced,
          failed,
          queued,
          reply_rate: contacted > 0 ? pyRound(((replied + (fups.replied ?? 0)) / contacted) * 100, 1) : 0,
          followups_sent: (fups.sent ?? 0) + (fups.replied ?? 0),
          followups_replied: fups.replied ?? 0,
          last_email_sent: pyIso(lastSent),
          failure_breakdown: {
            enrichment,
            auth,
            auth_last_7d: authRecent,
            other: Math.max(0, failed - enrichment - auth),
          },
          sample_errors: samples,
          replacements_bounce: repBounce,
          replacements_enrichment: repEnrich,
          replacement_cap_remaining: Math.max(0, cap - (repBounce + repEnrich)),
        },
      };
    }

    // Candidate: the first order (oldest) that has one; its lookup may find nothing.
    const withCand = orders.find((o) => truthy(o.candidate_id));
    const candidate = withCand
      ? (
          await q(
            `SELECT id, target_roles, target_industries, dream_companies, resume_profile, flex_notes FROM candidates
             WHERE id = $1 LIMIT 1`,
            [withCand.candidate_id],
          )
        )[0] ?? null
      : null;
    let profile: Row | null = null;
    let quality: Row | null = null;
    if (candidate) {
      profile = {
        target_roles: pyOr(candidate.target_roles, []),
        target_industries: pyOr(candidate.target_industries, []),
        dream_companies: pyOr(candidate.dream_companies, []),
        resume_profile: pyOr(candidate.resume_profile, {}),
        flex_notes: pyOr(candidate.flex_notes, {}),
      };
      const n = async (sql: string) => (await q(sql, [candidate.id]))[0]?.n ?? 0;
      const total = await n(`SELECT count(*) AS n FROM leads WHERE candidate_id = $1`);
      const withEmail = await n(`SELECT count(*) AS n FROM leads WHERE candidate_id = $1 AND email IS NOT NULL`);
      const verified = await n(`SELECT count(*) AS n FROM leads WHERE candidate_id = $1 AND email_verified = true`);
      const [agg] = await q(
        `SELECT avg(ls.overall_score) AS avg, avg(ls.title_relevance) AS avg_title, avg(ls.department_relevance) AS avg_dept,
           avg(ls.industry_relevance) AS avg_industry, avg(ls.seniority_relevance) AS avg_seniority,
           avg(ls.location_relevance) AS avg_location,
           sum(CASE WHEN ls.overall_score >= 80 THEN 1 ELSE 0 END) AS high,
           sum(CASE WHEN ls.overall_score >= 60 AND ls.overall_score < 80 THEN 1 ELSE 0 END) AS medium,
           sum(CASE WHEN ls.overall_score < 60 THEN 1 ELSE 0 END) AS low
         FROM lead_scores ls JOIN leads l ON l.id = ls.lead_id WHERE l.candidate_id = $1 LIMIT 1`,
        [candidate.id],
      );
      const industries = await q(
        `SELECT industry AS label, count(*) AS n FROM leads WHERE candidate_id = $1 AND industry IS NOT NULL
         GROUP BY industry ORDER BY count(*) DESC LIMIT 8`,
        [candidate.id],
      );
      const titles = await q(
        `SELECT title AS label, count(*) AS n FROM leads WHERE candidate_id = $1 AND title IS NOT NULL
         GROUP BY title ORDER BY count(*) DESC LIMIT 8`,
        [candidate.id],
      );
      quality = {
        total,
        with_email: withEmail,
        email_verified: verified,
        avg_score: roundOrNull(agg?.avg),
        score_breakdown: {
          title: agg ? roundOrNull(agg.avg_title) : null,
          department: agg ? roundOrNull(agg.avg_dept) : null,
          industry: agg ? roundOrNull(agg.avg_industry) : null,
          seniority: agg ? roundOrNull(agg.avg_seniority) : null,
          location: agg ? roundOrNull(agg.avg_location) : null,
        },
        score_distribution: {
          high: agg ? Math.trunc(agg.high || 0) : 0,
          medium: agg ? Math.trunc(agg.medium || 0) : 0,
          low: agg ? Math.trunc(agg.low || 0) : 0,
        },
        email_rate: total > 0 ? pyRound((withEmail / total) * 100, 1) : 0,
        verified_rate: withEmail > 0 ? pyRound((verified / withEmail) * 100, 1) : 0,
        top_industries: industries.map((r) => ({ label: r.label, count: r.n })),
        top_titles: titles.map((r) => ({ label: r.label, count: r.n })),
      };
    }

    const any = (s: string) => all.some((c) => c.status === s);
    let funnelStatus: string;
    if (any("completed") && !any("running") && !any("paused")) funnelStatus = "completed";
    else if (any("running")) funnelStatus = "running";
    else if (any("paused")) funnelStatus = "paused";
    else if (any("cancelled")) funnelStatus = "cancelled";
    else if (stage.campaign_launched) funnelStatus = "launched";
    else if (gmail) funnelStatus = "gmail_connected";
    else if (stage.leads_generated) funnelStatus = "leads_generated";
    else if (stage.resume_uploaded) funnelStatus = "resume_uploaded";
    else funnelStatus = "paid_only";

    result.push({
      user_id: userId,
      name: u.name,
      email: u.email,
      paid_at: pyIso(firstPaid),
      total_paid_cents: totalPaid,
      currency,
      gmail_connected: gmail,
      funnel_status: funnelStatus,
      stage_timestamps: stage,
      campaign: campaignData,
      profile,
      lead_quality: quality,
    });
  }
  // Most recently paid first; equal times keep their order (Python's stable reverse sort).
  result.sort((a, b) => (a.paid_at < b.paid_at ? 1 : a.paid_at > b.paid_at ? -1 : 0));
  return { users: result, total: result.length };
}
