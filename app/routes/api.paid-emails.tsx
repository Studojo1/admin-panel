/**
 * Who has paid, and how much, from payment_orders: the only record of money.
 *
 * A "paid" payment_orders row is not always revenue. A 100% coupon order is
 * stored as paid with amount_cents = 0 (internal and verification coupons), so
 * counting every paid row marked team accounts as converted customers. Money is
 * counted the way /api/sources counts revenue: status paid or completed,
 * amount_cents > 0, net of refunds. Payments at the test-mode prices (₹90 and
 * $1, TEST_PLANS in job-outreach-svc core/pricing.py, used while
 * RAZORPAY_TEST_MODE was on) moved no real money and are left out.
 *
 * GET /api/paid-emails  ->  {
 *   payments: [{ email, at, currency, amount_cents, refunded_cents, plan_id, status }],  // every real-money payment, oldest first; at is UTC ISO
 *   free: string[],    // emails whose paid orders all cost nothing (a 100% coupon): got the product, paid nothing
 *   team: string[],    // team accounts (admin or ops role, or a studojo.com address): their orders are tests, not revenue
 *   emails: string[],  // emails with real money kept (net of refunds)
 * }
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.paid-emails";
import { requireAdmin } from "~/lib/auth-helper.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const money = await db.execute(sql`
      SELECT lower(u.email) AS email,
             to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
             upper(p.currency) AS currency,
             p.amount_cents,
             -- A refund in progress or done keeps nothing; a partial refund keeps the rest.
             CASE WHEN p.status IN ('refunding', 'refunded') THEN p.amount_cents
                  ELSE coalesce(p.refunded_cents, 0) END AS refunded_cents,
             p.plan_id, p.status
      FROM payment_orders p
      JOIN "user" u ON u.id = p.user_id
      WHERE p.status IN ('paid', 'completed', 'refunding', 'refunded')
        AND p.amount_cents > 0 AND u.email IS NOT NULL
        AND NOT ((upper(p.currency) = 'INR' AND p.amount_cents = 9000)
              OR (upper(p.currency) = 'USD' AND p.amount_cents = 100))
      ORDER BY p.created_at
    `);
    const free = await db.execute(sql`
      SELECT DISTINCT lower(u.email) AS email
      FROM payment_orders p
      JOIN "user" u ON u.id = p.user_id
      WHERE p.status IN ('paid', 'completed') AND coalesce(p.amount_cents, 0) = 0 AND u.email IS NOT NULL
    `);
    const team = await db.execute(sql`
      SELECT lower(email) AS email FROM "user"
      WHERE email IS NOT NULL AND (role IN ('admin', 'ops') OR email ILIKE '%@studojo.com')
    `);
    const payments = (money.rows as any[])
      .filter((r) => r.email)
      .map((r) => ({
        email: r.email, at: r.at, currency: r.currency, plan_id: r.plan_id, status: r.status,
        amount_cents: Number(r.amount_cents) || 0, refunded_cents: Number(r.refunded_cents) || 0,
      }));
    const payers = new Set(payments.map((p) => p.email));
    const kept = new Set(payments.filter((p) => p.amount_cents - p.refunded_cents > 0).map((p) => p.email));
    const freeOnly = (free.rows as any[]).map((r) => r.email).filter((e) => e && !payers.has(e));
    return Response.json({
      payments,
      free: freeOnly,
      team: (team.rows as any[]).map((r) => r.email).filter(Boolean),
      emails: [...kept],
    });
  } catch (err: any) {
    return Response.json({ error: err.message, payments: [], free: [], team: [], emails: [] }, { status: 500 });
  }
}
