/**
 * What is broken right now, for the "Needs attention" card on /daily.
 * Straight from Postgres, read only.
 *
 * GET /api/health-watch
 * Returns:
 *   discovery          orders stuck at generating leads (newest first, at most
 *                      50 listed), when a run last finished, how many finished
 *                      in the last 24 hours, and a state: ok, watch or failing
 *   paid_nothing_sent  customers who paid real money and have had no email
 *                      sent, with the reason, most recent payment first
 *
 * The state and the reason are decided in ~/lib/health-watch.
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import { discoveryState, nothingSentReason, type HealthWatch } from "~/lib/health-watch";

const num = (v: unknown) => Number(v ?? 0);

export async function loader({ request }: { request: Request }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Timestamps are stored as UTC without a time zone, so "now" is taken in
    // UTC too, and every time leaves SQL as ISO text ending in Z: a bare
    // timestamp carries no zone and the browser would read it as local time.
    const [stuck, done, paid] = await Promise.all([
      // Stuck: at generating leads for over 30 minutes and still no leads.
      // NOT EXISTS probes the candidate_id index once per order; leads holds
      // millions of rows and must never be counted or scanned here.
      db.execute(sql`
        SELECT o.id AS order_id, u.email,
               to_char(o.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS since,
               round((extract(epoch FROM (now() AT TIME ZONE 'utc') - o.updated_at) / 3600)::numeric, 1) AS hours,
               count(*) OVER ()::int AS stuck_count,
               to_char(min(o.updated_at) OVER (), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS stuck_since
        FROM outreach_orders o
        LEFT JOIN "user" u ON u.id = o.user_id
        WHERE o.status = 'leads_generating'
          AND o.updated_at < (now() AT TIME ZONE 'utc') - INTERVAL '30 minutes'
          AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.candidate_id = o.candidate_id)
        ORDER BY o.updated_at DESC
        LIMIT 50
      `),
      db.execute(sql`
        SELECT to_char(max(leads_generated_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_success_at,
               count(*) FILTER (
                 WHERE leads_generated_at > (now() AT TIME ZONE 'utc') - INTERVAL '24 hours')::int AS completed_24h
        FROM outreach_orders
      `),
      // One row per paying customer, on their most recent payment. Real money
      // only, as in /api/sources, and a fully refunded payment does not count.
      // "Nothing sent" means no real email on any campaign of any of their
      // resumes; test sends do not count.
      db.execute(sql`
        SELECT u.email,
               to_char(pay.paid_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS paid_at,
               pay.amount_cents / 100.0 AS amount,
               upper(pay.currency) AS currency,
               floor(extract(epoch FROM (now() AT TIME ZONE 'utc') - pay.paid_at) / 86400)::int AS days_since,
               coalesce(camp.running, false) AS running,
               coalesce(camp.paused_gmail_invalid, false) AS paused_gmail_invalid,
               coalesce(camp.paused, false) AS paused,
               camp.pause_reason,
               coalesce(camp.draft, false) AS draft,
               coalesce(camp.total, 0)::int AS campaigns,
               EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.user_id = u.id) AS mailbox
        FROM (
          SELECT DISTINCT ON (p.user_id) p.user_id, p.created_at AS paid_at, p.amount_cents, p.currency
          FROM payment_orders p
          WHERE p.status IN ('paid', 'completed') AND p.amount_cents > 0
            AND coalesce(p.refunded_cents, 0) < p.amount_cents
          ORDER BY p.user_id, p.created_at DESC, p.id DESC
        ) pay
        JOIN "user" u ON u.id = pay.user_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS total,
                 bool_or(cm.status = 'running') AS running,
                 bool_or(cm.status = 'paused') AS paused,
                 bool_or(cm.status = 'paused' AND ea.token_invalid_at IS NOT NULL) AS paused_gmail_invalid,
                 bool_or(cm.status = 'draft') AS draft,
                 (array_agg(cm.pause_reason ORDER BY cm.paused_at DESC NULLS LAST, cm.id DESC)
                    FILTER (WHERE cm.status = 'paused' AND cm.pause_reason IS NOT NULL))[1] AS pause_reason
          FROM candidates c
          JOIN campaigns cm ON cm.candidate_id = c.id
          LEFT JOIN email_accounts ea ON ea.id = cm.email_account_id
          WHERE c.user_id = u.id
        ) camp ON TRUE
        WHERE u.email NOT ILIKE '%@example.com' AND u.email NOT ILIKE '%studojo.test%'
          AND NOT EXISTS (
            SELECT 1
            FROM candidates c
            JOIN campaigns cm ON cm.candidate_id = c.id
            JOIN emails_sent e ON e.campaign_id = cm.id
            WHERE c.user_id = u.id AND e.sent_at IS NOT NULL AND e.is_test = false
          )
        ORDER BY pay.paid_at DESC
      `),
    ]);

    const stuckRows = stuck.rows as any[];
    const doneRow = (done.rows[0] ?? {}) as any;
    const paidRows = paid.rows as any[];

    // The window columns carry the same totals on every row, so the first row
    // has them even when more than 50 orders are stuck.
    const stuckCount = num(stuckRows[0]?.stuck_count);
    const stuckSince: string | null = stuckRows[0]?.stuck_since ?? null;
    const lastSuccessAt: string | null = doneRow.last_success_at ?? null;

    const body: HealthWatch = {
      discovery: {
        state: discoveryState(stuckCount, stuckSince, lastSuccessAt),
        stuck_count: stuckCount,
        stuck_since: stuckSince,
        stuck: stuckRows.map((r) => ({
          order_id: num(r.order_id),
          email: r.email ?? "",
          since: r.since,
          hours: num(r.hours),
        })),
        last_success_at: lastSuccessAt,
        completed_24h: num(doneRow.completed_24h),
      },
      paid_nothing_sent: {
        count: paidRows.length,
        rows: paidRows.map((r) => ({
          email: r.email,
          paid_at: r.paid_at,
          amount: num(r.amount),
          currency: r.currency,
          days_since: num(r.days_since),
          reason: nothingSentReason({
            running: r.running === true,
            pausedGmailInvalid: r.paused_gmail_invalid === true,
            paused: r.paused === true,
            pauseReason: r.pause_reason ?? null,
            draft: r.draft === true,
            campaigns: num(r.campaigns),
            mailbox: r.mailbox === true,
          }),
        })),
      },
    };
    return Response.json(body);
  } catch (err: any) {
    console.error("[health-watch]", err);
    return Response.json({ error: "Health watch query failed" }, { status: 500 });
  }
}
