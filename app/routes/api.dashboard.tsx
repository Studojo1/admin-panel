/**
 * Daily analytics dashboard data, straight from Postgres.
 * (Visitors come from PostHog client-side; everything else is DB here.)
 *
 * GET /api/dashboard?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns: { daily: [{ day, signups, orders, emails, replies, paid }] }
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.dashboard";
import { requireAdmin } from "~/lib/auth-helper.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return Response.json({ error: "start and end required" }, { status: 400 });

  try {
    const q = async (query: any) => (await db.execute(query)).rows as any[];

    // Dates bucketed in IST (+5:30) so "today"/"yesterday" match the founder's day.
    const [signups, orders, emails, replies, paid, reached] = await Promise.all([
      q(sql`SELECT DATE(created_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM "user"
            WHERE DATE(created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`),
      q(sql`SELECT DATE(created_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM outreach_orders
            WHERE DATE(created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`),
      q(sql`SELECT DATE(sent_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM emails_sent
            WHERE sent_at IS NOT NULL AND is_test = false
              AND DATE(sent_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`),
      // Count distinct leads who replied (any sentiment) — deduped so one lead replying
      // to both initial and follow-up doesn't count twice.
      q(sql`SELECT DATE(reply_received_at + INTERVAL '330 minutes') AS day, COUNT(DISTINCT lead_id)::int AS n FROM emails_sent
            WHERE reply_received_at IS NOT NULL AND is_test = false
              AND DATE(reply_received_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`),
      q(sql`SELECT DATE(created_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM payment_orders
            WHERE status IN ('paid','completed')
              AND DATE(created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`),
      // Unique people reached = distinct leads who got an initial (non-followup) email.
      // Used as the denominator for reply rate so follow-ups don't dilute the %.
      q(sql`SELECT DATE(sent_at + INTERVAL '330 minutes') AS day, COUNT(DISTINCT lead_id)::int AS n FROM emails_sent
            WHERE sent_at IS NOT NULL AND is_test = false
              AND (followup_number = 0 OR followup_number IS NULL)
              AND DATE(sent_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`),
    ]);

    const map: Record<string, any> = {};
    const dayStr = (d: any) => String(d).split("T")[0];
    const blank = () => ({ day: "", signups: 0, orders: 0, emails: 0, replies: 0, paid: 0, reached: 0 });
    const add = (rows: any[], key: string) => {
      for (const r of rows) {
        const d = dayStr(r.day);
        (map[d] ??= { ...blank(), day: d })[key] = r.n ?? 0;
      }
    };
    add(signups, "signups"); add(orders, "orders"); add(emails, "emails"); add(replies, "replies"); add(paid, "paid"); add(reached, "reached");

    // fill every day in range so the dashboard has no gaps
    const out: any[] = [];
    for (let d = new Date(start + "T00:00:00Z"); dayStr(d.toISOString()) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = dayStr(d.toISOString());
      out.push(map[ds] ?? { ...blank(), day: ds });
    }
    return Response.json({ daily: out });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
