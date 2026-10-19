/**
 * Authoritative per-user outreach funnel stages, straight from Postgres.
 *
 * The backend records a timestamp on outreach_orders the first time a user
 * reaches each funnel stage (services/stage_tracking.py → safe_mark_stage).
 * These are written server-side when the action actually happens, so unlike
 * the client-side PostHog events (pay_now_clicked, checkout_opened, …) they
 * can NEVER be lost to a redirect, an ad-blocker, or a closed tab.
 *
 * The journeys page uses this as the source of truth for the funnel dots and
 * only falls back to PostHog for things the DB doesn't have (attribution,
 * cross-product page visits, anonymous reach).
 *
 * `paid` (payment_made_at) means the order went through, not that money moved:
 * it is also set for 100% coupon orders and orders covered by credits, and the
 * earliest orders had every stage backfilled from created_at. Money comes from
 * /api/paid-emails (payment_orders).
 *
 * Registered in app/routes.ts since 19 Oct 2026. Before that this file was
 * never routed: every call returned 404 and the page silently used PostHog
 * events alone.
 *
 * GET /api/journeys  ->  { stages: { [email]: { resume, quiz_started, quiz_done,
 *                          leads, leads_viewed, payment_page, checkout, paid, gmail, launched } } }  // ISO strings, booleans or null
 *
 * `payment_page` is stamped when the pricing page opens (frontend
 * outreach.enrichment.tsx pings /orders/funnel/mark on mount), so it means
 * "saw pricing", not "tapped pay". `checkout` is the first payment_orders row
 * the backend created when the user tapped pay (create_order): the record of
 * tapping pay; the payment window can still fail to open after it. Two rows
 * written by hand (provider 'admin', or razorpay with no gateway order) are
 * not taps and are left out. `launched` is true once a campaign ran: a launch
 * paid with credits writes no payment row and no payment_made_at.
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.journeys";
import { requireAdmin } from "~/lib/auth-helper.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Collapse all of a user's orders into the earliest time they reached each
    // stage (a user can have more than one order).
    const res = await db.execute(sql`
      WITH checkout AS (
        SELECT user_id, MIN(created_at) AS at FROM payment_orders
        WHERE provider IN ('razorpay', 'dodo', 'coupon')
          AND (provider = 'coupon' OR razorpay_order_id IS NOT NULL OR dodo_checkout_id IS NOT NULL)
        GROUP BY user_id)
      SELECT lower(u.email) AS email,
        MIN(o.resume_uploaded_at)      AS resume,
        MIN(o.quiz_started_at)         AS quiz_started,
        MIN(o.quiz_completed_at)       AS quiz_done,
        MIN(o.leads_generated_at)      AS leads,
        MIN(o.leads_viewed_at)         AS leads_viewed, -- recorded since 27 Sep 2026 (UC-Q40)
        MIN(o.payment_page_reached_at) AS payment_page,
        MIN(c.at)                      AS checkout,
        MIN(o.payment_made_at)         AS paid,
        MIN(o.gmail_connected_at)      AS gmail,
        bool_or(o.campaign_launched_at IS NOT NULL OR o.status IN ('campaign_running', 'completed')) AS launched
      FROM outreach_orders o
      JOIN "user" u ON u.id = o.user_id
      LEFT JOIN checkout c ON c.user_id = u.id
      WHERE u.email IS NOT NULL
      GROUP BY lower(u.email)
    `);
    const stages: Record<string, any> = {};
    for (const r of res.rows as any[]) {
      if (!r.email) continue;
      stages[r.email] = {
        resume: r.resume, quiz_started: r.quiz_started, quiz_done: r.quiz_done,
        leads: r.leads, leads_viewed: r.leads_viewed, payment_page: r.payment_page, checkout: r.checkout, paid: r.paid, gmail: r.gmail, launched: !!r.launched,
      };
    }
    return Response.json({ stages });
  } catch (err: any) {
    return Response.json({ error: err.message, stages: {} }, { status: 500 });
  }
}
