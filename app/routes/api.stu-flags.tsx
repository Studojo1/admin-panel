/**
 * Auditor flags: bad matches and bad journeys per student in a window. Read only, admin only.
 *
 * GET /api/stu/flags?hours=48[&internal=1][&fresh=1]   (default: the last 48 hours)
 * GET /api/stu/flags?start=YYYY-MM-DD&end=YYYY-MM-DD   (whole IST days)
 */
import type { Route } from "./+types/api.stu-flags";
import { requireAdmin } from "~/lib/auth-helper.server";
import { flagReport } from "~/lib/stu/flags.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const t0 = Date.now();
    const out = await flagReport(
      { hours: url.searchParams.get("hours"), start: url.searchParams.get("start"), end: url.searchParams.get("end") },
      url.searchParams.get("internal") === "1",
      url.searchParams.get("fresh") === "1",
    );
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `flags;dur=${Date.now() - t0}` } });
  } catch (err: any) {
    console.error("[api/stu/flags]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
