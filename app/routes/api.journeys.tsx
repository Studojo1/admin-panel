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
 * GET /api/journeys  ->  { stages: { [email]: { resume, quiz_started, quiz_done,
 *                          leads, payment_page, paid, gmail } } }  // ISO strings or null
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
      SELECT lower(u.email) AS email,
        MIN(o.resume_uploaded_at)      AS resume,
        MIN(o.quiz_started_at)         AS quiz_started,
        MIN(o.quiz_completed_at)       AS quiz_done,
        MIN(o.leads_generated_at)      AS leads,
        MIN(o.payment_page_reached_at) AS payment_page,
        MIN(o.payment_made_at)         AS paid,
        MIN(o.gmail_connected_at)      AS gmail
      FROM outreach_orders o
      JOIN "user" u ON u.id = o.user_id
      WHERE u.email IS NOT NULL
      GROUP BY lower(u.email)
    `);
    const stages: Record<string, any> = {};
    for (const r of res.rows as any[]) {
      if (!r.email) continue;
      stages[r.email] = {
        resume: r.resume, quiz_started: r.quiz_started, quiz_done: r.quiz_done,
        leads: r.leads, payment_page: r.payment_page, paid: r.paid, gmail: r.gmail,
      };
    }
    return Response.json({ stages });
  } catch (err: any) {
    return Response.json({ error: err.message, stages: {} }, { status: 500 });
  }
}
