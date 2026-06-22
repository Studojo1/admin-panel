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
      referral_source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migrate older tables that predate later columns.
  await db.execute(sql`
    ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS referral_source TEXT
  `);
  await db.execute(sql`
    ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS webinar_id INTEGER
  `);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 2000);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  // List of webinars for the filter dropdown (active = 'upcoming' first).
  const webinarsResult = await db.execute(sql`
    SELECT id, title, status FROM webinars ORDER BY id DESC
  `);
  const webinars = webinarsResult.rows as { id: number; title: string; status: string }[];

  // Which webinar to show. Default: the active (upcoming) one, else the latest.
  const activeWebinar = webinars.find((w) => w.status === "upcoming") ?? webinars[0];
  const webinarParam = url.searchParams.get("webinar");
  const webinarId =
    webinarParam && webinarParam !== "all"
      ? parseInt(webinarParam)
      : webinarParam === "all"
        ? null
        : (activeWebinar?.id ?? null);

  const where =
    webinarId === null ? sql`TRUE` : sql`r.webinar_id = ${webinarId}`;

  const [rows, statsResult] = await Promise.all([
    db.execute(sql`
      SELECT r.id, r.full_name, r.whatsapp, r.email, r.college, r.course,
             r.specialisation, r.year_of_study, r.graduation_year, r.life_stage,
             r.referral_source, r.webinar_id, w.title AS webinar_title, r.created_at
      FROM webinar_registrations r
      LEFT JOIN webinars w ON w.id = r.webinar_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24_hours
      FROM webinar_registrations r
      WHERE ${where}
    `),
  ]);

  return Response.json({
    registrations: rows.rows,
    stats: statsResult.rows[0],
    webinars,
    selectedWebinar: webinarId === null ? "all" : webinarId,
    limit,
    offset,
  });
}
