/**
 * Campaign refund check (Refund Policy v3.0 section 3.3) for the /old archive.
 *
 * GET /old/api/refund-check?campaign_id=&reported_on=YYYY-MM-DD
 *
 * job-outreach-svc computed this until the old product was retired
 * (2 Nov 2026); it is now read from its tables directly, read only, with the
 * same rules (~/lib/outreach-archive/refund-check.server.ts). Restarting a
 * campaign or refunding is not possible from the read-only archive.
 */
import type { Route } from "./+types/api.refund-check";
import { requireAdmin } from "~/lib/auth-helper.server";
import { archiveReadOnly } from "~/lib/archive.server";
import { readFailed, readOnly } from "~/lib/outreach-archive/db.server";
import { campaignRefundCheck } from "~/lib/outreach-archive/refund-check.server";

const noCache = { "Cache-Control": "no-store" };

/** strptime("%Y-%m-%d") then isoformat(): a real date, zero padded, or null. */
function parseDay(value: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("campaign_id");
  if (!id || !/^\d+$/.test(id) || Number(id) > 2147483647) {
    return Response.json({ detail: "campaign_id must be a number" }, { status: 400 });
  }
  const reported = url.searchParams.get("reported_on");
  let reportedOn: string | null = null;
  if (reported) {
    reportedOn = parseDay(reported);
    if (!reportedOn) return Response.json({ detail: "reported_on must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const check = await readOnly((q) => campaignRefundCheck(q, Number(id), reportedOn));
    if (!check) return Response.json({ detail: "Campaign not found." }, { status: 404, headers: noCache });
    return Response.json(check, { headers: noCache });
  } catch (e) {
    return readFailed("refund-check", e);
  }
}

// The archive is read only: no restart, no refund.
export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return archiveReadOnly();
}
