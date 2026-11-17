// Server side of /email-funnel (model.ts has the rules and the words). Read only: one transaction with a short
// statement timeout, every read filtered by time on an indexed column (career_daily_sends_email_sent on sent_at for the
// email rows, career_journey_events (step, at), the inbound email messages by channel), the people limited to those
// Stu emailed in the range. Internal accounts are flagged the Stu pages' way (data.server.ts internalReason and
// testUsers); an address leaves this file only masked. The new tables (career_email_events, career_email_skips,
// career_email_placements, from the career-agent builder) are read only when they exist here (to_regclass), so the page
// reads the ledger alone until they ship.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { swrCache } from "~/lib/swr-cache";
import { internalReason, testUsers } from "~/lib/stu/data.server";
import {
  type EmailEnvelope, type EmailInput, type EmailRowIn, type EventIn, type GoalIn, type PayIn, type PlacementIn, type PrefIn, type RangeDays,
  type ReplyIn, type SkipIn, type WaUserIn,
  TREND_DAYS, buildEmail, kindOf, maskEmail, rangeFrom,
} from "./model";

const S = "career_agent";
const NEW_TABLES = ["career_email_events", "career_email_skips", "career_email_placements"];
const TABLES = [
  "career_daily_sends", ...NEW_TABLES, "career_email_prefs", "career_email_inbound", "career_channel_messages", "career_journey_events",
  "career_credit_orders", "career_plans", "career_plan_grants", "career_subscriptions", "career_mail_accounts",
];
const COLS = [
  "career_credit_orders.refunded_paise", "career_credit_orders.razorpay_payment_id", "career_plan_grants.subscription_id",
  "career_subscriptions.razorpay_subscription_id", "career_subscriptions.test", "career_mail_accounts.test",
];
const ms = (x: string) => sql.raw(`(extract(epoch from ${x}) * 1000)::float8`);
/** Stu's email rows (alias d): not a dry run, not a touch row. */
const EMAIL_ROW = (d: string) => sql.raw(`${d}.channel = 'email' AND ${d}.kind <> 'inbound' AND COALESCE(${d}.meta->>'dry', '') <> 'true'`);
/** The students Stu emailed since `from` (an indexed read of the email rows). */
const EMAILED = (from: string) => sql`(SELECT DISTINCT x.user_id FROM career_agent.career_daily_sends x WHERE x.channel = 'email' AND x.sent_at >= ${from}::timestamptz)`;
const GOAL_STEPS = sql.raw(`('job_saved', 'outreach_started', 'call_started', 'desk_opened', 'mailbox_connected')`);

