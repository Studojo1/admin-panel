// Server data route for the Sensei admin tab. Calls bob-svc's super-admin API
// with the secret from env (secret stays server-side); gated to admin/ops.
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.sensei";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";

const BOB_API = process.env.BOB_API_URL || "http://bob-svc:8000/api/v1/bob";
const SECRET = process.env.BOB_SUPERADMIN_SECRET || "";

async function requireAdmin(request: Request): Promise<boolean> {
  const user = await getUserFromRequest(request);
  if (!user) return false;
  const r = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = r.rows[0]?.role as string | null;
  return role === "admin" || role === "ops";
}

// Sensei support tickets land in the shared `tickets` table with source='sensei'
// (written by the studojo frontend's /api/sensei-ticket). Read them straight
// from this panel's DB — same DB the main Tickets tab uses.
async function loadSenseiTickets() {
  const exists = await db.execute(
    sql`SELECT to_regclass('public.tickets') AS t`,
  );
  if (!exists.rows[0]?.t) return [];
  const r = await db.execute(sql`
    SELECT t.id, t.user_email, t.user_name, t.category, t.priority, t.status,
           t.context, t.created_at,
           COALESCE((SELECT LEFT(m.body, 160) FROM ticket_messages m
                     WHERE m.ticket_id = t.id ORDER BY m.created_at ASC LIMIT 1), '') AS first_message
    FROM tickets t
    WHERE t.source = 'sensei'
    ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
             t.created_at DESC
    LIMIT 100
  `);
  return r.rows;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [analytics, tickets] = await Promise.all([
    fetch(`${BOB_API}/admin/analytics`, { headers: { "X-Superadmin-Secret": SECRET } })
      .then((r) => r.json())
      .catch(() => ({})),
    loadSenseiTickets().catch(() => []),
  ]);
  return Response.json({
    orgs: analytics.orgs || [],
    users: analytics.users || [],
    chats: analytics.chats || [],
    totals: analytics.totals || null,
    rates: analytics.rates || null,
    tickets,
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${BOB_API}/admin/orgs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Superadmin-Secret": SECRET },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  return Response.json(d, { status: res.status });
}
