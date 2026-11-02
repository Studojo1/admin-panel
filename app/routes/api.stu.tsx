/**
 * Stu tracking data (the new product on studojo.pro), read only, admin only.
 *
 * GET /api/stu                 every product user's first time at each step, calls,
 *                              activity a day, visitors and the journey log's steps
 *                              (at most a minute old; ?fresh=1 reads now)
 * GET /api/stu?view=user&id=X  one person's raw journey log and source row
 */
import type { Route } from "./+types/api.stu";
import { requireAdmin } from "~/lib/auth-helper.server";
import { stuData, userTimeline } from "~/lib/stu/data.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "data";
  const headers = { "Cache-Control": "no-store" };
  try {
    if (view === "user") {
      const id = url.searchParams.get("id") || "";
      if (!id || id.length > 200) return Response.json({ error: "id required" }, { status: 400 });
      return Response.json(await userTimeline(id), { headers });
    }
    if (view !== "data") return Response.json({ error: "unknown view" }, { status: 400 });
    return Response.json(await stuData(url.searchParams.get("fresh") === "1"), { headers });
  } catch (err: any) {
    console.error("[api/stu]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
