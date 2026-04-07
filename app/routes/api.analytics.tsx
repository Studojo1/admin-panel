/**
 * Server-side signups data from Postgres user table.
 * Queries directly — no dependency on outreach backend or JWT tokens.
 *
 * GET /api/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns: { count: number, daily: [{day, signups}] }
 */

import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.analytics";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!start || !end) {
    return Response.json({ error: "start and end required" }, { status: 400 });
  }

  try {
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM "user"
      WHERE DATE(created_at) >= ${start}::date
        AND DATE(created_at) <= ${end}::date
    `);

    const dailyResult = await db.execute(sql`
      SELECT DATE(created_at) AS day, COUNT(*)::int AS signups
      FROM "user"
      WHERE DATE(created_at) >= ${start}::date
        AND DATE(created_at) <= ${end}::date
      GROUP BY day
      ORDER BY day ASC
    `);

    const count = (countResult.rows[0] as any)?.count ?? 0;
    const daily = (dailyResult.rows as any[]).map((r) => ({
      day: String(r.day).split("T")[0],
      signups: r.signups ?? 0,
    }));

    return Response.json({ count, daily });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
