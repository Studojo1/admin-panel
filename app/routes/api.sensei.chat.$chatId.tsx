// One Sensei chat, for the admin tab's transcript modal.
//
// GET  -> the whole conversation (what the customer typed, what Sensei said, the chips it offered)
//         plus every run with the params that explain a bad result.
// POST -> mints a SHORT-LIVED support session for that chat's owner and returns the URL that opens
//         their workspace at this exact chat. The bob-svc side caps the TTL and logs every mint;
//         the super-admin secret never leaves this server.
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.sensei.chat.$chatId";
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

function chatId(params: Record<string, string | undefined>): number | null {
  const raw = params.chatId || "";
  return /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = chatId(params);
  if (id == null) return Response.json({ error: "Bad chat id" }, { status: 400 });
  const res = await fetch(`${BOB_API}/admin/chat/${id}`, {
    headers: { "X-Superadmin-Secret": SECRET },
  });
  const d = await res.json().catch(() => ({}));
  return Response.json(d, { status: res.status });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = chatId(params);
  if (id == null) return Response.json({ error: "Bad chat id" }, { status: 400 });
  const res = await fetch(`${BOB_API}/admin/impersonate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Superadmin-Secret": SECRET },
    body: JSON.stringify({ chat_id: id, ttl_minutes: 60 }),
  });
  const d = await res.json().catch(() => ({}));
  return Response.json(d, { status: res.status });
}
