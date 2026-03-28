import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.settings";

// Ensure the platform_settings table exists
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// GET /api/settings?keys=n8n_blog_api_key,...
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  const url = new URL(request.url);
  const keys = url.searchParams.get("keys")?.split(",").map((k) => k.trim()).filter(Boolean);

  if (!keys || keys.length === 0) {
    const result = await db.execute(sql`SELECT key, value, updated_at FROM platform_settings ORDER BY key`);
    return Response.json({ settings: result.rows });
  }

  const result = await db.execute(
    sql`SELECT key, value, updated_at FROM platform_settings WHERE key = ANY(${keys})`
  );

  const map: Record<string, string> = {};
  for (const row of result.rows as any[]) {
    // Mask secret values — return presence indicator not the value
    map[row.key] = row.value ? "••••••••" : "";
  }
  return Response.json({ settings: map });
}

// POST /api/settings  body: { key: string, value: string }
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  if (request.method === "DELETE") {
    const { key } = await request.json();
    if (!key) return Response.json({ error: "key required" }, { status: 400 });
    await db.execute(sql`DELETE FROM platform_settings WHERE key = ${key}`);
    return Response.json({ success: true });
  }

  const { key, value } = await request.json();
  if (!key || !value) return Response.json({ error: "key and value required" }, { status: 400 });

  await db.execute(sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `);

  return Response.json({ success: true });
}
