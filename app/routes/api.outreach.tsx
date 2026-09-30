/**
 * Server-side proxy for outreach admin endpoints.
 * Forwards requests to job-outreach-svc — no CORS issue.
 *
 * GET /api/outreach?type=overview
 * GET /api/outreach?type=users&limit=&offset=&search=&status_filter=
 * GET /api/outreach?type=user_detail&user_id=
 * POST /api/outreach  { op: "refund_payment", payment_id, reason }  (audit PP-P05)
 */

import type { Route } from "./+types/api.outreach";
import { requireAdmin } from "~/lib/auth-helper.server";

const JOB_OUTREACH_URL =
  process.env.JOB_OUTREACH_URL ??
  (process.env.JOB_OUTREACH_SVC_SERVICE_HOST
    ? `http://${process.env.JOB_OUTREACH_SVC_SERVICE_HOST}:${process.env.JOB_OUTREACH_SVC_SERVICE_PORT ?? 8000}`
    : "http://job-outreach-svc:8000");

export async function loader({ request }: Route.LoaderArgs) {
  // Checked here too, not only by job-outreach-svc: a proxy must not rely on
  // the backend to be the only gate (audit AS-N01).
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const headers = { Authorization: authHeader, "Content-Type": "application/json" };

  const noCache = { "Cache-Control": "no-store" };

  try {
    if (type === "overview") {
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/overview`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    if (type === "users") {
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      const search = url.searchParams.get("search");
      const statusFilter = url.searchParams.get("status_filter");
      let qs = `?limit=${limit}&offset=${offset}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) qs += `&status_filter=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/users${qs}`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    if (type === "user_detail") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return Response.json({ error: "user_id required" }, { status: 400 });
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/users/${userId}/detail`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    if (type === "campaign_emails") {
      const campaignId = url.searchParams.get("campaign_id");
      if (!campaignId) return Response.json({ error: "campaign_id required" }, { status: 400 });
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/campaign/${campaignId}/emails`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    if (type === "payments") {
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      const search = url.searchParams.get("search");
      const statusFilter = url.searchParams.get("status_filter") ?? "paid";
      let qs = `?limit=${limit}&offset=${offset}&status_filter=${encodeURIComponent(statusFilter)}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/payments${qs}`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    if (type === "paid_funnel") {
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/paid-funnel`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    if (type === "opened_emails") {
      const limit = url.searchParams.get("limit") ?? "100";
      const offset = url.searchParams.get("offset") ?? "0";
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/opened-emails?limit=${limit}&offset=${offset}`, { headers });
      return Response.json(await res.json(), { status: res.status, headers: noCache });
    }

    return Response.json({ error: "Unknown type" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Full refund of one payment through Razorpay/Dodo (audit PP-P05).
 * job-outreach-svc checks the admin JWT, refuses anything not refundable,
 * refunds at the provider first, then cancels unfinished campaigns and revokes
 * the credits the payment bought through the ledger. Nothing is decided here.
 */
export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    op?: string; payment_id?: number; reason?: string;
  };
  if (body.op !== "refund_payment") return Response.json({ detail: "Unknown op" }, { status: 400 });
  if (!body.payment_id || !Number.isInteger(body.payment_id)) {
    return Response.json({ detail: "payment_id must be a number" }, { status: 400 });
  }
  if (!body.reason || !body.reason.trim()) {
    return Response.json({ detail: "A reason is required." }, { status: 400 });
  }
  try {
    const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/payments/${body.payment_id}/refund`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: body.reason.trim(), confirm: true }),
    });
    const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    return Response.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ detail: `Outreach service unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
