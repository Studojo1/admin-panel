// POST /api/tickets/:id/messages — admin reply.
// Writes a ticket_messages row with author_type='admin', then fires the
// event.ticket.replied routing key to email the user (best-effort).
import type { Route } from "./+types/api.tickets.$id.messages";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

async function getEmailerServiceUrl(): Promise<string | null> {
  // Admin panel doesn't have a getEmailerServiceUrl helper today; the
  // emailer-service is reachable cluster-internally at
  // http://emailer-service.<namespace>.svc.cluster.local:8087. The env
  // var EMAILER_SERVICE_URL lets us override per-env.
  return process.env.EMAILER_SERVICE_URL || null;
}

async function notifyUserOfReply(opts: {
  ticket_id: number;
  user_email: string;
  user_name: string | null;
  admin_name: string;
  reply_body: string;
}): Promise<void> {
  const base = await getEmailerServiceUrl();
  if (!base) {
    console.warn(
      "[tickets] EMAILER_SERVICE_URL not configured; user-reply email skipped",
    );
    return;
  }
  try {
    const res = await fetch(`${base}/v1/email/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: "event.ticket.replied",
        event: {
          ...opts,
          studojo_url: `https://studojo.com/`,
        },
      }),
    });
    if (!res.ok) {
      console.error(`[tickets] emailer reply -> HTTP ${res.status}`);
    }
  } catch (e: any) {
    console.error("[tickets] failed to notify user of reply:", e?.message);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const roleRes = await db.execute(
    sql`SELECT role, email, name FROM "user" WHERE id = ${user.id} LIMIT 1`,
  );
  const row = roleRes.rows[0] as
    | { role?: string; email?: string; name?: string }
    | undefined;
  if (!row || (row.role !== "admin" && row.role !== "ops")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminEmail = row.email || user.id;
  const adminName = row.name || row.email?.split("@")[0] || "studojo team";

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
  const text = String(body?.body || "").trim();
  if (text.length < 1) {
    return Response.json({ error: "Reply can't be empty" }, { status: 400 });
  }
  if (text.length > 5000) {
    return Response.json({ error: "Reply too long (5000 max)" }, { status: 400 });
  }

  // Look up the ticket so we know which user to email.
  const tRes = await db.execute(sql`
    SELECT id, user_email, user_name FROM tickets WHERE id = ${id} LIMIT 1
  `);
  const ticket = tRes.rows[0] as
    | { id: number; user_email: string; user_name: string | null }
    | undefined;
  if (!ticket) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const mRes = await db.execute(sql`
    INSERT INTO ticket_messages (ticket_id, author_type, author_id, author_email, body)
    VALUES (${id}, 'admin', ${user.id}, ${adminEmail}, ${text})
    RETURNING id, ticket_id, author_type, author_email, body, created_at
  `);
  await db.execute(sql`
    UPDATE tickets
    SET updated_at = NOW(),
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
    WHERE id = ${id}
  `);

  notifyUserOfReply({
    ticket_id: id,
    user_email: ticket.user_email,
    user_name: ticket.user_name,
    admin_name: adminName,
    reply_body: text,
  });

  return Response.json({ message: mRes.rows[0] });
}
