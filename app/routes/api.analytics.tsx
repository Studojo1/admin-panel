/**
 * Server-side analytics API — queries Postgres directly.
 * GET /api/analytics?type=signups_count&start=YYYY-MM-DD&end=YYYY-MM-DD
 * GET /api/analytics?type=signups_daily&start=YYYY-MM-DD&end=YYYY-MM-DD
 */

import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.analytics";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const start = url.searchParams.get("start"); // YYYY-MM-DD
  const end = url.searchParams.get("end");     // YYYY-MM-DD

  if (!start || !end) {
    return Response.json({ error: "start and end required" }, { status: 400 });
  }

  try {
    if (type === "signups_count") {
      // Total new users created in the date range
      const result = await db.execute(sql`
        SELECT count(*)::int AS count
        FROM "user"
        WHERE created_at >= ${start}::date
          AND created_at < (${end}::date + INTERVAL '1 day')
      `);
      const count = (result.rows[0] as any)?.count ?? 0;
      return Response.json({ count });
    }

    if (type === "signups_daily") {
      // New users per day in the date range
      const result = await db.execute(sql`
        SELECT date_trunc('day', created_at)::date::text AS day, count(*)::int AS signups
        FROM "user"
        WHERE created_at >= ${start}::date
          AND created_at < (${end}::date + INTERVAL '1 day')
        GROUP BY day
        ORDER BY day ASC
      `);
      return Response.json({ rows: result.rows });
    }

    return Response.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
