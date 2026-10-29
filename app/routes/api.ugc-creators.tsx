import type { Route } from "./+types/api.ugc-creators";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import {
  creatorStats,
  ensureCreatorTables,
  newCreatorSlug,
  newCreatorToken,
  studentLink,
  type PostRow,
} from "~/lib/ugc-creators.server";

// Creators in the LinkedIn UGC programme (/ugc-creators). GET lists them with
// this week's progress; POST takes an applicant on as a creator, adds one by
// hand, or changes a creator's status or cohort.

const STATUSES = ["active", "paused", "removed"] as const;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

interface CreatorRow {
  id: number;
  application_id: number | null;
  token: string;
  slug: string | null;
  full_name: string;
  email: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  college: string | null;
  field: string | null;
  cohort: string | null;
  status: string;
  connections_at_join: number | null;
  joined_at: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return unauthorized();
  await ensureCreatorTables();

  const creators = (await db.execute(sql`
    SELECT id, application_id, token, slug, full_name, email, whatsapp, linkedin_url, college, field, cohort,
           status, connections_at_join, joined_at
    FROM ugc_creators
    ORDER BY (status = 'removed'), joined_at DESC
  `)).rows as unknown as CreatorRow[];
  const posts = (await db.execute(sql`SELECT * FROM ugc_creator_posts`)).rows as unknown as PostRow[];
  const connections = (await db.execute(sql`
    SELECT DISTINCT ON (creator_id) creator_id, connections
    FROM ugc_creator_connections
    ORDER BY creator_id, recorded_at DESC
  `)).rows as unknown as { creator_id: number; connections: number }[];

  const postsBy = new Map<number, PostRow[]>();
  for (const p of posts) {
    if (!postsBy.has(p.creator_id)) postsBy.set(p.creator_id, []);
    postsBy.get(p.creator_id)!.push(p);
  }
  const latest = new Map(connections.map((c) => [c.creator_id, c.connections]));

  return Response.json({
    creators: creators.map((c) => ({
      ...c,
      link: studentLink(c.slug),
      connections: latest.get(c.id) ?? null,
      stats: creatorStats(postsBy.get(c.id) ?? []),
    })),
  });
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  await ensureCreatorTables();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });

  // Take an applicant on: copy their details across and mark them selected.
  if (body.intent === "create-from-application") {
    const applicationId = Number(body.applicationId);
    if (!Number.isInteger(applicationId) || applicationId <= 0 || applicationId > 2147483647) {
      return Response.json({ error: "Invalid application" }, { status: 400 });
    }
    const app = (await db.execute(sql`
      SELECT id, full_name, email, whatsapp, linkedin_url, college, field FROM ugc_applications WHERE id = ${applicationId}
    `).catch(() => ({ rows: [] }))).rows[0] as Record<string, string | null> | undefined;
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    const inserted = await db.execute(sql`
      INSERT INTO ugc_creators (application_id, token, slug, full_name, email, whatsapp, linkedin_url, college, field, created_by)
      VALUES (${applicationId}, ${newCreatorToken()}, ${newCreatorSlug(String(app.full_name ?? ""))}, ${app.full_name}, ${app.email}, ${app.whatsapp}, ${app.linkedin_url}, ${app.college}, ${app.field}, ${admin.email})
      ON CONFLICT (application_id) DO NOTHING
      RETURNING id, token, slug
    `);
    const row = (inserted.rows[0] ??
      (await db.execute(sql`SELECT id, token, slug FROM ugc_creators WHERE application_id = ${applicationId}`)).rows[0]) as
      | { id: number; token: string; slug: string | null }
      | undefined;
    if (!row) return Response.json({ error: "Could not create the creator" }, { status: 500 });
    await db.execute(sql`UPDATE ugc_applications SET status = 'selected' WHERE id = ${applicationId} AND status <> 'selected'`);
    return Response.json({ ok: true, created: inserted.rows.length > 0, creator: { id: row.id, slug: row.slug, link: studentLink(row.slug) } });
  }

  // Add someone who didn't come through the form.
  if (body.intent === "create") {
    const fullName = text(body.fullName, 120);
    if (fullName.length < 2) return Response.json({ error: "Name is required" }, { status: 400 });
    const row = (await db.execute(sql`
      INSERT INTO ugc_creators (token, slug, full_name, email, whatsapp, linkedin_url, college, field, cohort, created_by)
      VALUES (${newCreatorToken()}, ${newCreatorSlug(fullName)}, ${fullName}, ${text(body.email, 200) || null}, ${text(body.whatsapp, 30) || null},
              ${text(body.linkedinUrl, 300) || null}, ${text(body.college, 160) || null}, ${text(body.field, 80) || null},
              ${text(body.cohort, 40) || null}, ${admin.email})
      RETURNING id, token, slug
    `)).rows[0] as { id: number; token: string; slug: string };
    return Response.json({ ok: true, created: true, creator: { id: row.id, slug: row.slug, link: studentLink(row.slug) } });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) return Response.json({ error: "Invalid id" }, { status: 400 });

  if (body.intent === "set-status") {
    if (!(STATUSES as readonly string[]).includes(body.status)) return Response.json({ error: "Invalid status" }, { status: 400 });
    const r = await db.execute(sql`UPDATE ugc_creators SET status = ${body.status} WHERE id = ${id} RETURNING id`);
    if (!r.rows.length) return Response.json({ error: "Creator not found" }, { status: 404 });
    return Response.json({ ok: true });
  }

  if (body.intent === "set-cohort") {
    const r = await db.execute(sql`UPDATE ugc_creators SET cohort = ${text(body.cohort, 40) || null} WHERE id = ${id} RETURNING id`);
    if (!r.rows.length) return Response.json({ error: "Creator not found" }, { status: 404 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
