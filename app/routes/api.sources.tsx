/**
 * Where users came from, by channel, straight from Postgres.
 *
 * GET /api/sources?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns:
 *   channels  one row per channel for people who SIGNED UP in the range:
 *             signups, then how many of those ever uploaded a resume, got
 *             leads and paid real money, plus the revenue they brought
 *   daily     signups per channel per day (IST), every day in the range
 *
 * Source is the first-touch record written at signup (user_attribution),
 * folded into dashboard channels by channelOf, so Meta's own "ig/paid" and a
 * hand-typed "meta/paid" land in the same row. Visitors per channel come from
 * PostHog and are added in the browser.
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import { CHANNELS, channelOf, type ChannelKey } from "~/lib/utm-dictionary";
import type { Route } from "./+types/api.sources";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => Number(v ?? 0);

type Totals = { signups: number; resumes: number; leads: number; paid: number; inr: number; usd: number };
const blank = (): Totals => ({ signups: 0, resumes: 0, leads: 0, paid: 0, inr: 0, usd: 0 });

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  if (!DAY_RE.test(start) || !DAY_RE.test(end) || start > end) {
    return Response.json({ error: "start and end required as YYYY-MM-DD" }, { status: 400 });
  }

  try {
    // Days bucketed in IST (+5:30), like /api/dashboard, so the two line up.
    // Grouped by the raw values and folded into channels below: the fold is
    // TypeScript shared with the browser, not something to duplicate in SQL.
    const r = await db.execute(sql`
      SELECT DATE(u.created_at + INTERVAL '330 minutes') AS day,
             a.utm_source, a.utm_medium,
             nullif(split_part(split_part(a.referrer, '://', 2), '/', 1), '') AS ref_host,
             (a.user_id IS NOT NULL) AS captured,
             count(*)::int AS signups,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM candidates c WHERE c.user_id = u.id))::int AS resumes,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM candidates c JOIN leads l ON l.candidate_id = c.id WHERE c.user_id = u.id))::int AS leads,
             count(*) FILTER (WHERE pay.n > 0)::int AS paid,
             coalesce(sum(pay.inr), 0) AS inr,
             coalesce(sum(pay.usd), 0) AS usd
      FROM "user" u
      LEFT JOIN user_attribution a ON a.user_id = u.id
        -- Only a record written at signup is the first touch. A row written at a later
        -- login (old users get one the first time they sign in) is a return visit.
        -- u.created_at is UTC without a time zone; a.created_at carries one.
        AND a.created_at <= (u.created_at AT TIME ZONE 'UTC') + INTERVAL '1 hour'
      LEFT JOIN LATERAL (
        -- Real money only: a credit-covered or 100% coupon order is not revenue.
        SELECT count(*) AS n,
               coalesce(sum(p.amount_cents - coalesce(p.refunded_cents, 0)) FILTER (WHERE upper(p.currency) = 'INR'), 0) / 100.0 AS inr,
               coalesce(sum(p.amount_cents - coalesce(p.refunded_cents, 0)) FILTER (WHERE upper(p.currency) = 'USD'), 0) / 100.0 AS usd
        FROM payment_orders p
        WHERE p.user_id = u.id AND p.status IN ('paid', 'completed') AND p.amount_cents > 0
      ) pay ON TRUE
      WHERE DATE(u.created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date
        AND u.email NOT ILIKE '%@example.com' AND u.email NOT ILIKE '%studojo.test%'
      GROUP BY 1, 2, 3, 4, 5
    `);

    const dayStr = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
    const totals = new Map<ChannelKey, Totals>();
    const perDay = new Map<string, Partial<Record<ChannelKey, number>>>();

    for (const row of r.rows as any[]) {
      const key: ChannelKey = row.captured
        ? channelOf(row.utm_source, row.utm_medium, row.ref_host)
        : "not_captured";
      const t = totals.get(key) ?? blank();
      t.signups += num(row.signups);
      t.resumes += num(row.resumes);
      t.leads += num(row.leads);
      t.paid += num(row.paid);
      t.inr += num(row.inr);
      t.usd += num(row.usd);
      totals.set(key, t);

      const d = dayStr(row.day);
      const day = perDay.get(d) ?? {};
      day[key] = (day[key] ?? 0) + num(row.signups);
      perDay.set(d, day);
    }

    const channels = CHANNELS.filter((c) => totals.has(c.key)).map((c) => ({ ...c, ...totals.get(c.key)! }));

    // Every day in the range, so the grid has no gaps.
    const daily: Array<{ day: string } & Partial<Record<ChannelKey, number>>> = [];
    for (let d = new Date(start + "T00:00:00Z"); dayStr(d) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = dayStr(d);
      daily.push({ day: ds, ...(perDay.get(ds) ?? {}) });
    }

    return Response.json({ start, end, channels, daily });
  } catch (err: any) {
    console.error("[sources]", err);
    return Response.json({ error: "Source report query failed" }, { status: 500 });
  }
}
