/**
 * Customers (13 Nov 2026, the owner: "give a team member access to see all our customer data so they can focus on
 * finding companies for some super promising ones and get them hired ... Just make this entire page for admin"). Admin
 * only, like every page here.
 *
 * GET  /api/customers[?internal=1][&fresh=1]   every Stu customer with the signals and the rank (app/lib/customers)
 * GET  /api/customers?id=<user id>             one customer's whole page
 * POST /api/customers  { op: "star" | "note" | "pick" | "pick-update" | "pick-delete", id, ... }
 *      the team's star, note and picks for a customer (public.stu_customer_desk, public.stu_customer_picks);
 *      nothing is written to Stu's own tables
 */
import type { Route } from "./+types/api.customers";
import { requireAdmin } from "~/lib/auth-helper.server";
import { BadRequest, type DeskOp, customerDetail, customersList, deskWrite } from "~/lib/customers/customers.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  try {
    if (p.has("id")) {
      const detail = await customerDetail((p.get("id") || "").slice(0, 80));
      return detail ? Response.json({ detail }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Not found" }, { status: 404 });
    }
    const out = await customersList(p.get("internal") === "1", p.get("fresh") === "1");
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `customers;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/customers]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  let body: DeskOp;
  try {
    body = (await request.json()) as DeskOp;
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  try {
    const out = await deskWrite(body, admin.email || admin.id);
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
    console.error("[api/customers] write", err);
    return Response.json({ error: err?.message || "Failed to save" }, { status: 500 });
  }
}
