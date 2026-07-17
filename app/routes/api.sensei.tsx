// Server data route for the Sensei admin tab. Calls bob-svc's super-admin API
// with the secret from env (secret stays server-side); gated to admin/ops.
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.sensei";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";

const BOB_API = process.env.BOB_API_URL || "http://bob-svc:8000/api/v1/bob";
const SECRET = process.env.BOB_SUPERADMIN_SECRET || "";

async function requireAdmin(request: Request): Promise<boolean> {
  const user = await getUserFromRequest(request);
  if (!user) return false;
  const r = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = r.rows[0]?.role as string | null;
  return role === "admin" || role === "ops";
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const res = await fetch(`${BOB_API}/admin/orgs`, { headers: { "X-Superadmin-Secret": SECRET } });
    const d = await res.json().catch(() => ({}));
    return Response.json({ orgs: d.orgs || [] }, { status: res.ok ? 200 : 502 });
  } catch {
    return Response.json({ orgs: [], error: "bob-svc unreachable" }, { status: 502 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${BOB_API}/admin/orgs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Superadmin-Secret": SECRET },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  return Response.json(d, { status: res.status });
}
