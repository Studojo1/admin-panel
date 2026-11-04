/**
 * Recordings (5 Nov 2026): one visit to play: its row, its chunks as tracks (page loads one after another; a second tab
 * open at the same time is a track of its own) and the person's journey events in it. Read only, admin only.
 *
 * GET /api/recordings/:id
 */
import type { Route } from "./+types/api.recordings.$id";
import { requireAdmin } from "~/lib/auth-helper.server";
import { recordingDetail } from "~/lib/recordings/recordings.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const out = await recordingDetail(String(params.id || ""));
    if (!out) return Response.json({ error: "No such recording (they are kept 30 days)" }, { status: 404 });
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("[api/recordings/:id]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
