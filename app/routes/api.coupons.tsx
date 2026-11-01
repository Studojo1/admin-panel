import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import { archiveReadOnly } from "~/lib/archive.server";
import type { Route } from "./+types/api.coupons";

// Coupons of the retired student product, for /old/coupons. The archive is
// read only (2 Nov 2026): codes are listed, never created, reviewed or deleted.
//
// Schema (existing table):
// id SERIAL, code TEXT, discount_type TEXT, discount_value NUMERIC,
// max_uses INTEGER, uses INTEGER, valid_from TIMESTAMPTZ,
// valid_until TIMESTAMPTZ, distributor_name TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ
//
// The review columns of audit OP-N13 (review_status, created_by, reviewed_by,
// reviewed_at) were added by this route at runtime and may not exist; they are
// read through to_jsonb so the list works either way, and nothing is altered.

// GET /old/api/coupons
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.transaction(
    async (tx) =>
      (
        await tx.execute(sql`
          SELECT c.id, c.code, c.discount_type, c.discount_value, c.max_uses, c.uses,
                 c.valid_from, c.valid_until, c.distributor_name, c.is_active, c.created_at,
                 to_jsonb(c)->>'review_status' AS review_status,
                 to_jsonb(c)->>'created_by' AS created_by,
                 to_jsonb(c)->>'reviewed_by' AS reviewed_by,
                 to_jsonb(c)->>'reviewed_at' AS reviewed_at
          FROM coupons c
          ORDER BY c.created_at DESC
        `)
      ).rows,
    { accessMode: "read only" },
  );

  return Response.json({ coupons: rows, me: user.email });
}

// Creating, reviewing and deleting coupons ended with the old product.
export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return archiveReadOnly();
}
