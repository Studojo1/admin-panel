/**
 * Outreach admin reads for the /old archive.
 *
 * job-outreach-svc served these until the old product was retired
 * (2 Nov 2026). They now read its tables directly, read only, with the same
 * rules and the same JSON (~/lib/outreach-archive).
 *
 * GET /old/api/outreach?type=overview
 * GET /old/api/outreach?type=users&limit=&offset=&search=&status_filter=
 * GET /old/api/outreach?type=user_detail&user_id=
 * GET /old/api/outreach?type=campaign_emails&campaign_id=
 * GET /old/api/outreach?type=payments&limit=&offset=&search=&status_filter=
 * GET /old/api/outreach?type=paid_funnel
 * GET /old/api/outreach?type=opened_emails&limit=&offset=
 * POST: refunds are not possible from the read-only archive.
 */

import type { Route } from "./+types/api.outreach";
import { requireAdmin } from "~/lib/auth-helper.server";
import { archiveReadOnly } from "~/lib/archive.server";
import { readFailed, readOnly } from "~/lib/outreach-archive/db.server";
import {
  campaignEmails,
  openedEmails,
  overview,
  paidFunnel,
  payments,
  userDetail,
  users,
} from "~/lib/outreach-archive/outreach.server";

const noCache = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noCache });
const invalid = (error: string) => json({ error, detail: error }, 422);

/** An integer query parameter in [min, max], its default when absent, or null when invalid. */
function intParam(url: URL, name: string, dflt: number, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return dflt;
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  try {
    if (type === "overview") return json(await readOnly((q) => overview(q)));

    if (type === "users" || type === "payments") {
      const limit = intParam(url, "limit", 50, 1, 200);
      const offset = intParam(url, "offset", 0, 0);
      const search = url.searchParams.get("search") ?? "";
      const statusFilter = url.searchParams.get("status_filter") ?? (type === "payments" ? "paid" : "");
      if (limit === null) return invalid("limit must be 1 to 200");
      if (offset === null) return invalid("offset must be a whole number");
      if (search.length > 200) return invalid("search is too long");
      if (statusFilter.length > 50) return invalid("status_filter is too long");
      const p = { limit, offset, search, statusFilter };
      if (type === "users") return json(await readOnly((q) => users(q, p)));
      return json(await readOnly((q) => payments(q, p)));
    }

    if (type === "user_detail") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return json({ error: "user_id required" }, 400);
      const detail = await readOnly((q) => userDetail(q, userId));
      return detail ? json(detail) : json({ error: "User not found", detail: "User not found" }, 404);
    }

    if (type === "campaign_emails") {
      const campaignId = url.searchParams.get("campaign_id");
      if (!campaignId) return json({ error: "campaign_id required" }, 400);
      if (!/^\d+$/.test(campaignId) || Number(campaignId) > 2147483647) return invalid("campaign_id must be a number");
      const data = await readOnly((q) => campaignEmails(q, Number(campaignId)));
      return data ? json(data) : json({ error: "Campaign not found", detail: "Campaign not found" }, 404);
    }

    if (type === "paid_funnel") return json(await readOnly((q) => paidFunnel(q)));

    if (type === "opened_emails") {
      const limit = intParam(url, "limit", 100, 1, 500);
      const offset = intParam(url, "offset", 0, 0);
      if (limit === null) return invalid("limit must be 1 to 500");
      if (offset === null) return invalid("offset must be a whole number");
      return json(await readOnly((q) => openedEmails(q, { limit, offset })));
    }

    return json({ error: "Unknown type" }, 400);
  } catch (e) {
    return readFailed(`outreach ${type}`, e);
  }
}

// The archive is read only: no refunds (audit PP-P05 flow retired with the product).
export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return archiveReadOnly();
}
