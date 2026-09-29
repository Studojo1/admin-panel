import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import { validateLink, toSlugPart } from "~/lib/utm-dictionary";
import type { Route } from "./+types/api.utm-campaigns";

// Links built here are served publicly as studojo.com/go/<slug> by the
// frontend, which reads this same table. Creating one publishes a redirect, so
// every route here is admin/ops only, not merely signed in.

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS utm_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      utm_source TEXT NOT NULL,
      utm_medium TEXT NOT NULL,
      utm_campaign TEXT NOT NULL,
      utm_content TEXT,
      utm_term TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE utm_campaigns ADD COLUMN IF NOT EXISTS slug TEXT`);
  await db.execute(sql`ALTER TABLE utm_campaigns ADD COLUMN IF NOT EXISTS created_by TEXT`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_utm_campaigns_slug
    ON utm_campaigns (slug) WHERE slug IS NOT NULL
  `);
  tableReady = true;
}

// GET /api/utm-campaigns
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureTable();

  const result = await db.execute(sql`
    SELECT id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
           slug, created_by, created_at
    FROM utm_campaigns ORDER BY created_at DESC
  `);
  return Response.json({ campaigns: result.rows });
}

// POST / DELETE /api/utm-campaigns
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureTable();

  if (request.method === "DELETE") {
    const { id } = await request.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await db.execute(sql`DELETE FROM utm_campaigns WHERE id = ${id}`);
    return Response.json({ success: true });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const link = {
    base_url: str(body.base_url),
    utm_source: str(body.utm_source).toLowerCase(),
    utm_medium: str(body.utm_medium).toLowerCase(),
    utm_campaign: str(body.utm_campaign).toLowerCase(),
    utm_content: str(body.utm_content).toLowerCase() || null,
    utm_term: str(body.utm_term).toLowerCase() || null,
    slug:
      str(body.slug).toLowerCase() ||
      toSlugPart([str(body.utm_campaign), str(body.utm_content)].filter(Boolean).join("-")),
  };

  // The browser checks the same rules, but this is the one that counts.
  const errors = validateLink(link);
  if (errors.length) return Response.json({ error: errors.join(" "), errors }, { status: 400 });

  const taken = await db.execute(sql`SELECT 1 FROM utm_campaigns WHERE slug = ${link.slug} LIMIT 1`);
  if (taken.rows.length) {
    return Response.json(
      { error: `studojo.com/go/${link.slug} is already taken. Change the short link or the content.` },
      { status: 409 },
    );
  }

  const id = str(body.id) || Date.now().toString();
  const name = str(body.name) || link.slug;
  await db.execute(sql`
    INSERT INTO utm_campaigns
      (id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, slug, created_by, created_at)
    VALUES
      (${id}, ${name}, ${link.base_url}, ${link.utm_source}, ${link.utm_medium}, ${link.utm_campaign},
       ${link.utm_content}, ${link.utm_term}, ${link.slug}, ${user.email}, NOW())
  `);

  return Response.json({ success: true, id, slug: link.slug });
}
