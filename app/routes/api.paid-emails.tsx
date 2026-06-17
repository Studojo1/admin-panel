/**
 * Authoritative list of emails that have ever paid (payment_orders).
 * PostHog's payment_confirmed event is unreliable for historical payers,
 * so the journeys page uses this to mark "Converted".
 *
 * GET /api/paid-emails  ->  { emails: string[] }
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.paid-emails";

export async function loader(_: Route.LoaderArgs) {
  try {
    const res = await db.execute(sql`
      SELECT DISTINCT lower(u.email) AS email
      FROM payment_orders p
      JOIN "user" u ON u.id = p.user_id
      WHERE p.status IN ('paid', 'completed') AND u.email IS NOT NULL
    `);
    const emails = (res.rows as any[]).map((r) => r.email).filter(Boolean);
    return Response.json({ emails });
  } catch (err: any) {
    return Response.json({ error: err.message, emails: [] }, { status: 500 });
  }
}
