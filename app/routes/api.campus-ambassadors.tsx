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
  // Attribution, added after the table shipped. The public form writes these;
  // rows created before the change carry NULL and render as "Not specified".
  await db.execute(sql`
    ALTER TABLE campus_ambassador_applications
      ADD COLUMN IF NOT EXISTS source_path TEXT,
      ADD COLUMN IF NOT EXISTS utm_source TEXT,
      ADD COLUMN IF NOT EXISTS utm_medium TEXT,
      ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
      ADD COLUMN IF NOT EXISTS referrer TEXT
  `);
  // The referral code an ambassador hands out. Minted when they are selected;
  // registrants type it on the webinar page for a discount, and it is what
  // credits the signup back to them.
  await db.execute(sql`
    ALTER TABLE campus_ambassador_applications
      ADD COLUMN IF NOT EXISTS ref_code TEXT
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campus_ambassador_ref_code_unique
    ON campus_ambassador_applications (upper(ref_code))
    WHERE ref_code IS NOT NULL
  `);
  // The webinar tables belong to the public site, which creates them on first
  // registration. This panel reads them to show what each ambassador brought
  // in, so it has to cope with them not existing yet — otherwise the page 500s
  // on a fresh database instead of showing an empty list.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webinar_registrations (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    ALTER TABLE webinar_registrations
      ADD COLUMN IF NOT EXISTS ambassador_id INTEGER,
      ADD COLUMN IF NOT EXISTS amount_paise INTEGER,
      ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE
  `);
}

/**
 * Give an ambassador a referral code, if they do not have one already.
 *
 * Idempotent on purpose: someone moved to 'selected', back to 'shortlisted' and
 * to 'selected' again keeps their original code, so a code already printed on a
 * poster or sent to a WhatsApp group never stops working.
 *
 * The code is their first name plus two digits — short enough to read out and
 * recognisably theirs. On a collision we try a different suffix.
 */
async function ensureRefCode(applicationId: number): Promise<string | null> {
  const existing = await db.execute(sql`
    SELECT ref_code, full_name FROM campus_ambassador_applications
    WHERE id = ${applicationId} LIMIT 1
  `);
  const row = existing.rows[0] as
    | { ref_code: string | null; full_name: string }
    | undefined;
  if (!row) return null;
  if (row.ref_code) return row.ref_code;

  // Letters only: a name like "Anu R." must not put a dot in a code that
  // travels through URLs and gets read aloud.
  const firstName = (row.full_name || "")
    .trim()
    .split(/\s+/)[0]
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 10);
  const stem = firstName || "STUDOJO";

  for (let attempt = 0; attempt < 12; attempt++) {
    const suffix = String(Math.floor(Math.random() * 90) + 10); // 10–99
    const candidate = `${stem}${suffix}`;
    // WHERE ref_code IS NULL means a concurrent assignment wins rather than
    // being overwritten — a published code must never change under someone.
    const res = await db.execute(sql`
      UPDATE campus_ambassador_applications
      SET ref_code = ${candidate}
      WHERE id = ${applicationId}
        AND ref_code IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM campus_ambassador_applications
          WHERE upper(ref_code) = ${candidate}
        )
      RETURNING ref_code
    `);
    if (res.rows.length > 0) return (res.rows[0] as { ref_code: string }).ref_code;

    const recheck = await db.execute(sql`
      SELECT ref_code FROM campus_ambassador_applications WHERE id = ${applicationId} LIMIT 1
    `);
    const got = (recheck.rows[0] as { ref_code: string | null } | undefined)?.ref_code;
    if (got) return got;
  }
  return null;
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
    // Selecting an ambassador is what mints their referral code, so it is ready
    // to hand over the moment they are told they are in.
    let refCode: string | null = null;
    if (status === "selected") {
      refCode = await ensureRefCode(id);
    }
    return Response.json({ ok: true, applicant: result.rows[0], refCode });
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
    // The webinar counts come from a LEFT JOIN on a subquery rather than a
    // join onto the registrations table directly, so an ambassador with no
    // signups still appears (with zeroes) instead of dropping out of the list.
    db.execute(sql`
      SELECT a.id, a.full_name, a.whatsapp, a.email, a.college, a.course,
             a.year_of_study, a.graduation_year, a.social_handle, a.why_you,
             a.referral_source, a.status, a.ref_code, a.created_at,
             a.source_path, a.utm_source, a.utm_medium, a.utm_campaign, a.referrer,
             COALESCE(w.registrations, 0) AS webinar_registrations,
             COALESCE(w.paid_count, 0)    AS webinar_paid,
             COALESCE(w.revenue_paise, 0) AS webinar_revenue_paise
      FROM campus_ambassador_applications a
      LEFT JOIN (
        SELECT ambassador_id,
               COUNT(*)                                            AS registrations,
               COUNT(*) FILTER (WHERE paid)                        AS paid_count,
               COALESCE(SUM(amount_paise) FILTER (WHERE paid), 0)  AS revenue_paise
        FROM webinar_registrations
        WHERE ambassador_id IS NOT NULL
        GROUP BY ambassador_id
      ) w ON w.ambassador_id = a.id
      ORDER BY a.created_at DESC
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
