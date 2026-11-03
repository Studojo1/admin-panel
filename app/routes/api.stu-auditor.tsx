/**
 * Stu Auditor: every failure the product recorded in an IST range, plus
 * yesterday and today for the top line. Read only, admin only.
 *
 * GET /api/stu/auditor?start=YYYY-MM-DD&end=YYYY-MM-DD[&internal=1][&fresh=1]
 */
import type { Route } from "./+types/api.stu-auditor";
import { requireAdmin } from "~/lib/auth-helper.server";
import { audit } from "~/lib/stu/auditor.server";
import { addDays, todayIst } from "~/lib/stu/model";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const today = todayIst();
  const end = DAY_RE.test(url.searchParams.get("end") || "") ? url.searchParams.get("end")! : today;
  let start = DAY_RE.test(url.searchParams.get("start") || "") ? url.searchParams.get("start")! : end;
  if (start > end) start = end;
  if (start < addDays(end, -400)) start = addDays(end, -400);
  try {
    const t0 = Date.now();
    const out = await audit(start, end, url.searchParams.get("internal") === "1", url.searchParams.get("fresh") === "1");
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `audit;dur=${Date.now() - t0}` } });
  } catch (err: any) {
    console.error("[api/stu/auditor]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
