/**
 * Reach (15 Nov 2026): who got 2 or more delivered business messages, WhatsApp or email, in the last 7 days, the trend, the
 * students who did not and what is stopping them, and Meta's limits. Read only, admin only.
 *
 * GET /api/reach[?internal=1][&fresh=1]          the whole report (/reach)
 * GET /api/reach?view=summary[&internal=1]       the headline only (the Overview tile)
 */
import type { Route } from "./+types/api.reach";
import { requireAdmin } from "~/lib/auth-helper.server";
import { summaryOf } from "~/lib/reach/model";
import { reachReport } from "~/lib/reach/reach.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const internal = url.searchParams.get("internal") === "1";
  try {
    const out = await reachReport(internal, url.searchParams.get("fresh") === "1");
    const headers = { "Cache-Control": "no-store", "Server-Timing": `reach;dur=${out.ms}` };
    if (url.searchParams.get("view") === "summary") {
      return Response.json({ summary: summaryOf(out.report), generatedAt: out.generatedAt, env: out.env }, { headers });
    }
    return Response.json(out, { headers });
  } catch (err: any) {
    console.error("[api/reach]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
