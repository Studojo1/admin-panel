/**
 * Server-side proxy for outreach admin endpoints.
 * Forwards requests to the internal control-plane service — no CORS issue.
 *
 * GET /api/outreach?type=overview
 * GET /api/outreach?type=users&limit=&offset=&search=&status_filter=
 * GET /api/outreach?type=user_detail&user_id=
 */

import type { Route } from "./+types/api.outreach";

const CONTROL_PLANE =
  process.env.CONTROL_PLANE_URL ??
  process.env.VITE_CONTROL_PLANE_URL ??
  "http://localhost:8000";

export async function loader({ request }: Route.LoaderArgs) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const headers = { Authorization: authHeader, "Content-Type": "application/json" };

  try {
    if (type === "overview") {
      const res = await fetch(`${CONTROL_PLANE}/api/v1/admin/outreach/overview`, { headers });
      return Response.json(await res.json(), { status: res.status });
    }

    if (type === "users") {
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      const search = url.searchParams.get("search");
      const statusFilter = url.searchParams.get("status_filter");
      let qs = `?limit=${limit}&offset=${offset}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) qs += `&status_filter=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(`${CONTROL_PLANE}/api/v1/admin/outreach/users${qs}`, { headers });
      return Response.json(await res.json(), { status: res.status });
    }

    if (type === "user_detail") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
      const res = await fetch(`${CONTROL_PLANE}/api/v1/admin/outreach/users/${userId}/detail`, { headers });
      return Response.json(await res.json(), { status: res.status });
    }

    return Response.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
