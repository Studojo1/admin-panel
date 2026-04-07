import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.utm-campaigns";

async function ensureTable() {
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
}

// GET /api/utm-campaigns
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  const result = await db.execute(
    sql`SELECT id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at FROM utm_campaigns ORDER BY created_at DESC`
  );
  return Response.json({ campaigns: result.rows });
}

// POST / DELETE /api/utm-campaigns
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  if (request.method === "DELETE") {
    const { id } = await request.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await db.execute(sql`DELETE FROM utm_campaigns WHERE id = ${id}`);
    return Response.json({ success: true });
  }

  const { id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term } =
    await request.json();

  if (!id || !name || !base_url || !utm_source || !utm_medium || !utm_campaign) {
    return Response.json({ error: "id, name, base_url, utm_source, utm_medium, utm_campaign required" }, { status: 400 });
  }

  await db.execute(sql`
    INSERT INTO utm_campaigns (id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at)
    VALUES (${id}, ${name}, ${base_url}, ${utm_source}, ${utm_medium}, ${utm_campaign}, ${utm_content ?? null}, ${utm_term ?? null}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  return Response.json({ success: true });
}
