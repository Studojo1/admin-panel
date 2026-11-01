// Read-only access to the retired outreach product's tables (job-outreach-svc
// wrote them; it no longer runs). Every archive read goes through readOnly():
// one pooled connection, a READ ONLY transaction, nothing can be written.
//
// Timestamps come back as the text Postgres sends, not as JS Dates, so they
// keep their microseconds and can be printed exactly as job-outreach-svc
// printed them (see pyIso in ./py.ts).
import pg from "pg";
import db from "~/lib/db.server";

const RAW = new Set([1114, 1184, 1082]); // timestamp, timestamptz, date
const INT8 = 20;
const NUMERIC = 1700;

const types = {
  getTypeParser(oid: number, format?: string) {
    if (RAW.has(oid)) return (v: string) => v;
    if (oid === INT8) return (v: string) => Number(v);
    if (oid === NUMERIC) return (v: string) => parseFloat(v);
    return pg.types.getTypeParser(oid, format as any);
  },
};

export type Row = Record<string, any>;
export type Query = (text: string, values?: unknown[]) => Promise<Row[]>;

export async function readOnly<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const pool = (db as unknown as { $client: pg.Pool }).$client;
  const client = await pool.connect();
  // A connection that drops mid-read must fail this request, not crash the server.
  let broken: Error | undefined;
  const onError = (e: Error) => {
    broken = e;
  };
  client.on("error", onError);
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 60000");
    const q: Query = async (text, values = []) =>
      (await client.query({ text, values: values as any[], types } as pg.QueryConfig)).rows;
    const out = await fn(q);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    broken ??= e as Error;
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.off("error", onError);
    client.release(broken);
  }
}

/** The JSON 500 every archive route answers when a read fails. No SQL, no stack. */
export function readFailed(where: string, e: unknown): Response {
  console.error(`[outreach-archive] ${where} failed: ${(e as Error)?.message ?? e}`);
  return Response.json(
    { error: "Could not read the outreach archive. Try again shortly." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
