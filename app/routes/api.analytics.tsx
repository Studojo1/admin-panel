/**
 * Server-side proxy for analytics signups data.
 * Forwards requests to the outreach backend's /admin/outreach/signups endpoint
 * using the admin JWT from the session cookie.
 *
 * GET /api/analytics?start=YYYY-MM-DD&end=YYYY-MM-DD
 * → GET {CONTROL_PLANE}/api/v1/admin/outreach/signups?start=X&end=Y
 * Returns: { count: number, daily: [{day, signups}] }
 */

import { getUserFromRequest, getTokenFromRequest } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.analytics";

const CONTROL_PLANE =
  process.env.CONTROL_PLANE_URL ??
  process.env.VITE_CONTROL_PLANE_URL ??
  "http://localhost:8000";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return Response.json({ error: "start and end required" }, { status: 400 });
  }

  try {
    const token = await getTokenFromRequest(request);
    const upstream = `${CONTROL_PLANE}/api/v1/admin/outreach/signups?start=${start}&end=${end}`;
    const res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
