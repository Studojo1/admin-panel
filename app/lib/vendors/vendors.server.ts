// Vendors and credits, server side: the usage log from this environment's own
// database (career_agent.career_vendor_calls, written by career-agent) plus the
// two balances (balance.server.ts). One small read-only query: per vendor, kind
// and IST day over the last 31 days, on the (vendor, at) index. Until the table
// exists the page shows "no usage log yet" instead of failing.
import { sql } from "drizzle-orm";
import db from "~/lib/db.server";
import { balances } from "./balance.server";
import { type DayRow, type VendorsReport, buildReport } from "./model";

async function readUsage(): Promise<{ live: boolean; rows: DayRow[] }> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      const reg = await tx.execute(sql`SELECT to_regclass('career_agent.career_vendor_calls') IS NOT NULL AS live`);
      if (!(reg.rows[0] as any)?.live) return { live: false, rows: [] };
      const res = await tx.execute(sql`
        SELECT vendor,
               kind,
               to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               count(*)::int AS calls,
               count(*) FILTER (WHERE ok IS FALSE)::int AS failed,
               count(*) FILTER (WHERE ok IS NULL)::int AS pending,
               count(*) FILTER (WHERE credits_spent > 0)::int AS hits,
               coalesce(sum(credits_spent), 0)::float8 AS credits
          FROM career_agent.career_vendor_calls
         WHERE at >= now() - interval '31 days'
         GROUP BY 1, 2, 3`);
      const rows = (res.rows as any[]).map((r) => ({
        vendor: String(r.vendor),
        kind: String(r.kind),
        day: String(r.day),
        calls: Number(r.calls) || 0,
        failed: Number(r.failed) || 0,
        pending: Number(r.pending) || 0,
        hits: Number(r.hits) || 0,
        credits: Number(r.credits) || 0,
      }));
      return { live: true, rows };
    },
    { accessMode: "read only" },
  );
}

/** Everything /vendors draws. Balances are at most 10 minutes old; the log is read now. */
export async function vendorsReport(): Promise<VendorsReport> {
  const [usage, bal] = await Promise.all([readUsage(), balances()]);
  return buildReport(usage.rows, bal, Date.now(), usage.live);
}
