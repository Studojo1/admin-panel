import type { Route } from "./+types/api.consultation-signups";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roleResult = await db.execute(
    sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`
  );
  const role = roleResult.rows[0]?.role as string | null;
  if (role !== "admin" && role !== "ops") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const [rows, statsResult] = await Promise.all([
    db.execute(sql`
      SELECT id, user_id, email, target_role, biggest_challenge, timeline, created_at
      FROM consultation_signups
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7_days,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
      FROM consultation_signups
    `),
  ]);

  return Response.json({ signups: rows.rows, stats: statsResult.rows[0], limit, offset });
}
