import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.coupons";

// Schema (existing table):
// id SERIAL, code TEXT, discount_type TEXT, discount_value NUMERIC,
// max_uses INTEGER, uses INTEGER, valid_from TIMESTAMPTZ,
// valid_until TIMESTAMPTZ, distributor_name TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ

// GET /api/coupons
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db.execute(sql`
    SELECT id, code, discount_type, discount_value, max_uses, uses,
           valid_from, valid_until, distributor_name, is_active, created_at
    FROM coupons
    ORDER BY created_at DESC
  `);

  return Response.json({ coupons: result.rows });
}

// POST /api/coupons  — create
// DELETE /api/coupons — delete { id }
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (request.method === "DELETE") {
    const { id } = await request.json();
    await db.execute(sql`DELETE FROM coupons WHERE id = ${id}`);
    return Response.json({ ok: true });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { code, discount_type, discount_value, max_uses, valid_until, distributor_name } = body;

    if (!code || !discount_type || discount_value == null) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      const result = await db.execute(sql`
        INSERT INTO coupons (code, discount_type, discount_value, max_uses, valid_from, valid_until, distributor_name, is_active, created_at)
        VALUES (
          ${code.toUpperCase().trim()},
          ${discount_type},
          ${discount_value},
          ${max_uses ?? null},
          NOW(),
          ${valid_until ?? null},
          ${distributor_name ?? null},
          true,
          NOW()
        )
        RETURNING id, code, discount_type, discount_value, max_uses, uses,
                  valid_from, valid_until, distributor_name, is_active, created_at
      `);
      return Response.json({ coupon: result.rows[0] });
    } catch (err: any) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return Response.json({ error: "Coupon code already exists" }, { status: 409 });
      }
      throw err;
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
