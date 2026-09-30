// PATCH /api/ops-alerts/:id — acknowledge an alert.
import type { Route } from "./+types/api.ops-alerts.$id";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const email = user.email || user.id;

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const result = await db.execute(sql`
    UPDATE ops_alerts
    SET acknowledged_at = NOW(), acknowledged_by = ${email}
    WHERE id = ${id} AND acknowledged_at IS NULL
    RETURNING id
  `);

  return Response.json({
    ok: true,
    acknowledged: result.rows.length > 0,
  });
}
