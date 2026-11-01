// Read-only access for the /old Career Coach archive.
//
// cc-backend kept its data in its own Postgres database (`careercoach`, on the
// same server as the main platform). CAREERCOACH_DATABASE_URL points at it;
// the main platform reads (sign-in method, logins, tool usage) use the admin
// panel's own DATABASE_URL, as cc-backend's MAIN_PLATFORM_DATABASE_URL did.
// Every query runs inside a READ ONLY transaction.
import pg from "pg";
import mainDb from "~/lib/db.server";

export const CC_DB_NOT_CONFIGURED =
  "The Career Coach archive database is not configured (CAREERCOACH_DATABASE_URL is not set), so this page has no data.";

let ccPool: pg.Pool | null | undefined;

function careerCoachPool(): pg.Pool | null {
  if (ccPool !== undefined) return ccPool;
  const url = process.env.CAREERCOACH_DATABASE_URL;
  ccPool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null;
  return ccPool;
}

export function careerCoachConfigured(): boolean {
  return Boolean(process.env.CAREERCOACH_DATABASE_URL);
}

export type Query = <R = Record<string, any>>(text: string, params?: unknown[]) => Promise<R[]>;

async function readOnly<T>(pool: pg.Pool, fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL TimeZone = 'UTC'");
    await client.query("SET LOCAL statement_timeout = 60000");
    const q: Query = async (text, params) => (await client.query(text, params as any[])).rows;
    const out = await fn(q);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Run fn against the careercoach database, read only. */
export function withCareerCoach<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const pool = careerCoachPool();
  if (!pool) throw new Error(CC_DB_NOT_CONFIGURED);
  return readOnly(pool, fn);
}

/** Run fn against the main platform database, read only. */
export function withMainPlatform<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  return readOnly(mainDb.$client as pg.Pool, fn);
}
