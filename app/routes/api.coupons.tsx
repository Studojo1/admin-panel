import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import type { Route } from "./+types/api.coupons";
import { bannedCouponWord } from "~/lib/coupon-words";

// Schema (existing table):
// id SERIAL, code TEXT, discount_type TEXT, discount_value NUMERIC,
// max_uses INTEGER, uses INTEGER, valid_from TIMESTAMPTZ,
// valid_until TIMESTAMPTZ, distributor_name TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ
//
// Human review (audit OP-N13): a new coupon is created inactive with
// review_status='pending' and only goes live when a second admin approves it.
// review_status NULL = a code from before review existed (or minted by another
// service); it keeps its is_active as-is. Nullable columns added here, the same
// runtime pattern api.campus-ambassadors.tsx uses; job-outreach-svc's ORM
// ignores them and only redeems is_active codes, so pending codes can't be used.
let reviewColumnsReady: Promise<unknown> | null = null;
function ensureReviewColumns() {
  reviewColumnsReady ??= db.execute(sql`
    ALTER TABLE coupons
      ADD COLUMN IF NOT EXISTS review_status TEXT,
      ADD COLUMN IF NOT EXISTS created_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
  `).catch((e) => { reviewColumnsReady = null; throw e; });
  return reviewColumnsReady;
}

// Coupons hand out money, so only admin/ops accounts may list or change them
// (requireAdmin, same gate as every other /api route).

const COLUMNS = sql`id, code, discount_type, discount_value, max_uses, uses,
           valid_from, valid_until, distributor_name, is_active, created_at,
           review_status, created_by, reviewed_by, reviewed_at`;

// GET /api/coupons
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureReviewColumns();

  const result = await db.execute(sql`
    SELECT ${COLUMNS}
    FROM coupons
    ORDER BY created_at DESC
  `);

  return Response.json({ coupons: result.rows, me: user.email });
}

// POST /api/coupons  — create (lands as pending review)
// PATCH /api/coupons — review { id, action: "approve" | "reject" | "deactivate" }
// DELETE /api/coupons — delete { id }
export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureReviewColumns();

  if (request.method === "PATCH") {
    const { id, action: op } = await request.json();
    const found = await db.execute(sql`SELECT code, distributor_name, review_status, created_by FROM coupons WHERE id = ${id}`);
    const c = found.rows[0] as { code: string; distributor_name: string | null; review_status: string | null; created_by: string | null } | undefined;
    if (!c) return Response.json({ error: "Coupon not found" }, { status: 404 });

    if (op === "approve") {
      if (c.review_status !== "pending") {
        return Response.json({ error: "Only a coupon waiting for review can be approved" }, { status: 409 });
      }
      // The review has to be a second pair of eyes, not the creator.
      if (c.created_by && c.created_by.toLowerCase() === user.email.toLowerCase()) {
        return Response.json({ error: "Another admin has to approve a coupon you created" }, { status: 403 });
      }
      const bad = bannedCouponWord(c.code) ?? bannedCouponWord(c.distributor_name);
      if (bad) return Response.json({ error: `This code contains a banned word (${bad}). Reject it.` }, { status: 400 });
      const r = await db.execute(sql`
        UPDATE coupons SET is_active = true, review_status = 'approved', reviewed_by = ${user.email}, reviewed_at = NOW()
        WHERE id = ${id} AND review_status = 'pending'
        RETURNING ${COLUMNS}`);
      return Response.json({ coupon: r.rows[0] });
    }
    if (op === "reject" || op === "deactivate") {
      const r = await db.execute(sql`
        UPDATE coupons SET is_active = false,
          review_status = ${op === "reject" ? "rejected" : c.review_status},
          reviewed_by = ${user.email}, reviewed_at = NOW()
        WHERE id = ${id}
        RETURNING ${COLUMNS}`);
      return Response.json({ coupon: r.rows[0] });
    }
    return Response.json({ error: "Unknown review action" }, { status: 400 });
  }

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
    // OP-N13: refuse codes (or internal labels) that carry a slur or a joke.
    const bad = bannedCouponWord(code) ?? bannedCouponWord(distributor_name);
    if (bad) {
      return Response.json({ error: `Coupon code or source contains a banned word (${bad}). Pick a neutral code.` }, { status: 400 });
    }

    try {
      const result = await db.execute(sql`
        INSERT INTO coupons (code, discount_type, discount_value, max_uses, valid_from, valid_until, distributor_name, is_active, created_at, review_status, created_by)
        VALUES (
          ${code.toUpperCase().trim()},
          ${discount_type},
          ${discount_value},
          ${max_uses ?? 100},
          NOW(),
          ${valid_until ?? null},
          ${distributor_name ?? null},
          false,
          NOW(),
          'pending',
          ${user.email}
        )
        RETURNING ${COLUMNS}
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
