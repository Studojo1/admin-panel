/**
 * Vendors and credits (LeadsForge, Apollo), read only, admin only.
 *
 * GET /api/vendors   balances (at most 10 minutes old), spend per IST day over the
 *                    last 30 days from career_agent.career_vendor_calls, burn rate,
 *                    days left and the "next thing" list. Keys stay on the server.
 */
import type { Route } from "./+types/api.vendors";
import { requireAdmin } from "~/lib/auth-helper.server";
import { vendorsReport } from "~/lib/vendors/vendors.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await vendorsReport(), { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("[api/vendors]", err?.message || err);
    return Response.json({ error: "Failed to load vendor usage" }, { status: 500 });
  }
}
