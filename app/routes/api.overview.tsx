/**
 * Admin overview metrics — straight from Postgres, IST-bucketed.
 * Revenue logic mirrors the MSL dashboard (the authoritative source):
 *   revenue(₹) = INR + USD*FX + B2B,  status='paid',  day = created_at + 5.5h (IST)
 *
 * GET /api/overview  → { periods: {today,yesterday,last7,last30,allTime}, daily: [...] }
 */
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/api.overview";

const DEFAULT_FX = 94; // 1 USD = ₹94 (matches MSL dashboard)

// B2B deals closed off-platform, keyed by IST date (YYYY-MM-DD). Keep in sync with MSL.
const B2B_BY_DATE: Record<string, number> = {
  "2026-06-02": 15000,
  "2026-06-03": 2550,
  "2026-06-13": 9650,
};

function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function b2bSum(start: string, end: string): number {
  return Object.entries(B2B_BY_DATE)
    .filter(([d]) => d >= start && d <= end)
    .reduce((s, [, v]) => s + v, 0);
}
const cents = (n: unknown) => Number(n ?? 0) / 100;

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const today = istToday();
    const yesterday = shift(today, -1);
    const d7 = shift(today, -6);
    const d30 = shift(today, -29);
    const calStart = shift(today, -29);

    const q = async (query: any) => (await db.execute(query)).rows as any[];

    // Revenue for a date range (inclusive), IST-bucketed, status='paid'
    const revRange = (start: string, end: string) =>
      q(sql`SELECT
              COALESCE(SUM(CASE WHEN currency='INR' THEN amount_cents END),0)::bigint AS inr,
              COALESCE(SUM(CASE WHEN currency<>'INR' THEN amount_cents END),0)::bigint AS usd,
              COUNT(*)::int AS orders
            FROM payment_orders
            WHERE status='paid'
              AND DATE(created_at + INTERVAL '5.5 hours') BETWEEN ${start}::date AND ${end}::date`);
    const revAll = () =>
      q(sql`SELECT
              COALESCE(SUM(CASE WHEN currency='INR' THEN amount_cents END),0)::bigint AS inr,
              COALESCE(SUM(CASE WHEN currency<>'INR' THEN amount_cents END),0)::bigint AS usd,
              COUNT(*)::int AS orders
            FROM payment_orders WHERE status='paid'`);
    const sigRange = (start: string, end: string) =>
      q(sql`SELECT COUNT(*)::int AS c FROM "user"
            WHERE DATE(created_at + INTERVAL '5.5 hours') BETWEEN ${start}::date AND ${end}::date`);
    const sigAll = () => q(sql`SELECT COUNT(*)::int AS c FROM "user"`);
    const outreachRange = (start: string, end: string) =>
      q(sql`SELECT COUNT(*)::int AS c FROM outreach_orders
            WHERE DATE(created_at + INTERVAL '5.5 hours') BETWEEN ${start}::date AND ${end}::date`);
    const outreachAll = () => q(sql`SELECT COUNT(*)::int AS c FROM outreach_orders`);

    const [
      rToday, rYest, r7, r30, rAll,
      sToday, sYest, s7, s30, sAll,
      oToday, oYest, o7, o30, oAll,
      dailyRev, dailySig,
    ] = await Promise.all([
      revRange(today, today), revRange(yesterday, yesterday), revRange(d7, today), revRange(d30, today), revAll(),
      sigRange(today, today), sigRange(yesterday, yesterday), sigRange(d7, today), sigRange(d30, today), sigAll(),
      outreachRange(today, today), outreachRange(yesterday, yesterday), outreachRange(d7, today), outreachRange(d30, today), outreachAll(),
      q(sql`SELECT DATE(created_at + INTERVAL '5.5 hours') AS day,
              COALESCE(SUM(CASE WHEN currency='INR' THEN amount_cents END),0)::bigint AS inr,
              COALESCE(SUM(CASE WHEN currency<>'INR' THEN amount_cents END),0)::bigint AS usd,
              COUNT(*)::int AS orders
            FROM payment_orders WHERE status='paid'
              AND DATE(created_at + INTERVAL '5.5 hours') >= ${calStart}::date GROUP BY day`),
      q(sql`SELECT DATE(created_at + INTERVAL '5.5 hours') AS day, COUNT(*)::int AS c FROM "user"
            WHERE DATE(created_at + INTERVAL '5.5 hours') >= ${calStart}::date GROUP BY day`),
    ]);

    const triple = (row: any, b2b: number) => {
      const inr = cents(row?.inr), usd = cents(row?.usd);
      const db_ = inr + usd * DEFAULT_FX;
      return { inr, usd, b2b, revenue: db_ + b2b, orders: Number(row?.orders ?? 0) };
    };
    const num = (rows: any[]) => Number(rows[0]?.c ?? 0);

    const periods = {
      today:    { rev: triple(rToday[0], b2bSum(today, today)),       signups: num(sToday), outreach: num(oToday) },
      yesterday:{ rev: triple(rYest[0], b2bSum(yesterday, yesterday)), signups: num(sYest), outreach: num(oYest) },
      last7:    { rev: triple(r7[0],   b2bSum(d7, today)),            signups: num(s7),    outreach: num(o7) },
      last30:   { rev: triple(r30[0],  b2bSum(d30, today)),           signups: num(s30),   outreach: num(o30) },
      allTime:  { rev: triple(rAll[0], Object.values(B2B_BY_DATE).reduce((s, v) => s + v, 0)), signups: num(sAll), outreach: num(oAll) },
    };

    // 30-day daily series for the trend chart
    const dayStr = (d: any) => String(d).split("T")[0];
    const revMap: Record<string, any> = {};
    for (const r of dailyRev) revMap[dayStr(r.day)] = r;
    const sigMap: Record<string, number> = {};
    for (const r of dailySig) sigMap[dayStr(r.day)] = r.c;
    const daily: any[] = [];
    for (let i = 0; i < 30; i++) {
      const ds = shift(calStart, i);
      const r = revMap[ds];
      const inr = cents(r?.inr), usd = cents(r?.usd);
      daily.push({
        day: ds,
        revenue: Math.round(inr + usd * DEFAULT_FX + (B2B_BY_DATE[ds] ?? 0)),
        signups: sigMap[ds] ?? 0,
        orders: Number(r?.orders ?? 0),
      });
    }

    return Response.json({ fxRate: DEFAULT_FX, today, periods, daily, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
