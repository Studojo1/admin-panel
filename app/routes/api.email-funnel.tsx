/**
 * Email (17 Nov 2026): how Stu's emails to students perform, from due to paid: the health strip, the funnel with the
 * reasons a due email was not sent, each kind, the 14 day trend, the route and sender, inbox placement, email against
 * WhatsApp and the last 50 sends (addresses masked). Read only, admin only.
 *
 * GET /api/email-funnel[?days=1|7|30][&team=1][&fresh=1]
 */
import type { Route } from "./+types/api.email-funnel";
import { requireAdmin } from "~/lib/auth-helper.server";
import { parseDays } from "~/lib/email-funnel/model";
import { emailReport } from "~/lib/email-funnel/email.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const out = await emailReport(parseDays(url.searchParams.get("days")), url.searchParams.get("team") === "1", url.searchParams.get("fresh") === "1");
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `email;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/email-funnel]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
