/**
 * Visitors (4 Nov 2026): real visitors, likely bots and declared crawlers in an IST range, the funnel per source and
 * where those who did not sign up stopped. Counts only, no person. Read only, admin only.
 *
 * GET /api/visitors?start=YYYY-MM-DD&end=YYYY-MM-DD[&device=all|mobile|desktop][&internal=1][&fresh=1]
 */
import type { Route } from "./+types/api.visitors";
import { requireAdmin } from "~/lib/auth-helper.server";
import { addDays, todayIst } from "~/lib/stu/model";
import { DEVICES, type DeviceFilter } from "~/lib/visitors/model";
import { visitorsReport } from "~/lib/visitors/visitors.server";

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
  const raw = url.searchParams.get("device") || "all";
  const device = (DEVICES.some((d) => d.key === raw) ? raw : "all") as DeviceFilter;
  try {
    const out = await visitorsReport(start, end, device, url.searchParams.get("internal") === "1", url.searchParams.get("fresh") === "1");
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `visitors;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/visitors]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
