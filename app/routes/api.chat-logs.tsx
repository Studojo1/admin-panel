import type { Route } from "./+types/api.chat-logs";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

const ADMIN_EMAILS = ["admin@studojo.com", "jeremy@studojo.com", "jeremyabraham1411@gmail.com"];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const source = url.searchParams.get("source") || "";

  const whereClause = source ? sql`WHERE source = ${source}` : sql``;

  const [logsResult, statsResult] = await Promise.all([
    db.execute(sql`
      SELECT id, session_id, user_message, bot_response, source, confidence, intent_id, created_at
      FROM support_chat_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE source = 'nlp') AS nlp_count,
        COUNT(*) FILTER (WHERE source = 'llm') AS llm_count,
        COUNT(*) FILTER (WHERE source = 'escalation') AS escalation_count,
        COUNT(DISTINCT session_id) AS unique_sessions,
        ROUND(AVG(confidence)::numeric, 2) AS avg_confidence,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d
      FROM support_chat_logs
      WHERE created_at > NOW() - INTERVAL '30 days'
    `),
  ]);

  return Response.json({
    logs: logsResult.rows,
    stats: statsResult.rows[0],
    limit,
    offset,
  });
}
