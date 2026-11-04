/**
 * Recordings (5 Nov 2026): one chunk of a visit's recording, the gzip bytes as stored (the page unzips them). Only a
 * name under this visit's own prefix. Read only, admin only.
 *
 * GET /api/recordings/:id/chunk?name=<blob name>
 */
import type { Route } from "./+types/api.recordings.$id.chunk";
import { requireAdmin } from "~/lib/auth-helper.server";
import { chunkOf } from "~/lib/recordings/recordings.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const name = new URL(request.url).searchParams.get("name") || "";
  try {
    const bytes = await chunkOf(String(params.id || ""), name);
    if (!bytes) return Response.json({ error: "No such chunk" }, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err: any) {
    console.error("[api/recordings/:id/chunk]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
