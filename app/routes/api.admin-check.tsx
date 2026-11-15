/**
 * Admin check (15 Nov 2026): answers 200 for an admin or ops login, 401 otherwise.
 * The sign-in page and the page guard used to ask api.studojo.com (control-plane),
 * so every admin page went blank whenever that service was down. This asks our own
 * server, the same gate every API route here uses.
 *
 * GET /api/admin-check   (Authorization: Bearer <jwt>)
 */
import type { Route } from "./+types/api.admin-check";
import { requireAdmin } from "~/lib/auth-helper.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
