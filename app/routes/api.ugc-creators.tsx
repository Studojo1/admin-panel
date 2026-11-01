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
// hand, or changes a creator's status, cohort or what they went on to.

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
  intern_at: string | null;
  referred_at: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return unauthorized();
  await ensureCreatorTables();

  const creators = (await db.execute(sql`
    SELECT id, application_id, token, slug, full_name, email, whatsapp, linkedin_url, college, field, cohort,
           status, connections_at_join, joined_at, intern_at, referred_at
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
  // Pressing it twice is safe, and it brings back a fellow who was removed.
  if (body.intent === "create-from-application") {
    const applicationId = Number(body.applicationId);
    if (!Number.isInteger(applicationId) || applicationId <= 0 || applicationId > 2147483647) {
      return Response.json({ error: "Invalid application" }, { status: 400 });
    }
    const app = (await db.execute(sql`
      SELECT id, full_name, email, whatsapp, linkedin_url, college, field FROM ugc_applications WHERE id = ${applicationId}
    `).catch(() => ({ rows: [] }))).rows[0] as Record<string, string | null> | undefined;
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    // The fellow row and the application's status change together, under the
    // lock on the application row that status changes take too, so the two
    // tables can't end up out of step.
    const { inserted, row } = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ugc_applications WHERE id = ${applicationId} FOR UPDATE`);
      const inserted = await tx.execute(sql`
        INSERT INTO ugc_creators (application_id, token, slug, full_name, email, whatsapp, linkedin_url, college, field, created_by)
        VALUES (${applicationId}, ${newCreatorToken()}, ${newCreatorSlug(String(app.full_name ?? ""))}, ${app.full_name}, ${app.email}, ${app.whatsapp}, ${app.linkedin_url}, ${app.college}, ${app.field}, ${admin.email})
        ON CONFLICT (application_id) DO UPDATE SET status = 'active' WHERE ugc_creators.status = 'removed'
        RETURNING id, token, slug, intern_at, referred_at
      `);
      const row = (inserted.rows[0] ??
        (await tx.execute(sql`SELECT id, token, slug, intern_at, referred_at FROM ugc_creators WHERE application_id = ${applicationId}`)).rows[0]) as
        | { id: number; token: string; slug: string | null; intern_at: string | null; referred_at: string | null }
        | undefined;
      if (row) await tx.execute(sql`UPDATE ugc_applications SET status = 'selected' WHERE id = ${applicationId} AND status <> 'selected'`);
      return { inserted, row };
    });
    if (!row) return Response.json({ error: "Could not create the creator" }, { status: 500 });
    return Response.json({
      ok: true,
      created: inserted.rows.length > 0,
      // A fellow brought back keeps what they went on to.
      creator: { id: row.id, slug: row.slug, link: studentLink(row.slug), intern_at: row.intern_at, referred_at: row.referred_at },
    });
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
    const r = await db.execute(sql`UPDATE ugc_creators SET status = ${body.status} WHERE id = ${id} RETURNING id, application_id`);
    if (!r.rows.length) return Response.json({ error: "Creator not found" }, { status: 404 });
    // An active or paused fellow who applied is a Fellow on the applicants page
    // too, so bringing one back puts their application in step.
    const applicationId = (r.rows[0] as { application_id: number | null }).application_id;
    if (body.status !== "removed" && applicationId) {
      await db.execute(sql`UPDATE ugc_applications SET status = 'selected' WHERE id = ${applicationId} AND status <> 'selected'`);
    }
    return Response.json({ ok: true });
  }

  // What they went on to: { outcome: "intern" | "referred", on }. Turning one on
  // keeps the first date it was set.
  if (body.intent === "set-outcome") {
    if (body.outcome !== "intern" && body.outcome !== "referred") {
      return Response.json({ error: "Invalid outcome" }, { status: 400 });
    }
    if (typeof body.on !== "boolean") return Response.json({ error: "on must be true or false" }, { status: 400 });
    const r =
      body.outcome === "intern"
        ? await db.execute(sql`
            UPDATE ugc_creators SET intern_at = CASE WHEN ${body.on}::boolean THEN COALESCE(intern_at, NOW()) END
            WHERE id = ${id} AND status <> 'removed' RETURNING intern_at, referred_at
          `)
        : await db.execute(sql`
            UPDATE ugc_creators SET referred_at = CASE WHEN ${body.on}::boolean THEN COALESCE(referred_at, NOW()) END
            WHERE id = ${id} AND status <> 'removed' RETURNING intern_at, referred_at
          `);
    if (!r.rows.length) return Response.json({ error: "Fellow not found" }, { status: 404 });
    return Response.json({ ok: true, creator: r.rows[0] });
  }

  if (body.intent === "set-cohort") {
    const r = await db.execute(sql`UPDATE ugc_creators SET cohort = ${text(body.cohort, 40) || null} WHERE id = ${id} RETURNING id`);
    if (!r.rows.length) return Response.json({ error: "Creator not found" }, { status: 404 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