async function read<T>(fn: (q: (s: SQL) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

/** A report under 3 minutes old is served as is; up to 10 minutes old it is served at once and rebuilt in the background. */
const reports = swrCache<EmailEnvelope>({
  freshMs: 3 * 60_000, maxStaleMs: 10 * 60_000, max: 6,
  onError: (k, err) => console.error("[email-funnel] background rebuild failed, serving the last copy", k, err),
});

export async function emailReport(days: RangeDays, team: boolean, fresh: boolean): Promise<EmailEnvelope> {
  const t0 = Date.now();
  const out = await reports.get(`${days}|${team ? "team" : "students"}`, () => buildEnvelope(days, team), fresh);
  return { ...out, ms: Date.now() - t0 };
}

async function buildEnvelope(days: RangeDays, team: boolean): Promise<EmailEnvelope> {
  const t0 = Date.now();
  const r = await read((q) => readRows(q, days));
  const report = buildEmail({ ...r.input, team });
  return { report, generatedAt: new Date().toISOString(), env: r.env, ms: Date.now() - t0, waiting: r.waiting, missing: r.missing };
}

interface Read {
  env: string;
  missing: boolean;
  waiting: string[];
  input: Omit<EmailInput, "team">;
}

async function readRows(q: (s: SQL) => Promise<any[]>, days: RangeDays): Promise<Read> {
  const reg = (await q(sql`
    SELECT current_database() AS db, (extract(epoch from now()) * 1000)::float8 AS now,
           array(SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = ${S} AND c.relname = ANY(string_to_array(${TABLES.join(",")}, ','))
                    AND has_table_privilege(c.oid, 'SELECT')) AS have,
           array(SELECT table_name || '.' || column_name FROM information_schema.columns
                  WHERE table_schema = ${S} AND (table_name || '.' || column_name) = ANY(string_to_array(${COLS.join(",")}, ','))) AS cols`))[0] ?? {};
  const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : "production";
  const now = Number(reg.now) || Date.now();
  const have = new Set<string>(Array.isArray(reg.have) ? reg.have : []);
  const col = new Set<string>(Array.isArray(reg.cols) ? reg.cols : []);
  const live = { events: have.has("career_email_events"), skips: have.has("career_email_skips"), placements: have.has("career_email_placements") };
  const waiting = NEW_TABLES.filter((t) => !have.has(t));
  const input: Read["input"] = {
    now, days, live, eventsSince: null, internal: {},
    rows: [], events: [], skips: [], placements: [], goals: [], pays: [], replies: [], prefs: [], wa: [], inbound: [],
  };
  if (!have.has("career_daily_sends")) return { env, missing: true, waiting, input };

  // The range (IST days to now) and what is read back: at least the trend's 14 days.
  const fromMs = rangeFrom(now, days);
  const readMs = Math.min(fromMs, rangeFrom(now, TREND_DAYS));
  const from = new Date(fromMs).toISOString();
  const readFrom = new Date(readMs).toISOString();
  const tests = testUsers();
  const people = new Map<string, { email: string | null; role: string | null }>();
  const person = (r: any) => {
    const id = String(r.user_id);
    if (!people.has(id)) people.set(id, { email: r.email ?? null, role: r.role ?? null });
    return id;
  };

  const rows = await q(sql`
    SELECT d.id::float8 AS id, d.user_id, d.local_day::text AS day, d.kind, d.meta->>'email_kind' AS email_kind,
           ${ms("d.sent_at")} AS sent_at, ${ms("d.delivered_at")} AS delivered_at, ${ms("d.read_at")} AS read_at, ${ms("d.tapped_at")} AS tapped_at,
           d.meta ? 'acs_id' AS taken,
           CASE WHEN jsonb_typeof(d.meta->'opens') = 'number' THEN (d.meta->>'opens')::float8 ELSE 0 END AS opens,
           COALESCE(d.meta->>'failed', '') = 'true' AS failed, COALESCE(d.meta->>'bounced', '') = 'true' AS bounced,
           COALESCE(d.meta->>'team', '') = 'true' AS team, COALESCE(d.meta->>'floor', '') = 'true' AS floor,
           COALESCE(d.meta->>'via', '') = 'google' OR COALESCE(d.meta->>'acs_id', '') LIKE 'google:%' AS google,
           left(d.meta->>'key', 160) AS key, u.email, u.role
      FROM career_agent.career_daily_sends d LEFT JOIN public."user" u ON u.id = d.user_id
     WHERE d.sent_at >= ${readFrom}::timestamptz AND ${EMAIL_ROW("d")}
     ORDER BY d.sent_at DESC
     LIMIT 60000`);
  input.rows = rows.map((r): EmailRowIn => ({
    id: Number(r.id), user: person(r), day: String(r.day), kind: kindOf(r.email_kind, r.kind, Boolean(r.floor)), key: r.key ?? null,
    sentAt: Number(r.sent_at), taken: Boolean(r.taken),
    deliveredAt: r.delivered_at == null ? null : Number(r.delivered_at), readAt: r.read_at == null ? null : Number(r.read_at),
    tappedAt: r.tapped_at == null ? null : Number(r.tapped_at), opens: Number(r.opens) || 0,
    failed: Boolean(r.failed), bounced: Boolean(r.bounced), team: Boolean(r.team), via: r.google ? "google" : "acs", to: maskEmail(r.email),
  }));

  if (live.events) {
    // Every open, tap, reply, bounce and unsubscribe as a row; read as one line per email, event and detail. The detail
    // is kept only where it is a short code (how an open was seen, the link tapped, the unsubscribe's mode); a job's
    // link is "j". A delivery event's detail (a status and a reason) is never read.
    const first = await q(sql`SELECT ${ms("at")} AS at FROM career_agent.career_email_events ORDER BY id LIMIT 1`);
    input.eventsSince = first[0]?.at == null ? null : Number(first[0].at);
    const ev = await q(sql`
      SELECT e.row_id::float8 AS row, e.event,
             CASE WHEN e.event = 'tapped' AND e.detail ~ '^j[0-9]' THEN 'j'
                  WHEN e.event IN ('opened', 'tapped', 'unsubscribed', 'resubscribed') THEN left(COALESCE(e.detail, ''), 24)
                  ELSE '' END AS detail,
             count(*)::int AS n, ${ms("min(e.at)")} AS first, ${ms("max(e.at)")} AS last, max(left(e.sender, 120)) AS sender
        FROM career_agent.career_email_events e
       WHERE e.at >= ${readFrom}::timestamptz AND e.row_id IS NOT NULL
       GROUP BY 1, 2, 3
       LIMIT 200000`);
    input.events = ev.map((r): EventIn => ({
      row: Number(r.row), event: String(r.event), detail: r.detail || null, n: Number(r.n) || 0, first: Number(r.first), last: Number(r.last), sender: r.sender ?? null,
    }));
  }

  if (live.skips) {
    // Why a due email was not sent: one per local day, kind and student, the latest reason.
    const sk = await q(sql`
      SELECT DISTINCT ON (s.local_day, s.kind, s.user_id) s.local_day::text AS day, s.kind, s.user_id, left(s.reason, 40) AS reason,
             ${ms("s.at")} AS at, u.email, u.role
        FROM career_agent.career_email_skips s LEFT JOIN public."user" u ON u.id = s.user_id
       WHERE s.at >= ${from}::timestamptz
       ORDER BY s.local_day, s.kind, s.user_id, s.at DESC
       LIMIT 200000`);
    input.skips = sk.map((r): SkipIn => ({ day: String(r.day), kind: String(r.kind ?? ""), user: person(r), reason: String(r.reason ?? "other"), at: Number(r.at) }));
  }

  if (live.placements) {
    const pl = await q(sql`
      SELECT p.id::float8 AS id, p.day::text AS day, p.kind, p.via, left(p.sender, 120) AS sender, p.seed, left(p.status, 40) AS status,
             left(p.placement, 20) AS placement, ${ms("p.sent_at")} AS sent_at, ${ms("p.placed_at")} AS placed_at
        FROM career_agent.career_email_placements p
       ORDER BY p.id DESC
       LIMIT 3000`);
    input.placements = pl.map((r): PlacementIn => ({
      id: Number(r.id), day: String(r.day ?? ""), kind: kindOf(r.kind, r.kind), via: r.via ?? null, sender: r.sender ?? null, seed: maskEmail(r.seed),
      status: r.status ?? null, placement: r.placement ?? null, sentAt: r.sent_at == null ? null : Number(r.sent_at), placedAt: r.placed_at == null ? null : Number(r.placed_at),
    }));
  }

  // Acted: the goal steps of the students Stu emailed in the range (desk_opened only from an email link), and their
  // mailboxes connected (a reconnect sets verified_at again). Test and dry-run rows left out, as the Stu pages do.
  if (have.has("career_journey_events")) {
    const g = await q(sql`
      SELECT e.user_id, e.step, ${ms("e.at")} AS at
        FROM career_agent.career_journey_events e
       WHERE e.step IN ${GOAL_STEPS} AND e.at >= ${from}::timestamptz AND e.user_id IN ${EMAILED(from)}
         AND (e.step <> 'desk_opened' OR e.props->>'utm_source' = 'email')
         AND COALESCE(e.props->>'test', '') NOT IN ('true', '1') AND COALESCE(e.props->>'dry_run', '') NOT IN ('true', '1')
       LIMIT 300000`);
    input.goals.push(...g.map((r): GoalIn => ({ user: String(r.user_id), step: String(r.step), at: Number(r.at) })));
  }
  if (have.has("career_mail_accounts")) {
    const notTest = col.has("career_mail_accounts.test") ? sql.raw("AND NOT a.test") : sql.raw("");
    const mb = await q(sql`
      SELECT a.user_id, ${ms("a.verified_at")} AS at FROM career_agent.career_mail_accounts a
       WHERE a.verified_at >= ${from}::timestamptz AND a.user_id IN ${EMAILED(from)} ${notTest}
       LIMIT 50000`);
    input.goals.push(...mb.map((r): GoalIn => ({ user: String(r.user_id), step: "mailbox_connected", at: Number(r.at) })));
  }

  // Paid: money in, the Stu pages' rule (data.server.ts): a credit order paid, not a test, less refunds above zero; a
  // plan not a test or a grant; an autopay charge not refunded on a real subscription and not also an order.
  const pays: string[] = [];
  const refunded = col.has("career_credit_orders.refunded_paise") ? "coalesce(refunded_paise, 0)" : "0";
  if (have.has("career_credit_orders"))
    pays.push(`SELECT user_id, coalesce(paid_at, created_at) AS at FROM ${S}.career_credit_orders WHERE status IN ('paid', 'refunded') AND NOT test AND (amount_paise - ${refunded}) > 0`);
  if (have.has("career_plans")) pays.push(`SELECT user_id, updated_at AS at FROM ${S}.career_plans WHERE plan <> 'free' AND source <> ALL(ARRAY['test', 'grant']::text[])`);
  if (have.has("career_plan_grants") && have.has("career_subscriptions") && col.has("career_plan_grants.subscription_id")
    && col.has("career_subscriptions.razorpay_subscription_id") && col.has("career_subscriptions.test")) {
    const notOrder = have.has("career_credit_orders") && col.has("career_credit_orders.razorpay_payment_id")
      ? ` AND NOT EXISTS (SELECT 1 FROM ${S}.career_credit_orders o WHERE o.razorpay_payment_id = g.payment_id)` : "";
    pays.push(`SELECT g.user_id, g.created_at AS at FROM ${S}.career_plan_grants g JOIN ${S}.career_subscriptions s ON s.razorpay_subscription_id = g.subscription_id
                WHERE g.source = 'autopay' AND g.payment_id IS NOT NULL AND g.revoked_at IS NULL AND NOT s.test${notOrder}`);
  }
  if (pays.length) {
    const p = await q(sql`
      SELECT x.user_id, ${ms("x.at")} AS at FROM (${sql.raw(pays.join(" UNION ALL "))}) x
       WHERE x.at >= ${from}::timestamptz AND x.user_id IN ${EMAILED(from)}
       LIMIT 50000`);
    input.pays = p.map((r): PayIn => ({ user: String(r.user_id), at: Number(r.at) }));
  }

  // Replies: a student's own emails to Stu (kept like WhatsApp's messages). Only their time and who.
  if (have.has("career_channel_messages")) {
    const rp = await q(sql`
      SELECT m.user_id, ${ms("m.created_at")} AS at FROM career_agent.career_channel_messages m
       WHERE m.channel = 'email' AND m.direction = 'in' AND m.user_id IS NOT NULL AND m.created_at >= ${readFrom}::timestamptz
       LIMIT 50000`);
    input.replies = rp.map((r): ReplyIn => ({ user: String(r.user_id), at: Number(r.at) }));
  }

  if (have.has("career_email_prefs")) {
    const pf = await q(sql`
      SELECT user_id, ${ms("unsubscribed_at")} AS unsub, ${ms("complained_at")} AS complained FROM career_agent.career_email_prefs
       WHERE unsubscribed_at >= ${from}::timestamptz OR complained_at >= ${from}::timestamptz
       LIMIT 50000`);
    input.prefs = pf.map((r): PrefIn => ({
      user: String(r.user_id), unsubAt: r.unsub == null ? null : Number(r.unsub), complainedAt: r.complained == null ? null : Number(r.complained),
    }));
  }

  // WhatsApp's business messages in the range, per student (the reach rule's rows: not inbound, not a dry run).
  const wa = await q(sql`
    SELECT d.user_id, u.email, u.role,
           count(*) FILTER (WHERE COALESCE(d.meta->>'failed', '') <> 'true' OR d.delivered_at IS NOT NULL)::int AS sent,
           count(*) FILTER (WHERE d.delivered_at IS NOT NULL)::int AS delivered,
           count(*) FILTER (WHERE d.delivered_at IS NOT NULL AND d.read_at IS NOT NULL)::int AS read,
           count(*) FILTER (WHERE d.delivered_at IS NOT NULL AND d.tapped_at IS NOT NULL)::int AS tapped
      FROM career_agent.career_daily_sends d LEFT JOIN public."user" u ON u.id = d.user_id
     WHERE d.channel = 'whatsapp' AND d.kind <> 'inbound' AND COALESCE(d.meta->>'dry', '') <> 'true' AND d.sent_at >= ${from}::timestamptz
     GROUP BY 1, 2, 3
     LIMIT 50000`);
  input.wa = wa.map((r): WaUserIn => ({
    user: person(r), sent: Number(r.sent) || 0, delivered: Number(r.delivered) || 0, read: Number(r.read) || 0, tapped: Number(r.tapped) || 0,
  }));

  // What came back to Stu's inbox: claims only (never a sender or words), every sender.
  if (have.has("career_email_inbound")) {
    const ib = await q(sql`SELECT left(outcome, 30) AS outcome, count(*)::int AS n FROM career_agent.career_email_inbound WHERE at >= ${from}::timestamptz GROUP BY 1`);
    input.inbound = ib.map((r) => ({ outcome: String(r.outcome ?? ""), n: Number(r.n) || 0 }));
  }

  for (const [id, p] of people) {
    const why = internalReason({ id, email: p.email, role: p.role }, tests);
    if (why) input.internal[id] = why;
  }
  return { env, missing: false, waiting, input };
}
