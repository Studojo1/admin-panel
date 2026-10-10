/**
 * Server-side signups and payments data from Postgres.
 * Queries directly — no dependency on outreach backend or JWT tokens.
 *
 * GET /api/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns: { count: number, payments: number, daily: [{day, signups, payments}] }
 * count is signups. payments is real money only (payment_orders).
 */

import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.analytics";
import { requireAdmin } from "~/lib/auth-helper.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!start || !end) {
    return Response.json({ error: "start and end required" }, { status: 400 });
  }

  try {
    // Bucket signups by IST day (created_at + 5.5h) to match the Funnel page and
    // the MSL dashboard, which are the authoritative IST-based counts. Previously
    // this used UTC DATE(created_at), which under/mis-counted "yesterday" by 5.5h.
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM "user"
      WHERE DATE(created_at + INTERVAL '5.5 hours') >= ${start}::date
        AND DATE(created_at + INTERVAL '5.5 hours') <= ${end}::date
    `);

    const dailyResult = await db.execute(sql`
      SELECT DATE(created_at + INTERVAL '5.5 hours') AS day, COUNT(*)::int AS signups
      FROM "user"
      WHERE DATE(created_at + INTERVAL '5.5 hours') >= ${start}::date
        AND DATE(created_at + INTERVAL '5.5 hours') <= ${end}::date
      GROUP BY day
      ORDER BY day ASC
    `);

    // Payments come from here, not from PostHog's payment_confirmed event: that
    // one also fires when credits cover the order, from two browser routes and
    // again from the server, so it counts clicks rather than money received.
    const paymentsResult = await db.execute(sql`
      SELECT DATE(created_at + INTERVAL '5.5 hours') AS day, COUNT(*)::int AS payments
      FROM payment_orders
      WHERE status IN ('paid', 'completed') AND amount_cents > 0
        AND DATE(created_at + INTERVAL '5.5 hours') >= ${start}::date
        AND DATE(created_at + INTERVAL '5.5 hours') <= ${end}::date
      GROUP BY day
      ORDER BY day ASC
    `);

    const count = (countResult.rows[0] as any)?.count ?? 0;

    // One row per day that has a signup or a payment.
    const dayStr = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
    const byDay = new Map<string, { day: string; signups: number; payments: number }>();
    const at = (d: unknown) => {
      const day = dayStr(d);
      if (!byDay.has(day)) byDay.set(day, { day, signups: 0, payments: 0 });
      return byDay.get(day)!;
    };
    for (const r of dailyResult.rows as any[]) at(r.day).signups = r.signups ?? 0;
    for (const r of paymentsResult.rows as any[]) at(r.day).payments = r.payments ?? 0;
    const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    const payments = daily.reduce((n, d) => n + d.payments, 0);

    return Response.json({ count, payments, daily });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
