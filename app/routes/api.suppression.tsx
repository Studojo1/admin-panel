/**
 * Server-side proxy for the suppression list and data-removal requests.
 *
 * GET  /api/suppression?view=suppression&search=&limit=50&offset=0
 * GET  /api/suppression?view=requests&status=open|done|all
 * POST /api/suppression  { op: "suppress", email }
 * POST /api/suppression  { op: "request", email, received_on: "YYYY-MM-DD" }
 * POST /api/suppression  { op: "delete-data", id }
 *
 * job-outreach-svc checks the admin JWT on every call and owns every rule
 * (masking, deadlines, what gets deleted); this only validates shape.
 */
import type { Route } from "./+types/api.suppression";
import { requireAdmin } from "~/lib/auth-helper.server";

const JOB_OUTREACH_URL =
  process.env.JOB_OUTREACH_URL ??
  (process.env.JOB_OUTREACH_SVC_SERVICE_HOST
    ? `http://${process.env.JOB_OUTREACH_SVC_SERVICE_HOST}:${process.env.JOB_OUTREACH_SVC_SERVICE_PORT ?? 8000}`
    : "http://job-outreach-svc:8000");

const BASE = `${JOB_OUTREACH_URL}/api/v1/admin/outreach`;
const noCache = { "Cache-Control": "no-store" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

async function forward(res: Response) {
  const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
  return Response.json(body, { status: res.status, headers: noCache });
}

const bad = (detail: string) => Response.json({ detail }, { status: 400 });
const unreachable = (e: unknown) =>
  Response.json({ detail: `Outreach service unreachable: ${(e as Error).message}` }, { status: 502 });

export async function loader({ request }: Route.LoaderArgs) {
  // Checked here too, not only by job-outreach-svc: a proxy must not rely on
  // the backend to be the only gate (audit AS-N01).
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const auth = request.headers.get("Authorization");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "suppression";
  let target: string;
  if (view === "suppression") {
    const limit = url.searchParams.get("limit") ?? "50";
    const offset = url.searchParams.get("offset") ?? "0";
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 200) return bad("limit must be 1 to 200");
    if (!/^\d+$/.test(offset)) return bad("offset must be a whole number");
    const qs = new URLSearchParams({ search: (url.searchParams.get("search") ?? "").slice(0, 200), limit, offset });
    target = `${BASE}/suppression?${qs}`;
  } else if (view === "requests") {
    const status = url.searchParams.get("status") ?? "all";
    if (!["open", "done", "all"].includes(status)) return bad("status must be open, done or all");
    target = `${BASE}/removal-requests?status=${status}`;
  } else {
    return bad("view must be suppression or requests");
  }
  try {
    return forward(await fetch(target, { headers: { Authorization: auth } }));
  } catch (e) {
    return unreachable(e);
  }
}

export async function action({ request }: Route.ActionArgs) {
  // Checked here too, not only by job-outreach-svc: a proxy must not rely on
  // the backend to be the only gate (audit AS-N01).
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const auth = request.headers.get("Authorization");
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    op?: string; email?: unknown; received_on?: unknown; id?: unknown;
  };
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  try {
    if (body.op === "suppress") {
      if (!EMAIL_RE.test(email) || email.length > 320) return bad("Enter a valid email address");
      return forward(await fetch(`${BASE}/suppression`, { method: "POST", headers, body: JSON.stringify({ email }) }));
    }
    if (body.op === "request") {
      if (!EMAIL_RE.test(email) || email.length > 320) return bad("Enter a valid email address");
      const received = typeof body.received_on === "string" ? body.received_on : "";
      if (!DATE_RE.test(received) || Number.isNaN(Date.parse(received))) return bad("received_on must be YYYY-MM-DD");
      return forward(await fetch(`${BASE}/removal-requests`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, received_on: received }),
      }));
    }
    if (body.op === "delete-data") {
      const id = String(body.id ?? "");
      if (!ID_RE.test(id)) return bad("id is required");
      return forward(await fetch(`${BASE}/removal-requests/${encodeURIComponent(id)}/delete-data`, { method: "POST", headers }));
    }
    return bad("op must be suppress, request or delete-data");
  } catch (e) {
    return unreachable(e);
  }
}
