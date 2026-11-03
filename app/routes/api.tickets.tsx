// GET /api/tickets — admin list with filters + stats.
// Same auth pattern as /api/ops-alerts (admin or ops role).
// TICKET-REF (3 Nov 2026, the owner: "or bind it to the user, users first ticket or the name of the ticket like for
// the user"): each row has user_number (their own number for it, what Stu and Help show) and name (ticket-label.ts).
// ?q= searches by email or name plus their number ("asha@example.com 2"), or the internal id ("#49"), across every
// status, priority and category (the filters apply only without a search).
import type { Route } from "./+types/api.tickets";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { parseTicketSearch, ticketName } from "~/lib/ticket-label";
import { numberedTickets, searchWhere } from "~/lib/ticket-number.server";
import { sql } from "drizzle-orm";

// Tables are created on the studojo side (api.tickets.tsx in the
// studojo frontend) the first time a user raises a ticket. The admin
// queries below tolerate that — they return empty stats / empty list
// until the studojo side has run at least once.
async function tablesExist(): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT to_regclass('public.tickets') AS t
  `);
  return Boolean((r.rows[0] as any)?.t);
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await tablesExist())) {
    return Response.json({
      tickets: [],
      stats: { total: 0, open: 0, high_open: 0, in_progress: 0, resolved_7d: 0 },
    });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const priority = url.searchParams.get("priority") || "all";
  const category = url.searchParams.get("category") || "all";
  const search = parseTicketSearch(url.searchParams.get("q"));

  const where = search
    ? searchWhere(search)
    : sql`
    1=1
    ${status !== "all" ? sql`AND status = ${status}` : sql``}
    ${priority !== "all" ? sql`AND priority = ${priority}` : sql``}
    ${category !== "all" ? sql`AND category = ${category}` : sql``}
  `;

  const [list, stats] = await Promise.all([
    db.execute(sql`
      WITH numbered AS (${numberedTickets})
      SELECT
        t.id, t.user_id, t.user_email, t.user_name,
        t.category, t.priority, t.status, t.source,
        t.context, t.assignee_email,
        t.created_at, t.updated_at, t.closed_at, t.user_number,
        COALESCE(
          (SELECT LEFT(m.body, 400) FROM ticket_messages m
           WHERE m.ticket_id = t.id
           ORDER BY m.created_at ASC, m.id ASC LIMIT 1),
          ''
        ) AS first_message,
        (SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
      FROM numbered t
      WHERE ${where}
      ORDER BY
        CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        t.created_at DESC
      LIMIT 300
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'open' AND priority = 'high') AS high_open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved' AND closed_at > NOW() - INTERVAL '7 days') AS resolved_7d
      FROM tickets
    `),
  ]);

  const tickets = (list.rows as Record<string, any>[]).map((r) => ({
    ...r,
    name: ticketName({ summary: r.context?.summary, firstMessage: r.first_message, category: r.category }),
  }));
  return Response.json({
    tickets,
    stats: stats.rows[0],
    search: Boolean(search),
  });
}
