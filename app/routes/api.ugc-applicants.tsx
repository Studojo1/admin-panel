import type { Route } from "./+types/api.ugc-applicants";
import { adminOnly } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

// Applications to the Creator Program (LinkedIn UGC). The public form on
// studojo.com/creators writes the rows; this route lists them for the team and
// saves the review status and team notes.

// The review states. 'new' is the default assigned on insert by the public
// form; the rest are set from this panel.
const STATUSES = ["new", "shortlisted", "selected", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const isStatus = (value: string): value is Status =>
  (STATUSES as readonly string[]).includes(value);

const NOTES_MAX = 2000;

// Ids are SERIAL, so a positive int4. Anything else can never match a row, and
// passing it on would make Postgres fail with "out of range" instead of a 400.
function parseId(value: unknown): number | null {
  const id =
    typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

// The public form creates this table on first submit (frontend
// app/lib/ugc-application.server.ts). Same definition here so the page works,
// showing zero, before anyone has applied. Keep the two in step.
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_applications (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      college TEXT NOT NULL,
      course TEXT NOT NULL,
      year_of_study TEXT NOT NULL,
      graduation_year TEXT,
      city TEXT,
      linkedin_url TEXT NOT NULL,
      followers TEXT NOT NULL,
      post_frequency TEXT NOT NULL,
      last_posted TEXT NOT NULL,
      best_post_url TEXT,
      crossed_1k TEXT,
      field TEXT NOT NULL,
      target_roles TEXT NOT NULL,
      dream_companies TEXT,
      looking_for TEXT NOT NULL,
      topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      avoid_topics TEXT,
      story_work TEXT,
      story_setback TEXT,
      story_lesson TEXT,
      tone TEXT,
      can_commit TEXT NOT NULL,
      studojo_ok TEXT NOT NULL,
      why_join TEXT NOT NULL,
      referral_source TEXT,
      referred_by TEXT,
      consent_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      team_notes TEXT,
      source_path TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      referrer TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // One application per email, enforced by the database.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ugc_applications_email_unique
    ON ugc_applications (lower(email))
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ugc_applications_created_at
    ON ugc_applications (created_at DESC)
  `);
  tableReady = true;
}

// How many applicants are in each status, for the header. The four review
// states are always present, so the page can show a zero.
async function statusCounts() {
  const result = await db.execute(sql`
    SELECT status,
           COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last_24_hours
    FROM ugc_applications
    GROUP BY status
  `);
  const rows = result.rows as { status: string; count: number; last_24_hours: number }[];
  return {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    last_24_hours: rows.reduce((sum, r) => sum + r.last_24_hours, 0),
    by_status: Object.fromEntries([
      ...STATUSES.map((s): [string, number] => [s, 0]),
      ...rows.map((r): [string, number] => [r.status, r.count]),
    ]),
  };
}

// The driver returns timestamptz as Postgres text ("2026-10-26 13:48:53.62+00").
// Send ISO 8601 instead, so every browser and spreadsheet reads it the same way.
function isoTime(value: unknown): string | null {
  if (value == null) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

// topics is a JSONB array of labels, which the driver parses. A row edited by
// hand into some other shape shows no topics rather than breaking the page.
function topicList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
}

// POST { intent: "set-status", id, status }: move an applicant through review.
// POST { intent: "set-notes", id, notes }: save the team's notes on an applicant.
export async function action({ request }: Route.ActionArgs) {
  const denied = await adminOnly(request);
  if (denied) return denied;
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  await ensureTable();
  const parsed = await request.json().catch(() => null);
  const body: Record<string, unknown> = parsed && typeof parsed === "object" ? parsed : {};

  if (body.intent === "set-status") {
    const id = parseId(body.id);
    const status = String(body.status ?? "");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    if (!isStatus(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    const result = await db.execute(sql`
      UPDATE ugc_applications SET status = ${status}
      WHERE id = ${id}
      RETURNING id, status
    `);
    if (result.rows.length === 0) {
      return Response.json({ error: "Applicant not found" }, { status: 404 });
    }
    // Fresh counts, so the header stays right without reloading every row.
    return Response.json({ ok: true, applicant: result.rows[0], counts: await statusCounts() });
  }

  if (body.intent === "set-notes") {
    const id = parseId(body.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    // A missing notes field is an error rather than "clear the notes"; clearing
    // is sending an empty string (or null).
    if (typeof body.notes !== "string" && body.notes !== null) {
      return Response.json({ error: "notes must be text" }, { status: 400 });
    }
    const notes = String(body.notes ?? "").replace(/\r\n?/g, "\n").trim();
    if (notes.length > NOTES_MAX) {
      return Response.json({ error: "Notes can be at most 2,000 characters" }, { status: 400 });
    }
    // Empty notes are stored as NULL, the same as never having written any.
    const result = await db.execute(sql`
      UPDATE ugc_applications SET team_notes = ${notes || null}
      WHERE id = ${id}
      RETURNING id, team_notes
    `);
    if (result.rows.length === 0) {
      return Response.json({ error: "Applicant not found" }, { status: 404 });
    }
    return Response.json({ ok: true, applicant: result.rows[0] });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}

// GET: every application, newest first, with counts by status. All rows at
// once because the page filters, searches and exports in the browser.
export async function loader({ request }: Route.LoaderArgs) {
  const denied = await adminOnly(request);
  if (denied) return denied;

  await ensureTable();

  const [result, counts] = await Promise.all([
    db.execute(sql`
      SELECT id, full_name, email, whatsapp, college, course, year_of_study,
             graduation_year, city, linkedin_url, followers, post_frequency,
             last_posted, best_post_url, crossed_1k, field, target_roles,
             dream_companies, looking_for, topics, avoid_topics,
             story_work, story_setback, story_lesson, tone,
             can_commit, studojo_ok, why_join, referral_source, referred_by,
             consent_at, status, team_notes,
             source_path, utm_source, utm_medium, utm_campaign, referrer,
             created_at
      FROM ugc_applications
      ORDER BY created_at DESC, id DESC
    `),
    statusCounts(),
  ]);

  const applicants = (result.rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    topics: topicList(row.topics),
    consent_at: isoTime(row.consent_at),
    created_at: isoTime(row.created_at),
  }));

  return Response.json({ applicants, counts });
}
