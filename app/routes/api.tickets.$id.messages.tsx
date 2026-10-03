// POST /api/tickets/:id/messages — admin reply.
// Writes a ticket_messages row with author_type='admin', then emails the user
// from Studojo Support <studojo@gmail.com>. This used to POST an
// event.ticket.replied event to emailer-service, which has no handler for it
// (and now also requires X-Internal-Secret), so no reply was ever emailed.
import type { Route } from "./+types/api.tickets.$id.messages";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sendDirectGmail } from "~/lib/gmail-direct.server";
import { sql } from "drizzle-orm";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Same template as the frontend's renderTicketRepliedHtml. Signed by the team,
// never by the replying admin's own email address.
function renderTicketRepliedHtml(opts: {
  ticket_id: number;
  user_name: string;
  reply_body: string;
}): string {
  const url = `https://studojo.com/tickets/${opts.ticket_id}`;
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa;padding:24px;color:#171717;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:28px;">
      <h2 style="margin:0 0 12px;font-size:20px;">Hey ${esc(opts.user_name)},</h2>
      <p style="margin:0 0 18px;">The team replied on your support ticket #${opts.ticket_id}.</p>
      <div style="background:#faf5ff;border-left:3px solid #7c3aed;padding:14px 16px;border-radius:6px;margin:0 0 24px;">
        <p style="margin:0 0 6px;color:#737373;font-size:12px;">The Studojo team wrote</p>
        <p style="margin:0;white-space:pre-wrap;">${esc(opts.reply_body)}</p>
      </div>
      <p style="text-align:center;margin:0 0 16px;">
        <a href="${esc(url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;">View ticket on Studojo</a>
      </p>
      <p style="font-size:12px;color:#737373;text-align:center;margin:0;">Reply from the support chat or your profile.</p>
    </div>
  </body></html>`;
}

async function notifyUserOfReply(opts: {
  ticket_id: number;
  user_email: string;
  user_name: string | null;
  reply_body: string;
}): Promise<boolean> {
  const ok = await sendDirectGmail({
    to: opts.user_email,
    subject: `Re: Studojo ticket #${opts.ticket_id}`,
    html: renderTicketRepliedHtml({
      ticket_id: opts.ticket_id,
      user_name: opts.user_name || "there",
      reply_body: opts.reply_body,
    }),
  });
  if (!ok) console.error(`[tickets] reply email failed for ticket ${opts.ticket_id}`);
  return ok;
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminEmail = user.email || user.id;

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

  const emailed = await notifyUserOfReply({
    ticket_id: id,
    user_email: ticket.user_email,
    user_name: ticket.user_name,
    reply_body: text,
  });

  return Response.json({ message: mRes.rows[0], emailed });
}
