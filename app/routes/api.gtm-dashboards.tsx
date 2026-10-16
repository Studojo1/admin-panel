import type { Route } from "./+types/api.gtm-dashboards";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

/**
 * GTM campaign dashboards (read-only).
 *
 * Each campaign (e.g. "us-gtm-week-1") is one JSON snapshot in gtm_dashboards,
 * written by the campaign tooling (build_dashboard.py + push_dashboard.sh), not
 * by this app. Snapshots hold prospects' names, emails and full email threads,
 * so every read is admin-only and nothing is ever committed to this (public) repo.
 * The table is created idempotently, same pattern as api.b2b-gtm.
 */
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gtm_dashboards (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const slug = new URL(request.url).searchParams.get("slug");
  if (slug) {
    const r = await db.execute(
      sql`SELECT slug, title, data, updated_at FROM gtm_dashboards WHERE slug = ${slug} LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(row);
  }
  // List view: no threads, just enough to render a card per campaign.
  const r = await db.execute(sql`
    SELECT slug, title, updated_at,
           data->'subtitle' AS subtitle, data->'period' AS period, data->'kpis' AS kpis
    FROM gtm_dashboards ORDER BY updated_at DESC
  `);
  return Response.json({ dashboards: r.rows });
}
