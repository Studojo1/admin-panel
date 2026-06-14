import type { Route } from "./+types/api.webinar-registrations";
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

  // The table is created lazily by the public form on first submit. Guard here
  // so the admin page works (shows zero) even before the first registration.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webinar_registrations (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      email TEXT NOT NULL,
      college TEXT NOT NULL,
      course TEXT NOT NULL,
      specialisation TEXT,
      year_of_study TEXT NOT NULL,
      graduation_year TEXT,
      life_stage TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 1000);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const [rows, statsResult] = await Promise.all([
    db.execute(sql`
      SELECT id, full_name, whatsapp, email, college, course,
             specialisation, year_of_study, graduation_year, life_stage, created_at
      FROM webinar_registrations
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24_hours
      FROM webinar_registrations
    `),
  ]);

  return Response.json({ registrations: rows.rows, stats: statsResult.rows[0], limit, offset });
}
