// GET   /api/tickets/:id — ticket detail + full thread
// PATCH /api/tickets/:id — update status / assignee
import type { Route } from "./+types/api.tickets.$id";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

const ALLOWED_STATUSES = ["open", "in_progress", "resolved", "wont_fix"];

async function requireAdmin(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const r = await db.execute(
    sql`SELECT role, email FROM "user" WHERE id = ${user.id} LIMIT 1`,
  );
  const role = r.rows[0]?.role as string | null;
  const email = r.rows[0]?.email as string | undefined;
  if (role !== "admin" && role !== "ops") {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, email: email || user.id };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const tRes = await db.execute(sql`
    SELECT id, user_id, user_email, user_name, category, priority, status,
           source, context, assignee_email,
           created_at, updated_at, closed_at
    FROM tickets WHERE id = ${id} LIMIT 1
  `);
  const ticket = tRes.rows[0];
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 });

  const mRes = await db.execute(sql`
    SELECT id, ticket_id, author_type, author_email, body, created_at
    FROM ticket_messages
    WHERE ticket_id = ${id}
    ORDER BY created_at ASC
  `);

  return Response.json({ ...(ticket as Record<string, any>), messages: mRes.rows });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = typeof body?.status === "string" ? body.status : undefined;
  const assignee_email =
    typeof body?.assignee_email === "string" ? body.assignee_email : undefined;

  if (status && !ALLOWED_STATUSES.includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  // Build update set + handle closed_at side effect for terminal statuses.
  const closedAtClause =
    status === "resolved" || status === "wont_fix"
      ? sql`, closed_at = NOW()`
      : status === "open" || status === "in_progress"
        ? sql`, closed_at = NULL`
        : sql``;

  const result = await db.execute(sql`
    UPDATE tickets
    SET
      updated_at = NOW()
      ${status !== undefined ? sql`, status = ${status}` : sql``}
      ${assignee_email !== undefined ? sql`, assignee_email = ${assignee_email || null}` : sql``}
      ${closedAtClause}
    WHERE id = ${id}
    RETURNING id, status, assignee_email, closed_at, updated_at
  `);

  if (result.rows.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true, ticket: result.rows[0] });
}
