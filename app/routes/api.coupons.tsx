import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.coupons";

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS coupons (
      id          TEXT PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,
      discount_type  TEXT NOT NULL DEFAULT 'percent',
      discount_value NUMERIC NOT NULL,
      max_uses    INTEGER,
      uses        INTEGER NOT NULL DEFAULT 0,
      expires_at  TIMESTAMPTZ,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// GET /api/coupons
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  const result = await db.execute(sql`
    SELECT id, code, discount_type, discount_value, max_uses, uses, expires_at, notes, created_at
    FROM coupons
    ORDER BY created_at DESC
  `);

  return Response.json({ coupons: result.rows });
}

// POST /api/coupons       — create
// DELETE /api/coupons     — delete { id }
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  if (request.method === "DELETE") {
    const { id } = await request.json();
    await db.execute(sql`DELETE FROM coupons WHERE id = ${id}`);
    return Response.json({ ok: true });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const {
      code,
      discount_type,
      discount_value,
      max_uses,
      expires_at,
      notes,
    } = body;

    if (!code || !discount_type || discount_value == null) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    try {
      await db.execute(sql`
        INSERT INTO coupons (id, code, discount_type, discount_value, max_uses, expires_at, notes, created_at)
        VALUES (
          ${id},
          ${code.toUpperCase().trim()},
          ${discount_type},
          ${discount_value},
          ${max_uses ?? null},
          ${expires_at ?? null},
          ${notes ?? null},
          NOW()
        )
      `);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return Response.json({ error: "Coupon code already exists" }, { status: 409 });
      }
      throw err;
    }

    const result = await db.execute(sql`
      SELECT id, code, discount_type, discount_value, max_uses, uses, expires_at, notes, created_at
      FROM coupons WHERE id = ${id}
    `);

    return Response.json({ coupon: result.rows[0] });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
