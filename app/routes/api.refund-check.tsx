/**
 * Server-side proxy for the campaign refund check (Refund Policy v3.0 §3.3).
 *
 * GET  /api/refund-check?campaign_id=&reported_on=YYYY-MM-DD
 * POST /api/refund-check  { op: "restart", campaign_id }
 * POST /api/refund-check  { op: "refund", campaign_id, reported_on, reason }
 *
 * job-outreach-svc checks the admin JWT on every call and recomputes §3.3
 * before refunding, so nothing here decides eligibility.
 */
import type { Route } from "./+types/api.refund-check";
import { requireAdmin } from "~/lib/auth-helper.server";

const JOB_OUTREACH_URL =
  process.env.JOB_OUTREACH_URL ??
  (process.env.JOB_OUTREACH_SVC_SERVICE_HOST
    ? `http://${process.env.JOB_OUTREACH_SVC_SERVICE_HOST}:${process.env.JOB_OUTREACH_SVC_SERVICE_PORT ?? 8000}`
    : "http://job-outreach-svc:8000");

const BASE = `${JOB_OUTREACH_URL}/api/v1/admin/outreach/campaign`;
const noCache = { "Cache-Control": "no-store" };

async function forward(res: Response) {
  const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
  return Response.json(body, { status: res.status, headers: noCache });
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const auth = request.headers.get("Authorization");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("campaign_id");
  if (!id || !/^\d+$/.test(id)) return Response.json({ detail: "campaign_id must be a number" }, { status: 400 });
  const reported = url.searchParams.get("reported_on");
  const qs = reported ? `?reported_on=${encodeURIComponent(reported)}` : "";
  try {
    return forward(await fetch(`${BASE}/${id}/refund-check${qs}`, { headers: { Authorization: auth } }));
  } catch (e) {
    return Response.json({ detail: `Outreach service unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const auth = request.headers.get("Authorization");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    op?: string; campaign_id?: number; reported_on?: string; reason?: string;
  };
  if (!body.campaign_id || !Number.isInteger(body.campaign_id)) {
    return Response.json({ detail: "campaign_id must be a number" }, { status: 400 });
  }
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  try {
    if (body.op === "restart") {
      return forward(await fetch(`${BASE}/${body.campaign_id}/restart`, { method: "POST", headers }));
    }
    if (body.op === "refund") {
      return forward(await fetch(`${BASE}/${body.campaign_id}/refund-unsent`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reported_on: body.reported_on, reason: body.reason ?? "", confirm: true }),
      }));
    }
    return Response.json({ detail: "op must be restart or refund" }, { status: 400 });
  } catch (e) {
    return Response.json({ detail: `Outreach service unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
