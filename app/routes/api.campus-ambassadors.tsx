import type { Route } from "./+types/api.campus-ambassadors";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

// Returns null if the request is from an admin/ops user, otherwise a Response
// to return immediately.
async function requireAdmin(request: Request): Promise<Response | null> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const roleResult = await db.execute(
    sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`
  );
  const role = roleResult.rows[0]?.role as string | null;
  if (role !== "admin" && role !== "ops") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// The applicant review states. 'new' is the default assigned on insert by the
// public form; the rest are set from this panel.
const STATUSES = ["new", "shortlisted", "selected", "rejected"] as const;

// The public form creates this table lazily on first submit. Guard here so the
// admin page renders (showing zero) even before anyone has applied.
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS campus_ambassador_applications (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      email TEXT NOT NULL,
      college TEXT NOT NULL,
      course TEXT,
      year_of_study TEXT NOT NULL,
      graduation_year TEXT,
      social_handle TEXT,
      why_you TEXT NOT NULL,
      referral_source TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// POST { intent: "set-status", id, status } — move an applicant through triage.
export async function action({ request }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  await ensureTable();
  const body = await request.json().catch(() => ({}) as any);

  if (body.intent === "set-status") {
    const id = parseInt(body.id);
    const status = String(body.status ?? "");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    const result = await db.execute(sql`
      UPDATE campus_ambassador_applications SET status = ${status}
      WHERE id = ${id}
      RETURNING id, status
    `);
    if (result.rows.length === 0) {
      return Response.json({ error: "Applicant not found" }, { status: 404 });
    }
    return Response.json({ ok: true, applicant: result.rows[0] });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}

export async function loader({ request }: Route.LoaderArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  await ensureTable();

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 2000);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const [rows, statsResult] = await Promise.all([
    db.execute(sql`
      SELECT id, full_name, whatsapp, email, college, course,
             year_of_study, graduation_year, social_handle, why_you,
             referral_source, status, created_at
      FROM campus_ambassador_applications
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24_hours,
        COUNT(*) FILTER (WHERE status = 'new') AS new_count,
        COUNT(*) FILTER (WHERE status = 'shortlisted') AS shortlisted_count,
        COUNT(*) FILTER (WHERE status = 'selected') AS selected_count
      FROM campus_ambassador_applications
    `),
  ]);

  return Response.json({
    applicants: rows.rows,
    stats: statsResult.rows[0],
    limit,
    offset,
  });
}
