/**
 * Recordings (5 Nov 2026): the session recordings of an IST range (by when the visit began), newest first, with each
 * visit's channel, device, furthest journey step and whether the person signed up. Read only, admin only.
 *
 * GET /api/recordings?start=YYYY-MM-DD&end=YYYY-MM-DD[&person=<user id or visitor id>]
 */
import type { Route } from "./+types/api.recordings";
import { requireAdmin } from "~/lib/auth-helper.server";
import { listRecordings } from "~/lib/recordings/recordings.server";
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
  // Recordings are kept 30 days.
  if (start < addDays(end, -31)) start = addDays(end, -31);
  const person = (url.searchParams.get("person") || "").trim() || null;
  try {
    const out = await listRecordings(start, end, person);
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `recordings;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/recordings]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
