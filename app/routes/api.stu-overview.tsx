/**
 * Stu Overview, one section per call (the admin root loads all nine in parallel).
 * Read only, admin only.
 *
 * GET /api/stu/overview?section=kpis|funnel|trends|sources|calls|dropoffs|engagement|feed|alerts
 *                       &start=YYYY-MM-DD&end=YYYY-MM-DD[&internal=1][&fresh=1]
 */
import type { Route } from "./+types/api.stu-overview";
import { requireAdmin } from "~/lib/auth-helper.server";
import { addDays, todayIst } from "~/lib/stu/model";
import { OV_SECTIONS, type OvSection } from "~/lib/stu/overview";
import { overviewSection } from "~/lib/stu/overview.server";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const section = url.searchParams.get("section") as OvSection;
  if (!OV_SECTIONS.includes(section)) return Response.json({ error: "unknown section" }, { status: 400 });
  const today = todayIst();
  const end = DAY_RE.test(url.searchParams.get("end") || "") ? url.searchParams.get("end")! : today;
  let start = DAY_RE.test(url.searchParams.get("start") || "") ? url.searchParams.get("start")! : end;
  if (start > end) start = end;
  if (start < addDays(end, -400)) start = addDays(end, -400);
  const filters = { start, end, internal: url.searchParams.get("internal") === "1", channel: "all" };
  try {
    const out = await overviewSection(section, filters, url.searchParams.get("fresh") === "1");
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `section;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/stu/overview]", section, err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
