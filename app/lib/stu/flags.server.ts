// Server side of the Auditor flags (flags.ts has the rules and the words, flags.sql.ts the reads).
// Read only. Each check is its own short read-only transaction with a statement timeout, run a few at a
// time, so one that errors or times out is reported as not checked and the rest still show. Results are
// kept two minutes. Staff, @studojo.com, the test accounts and guests are left out as on every Stu page.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { internalReason, stuData, testUsers } from "./data.server";
import { maskNumber } from "./auditor";
import { type Flag, type FlagReport, FLAG_BY_KEY, FLAG_CAP, SEAT_CAP, buildFlag, flagWindow, istDay, newestFirst } from "./flags";
import { SEATS_SQL, flagQueries, jobTitlesSql } from "./flags.sql";

const TTL_MS = 120_000;
const PARALLEL = 4;

type Rows = any[];

async function read(text: string): Promise<Rows> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
      return (await tx.execute(sql.raw(text) as SQL)).rows as Rows;
    },
    { accessMode: "read only" },
  );
}

/** Runs the jobs at most `n` at a time. */
async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, jobs.length) }, async () => {
      for (let i = next++; i < jobs.length; i = next++) out[i] = await jobs[i]();
    }),
  );
  return out;
}

async function load(from: number, to: number, internal: boolean): Promise<FlagReport> {
  const now = Date.now();
  const missing: string[] = [];
  const capped: string[] = [];

  const queries = flagQueries({
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    dayFrom: istDay(from),
    dayTo: istDay(to),
    floodFrom: new Date(Math.max(from, to - 72 * 3_600_000)).toISOString(),
  });

  const tables = new Set<string>(
    (await read(`
      SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE ((n.nspname = 'career_agent') OR (n.nspname = 'public' AND c.relname IN ('tickets', 'user')))
         AND c.relkind IN ('r', 'p', 'v') AND has_table_privilege(c.oid, 'SELECT')`)).map((r) => String(r.t)),
  );

  const results = await pool(
    queries.map((q) => async () => {
      const lacks = q.needs.filter((t) => !tables.has(t));
      if (lacks.length) {
        missing.push(`${q.name} (no ${lacks.join(", ")} here)`);
        return { q, rows: [] as Rows };
      }
      try {
        const rows = await read(q.sql);
        if (rows.length > FLAG_CAP) capped.push(q.name);
        return { q, rows: rows.slice(0, FLAG_CAP) };
      } catch (err: any) {
        console.error("[auditor flags]", q.name, err);
        missing.push(`${q.name} (read failed: ${String(err?.message || err).slice(0, 100)})`);
        return { q, rows: [] as Rows };
      }
    }),
    PARALLEL,
  );

  let seats: FlagReport["seats"] = null;
  if (tables.has("career_channel_links")) {
    try {
      seats = { active: Number((await read(SEATS_SQL))[0]?.active ?? 0), cap: SEAT_CAP };
    } catch (err) {
      console.error("[auditor flags] seats", err);
      missing.push("WhatsApp seats (read failed)");
    }
  }

  // Job titles for the weak picks (primary key lookups, at most a few per flag).
  const jobs = new Map<string, string>();
  const jobIds = new Set<string>();
  for (const { q, rows } of results) {
    if (q.type === "WEAK_PICK") for (const r of rows) for (const s of (Array.isArray(r.sample) ? r.sample : []).slice(0, 3)) jobIds.add(String(s.job));
  }
  if (jobIds.size && tables.has("career_jobs")) {
    try {
      for (const r of await read(jobTitlesSql([...jobIds].slice(0, 400)))) jobs.set(String(r.id), `${String(r.title || "job").slice(0, 60)}${r.company ? ` at ${String(r.company).slice(0, 40)}` : ""}`);
    } catch (err) {
      console.error("[auditor flags] titles", err);
    }
  }

  // Build the flags, one per student and type (the latest), before the people are known.
  type Draft = Omit<Flag, "email" | "name" | "internal"> & { email?: string; name?: string };
  const drafts = new Map<string, Draft>();
  for (const { q, rows } of results) {
    const type = FLAG_BY_KEY.get(q.type)!;
    for (const r of rows) {
      const built = buildFlag(q.type, r, { now, jobs });
      if (!built) continue;
      const who = r.user_id ?? (r.address ? `number ${maskNumber(String(r.address))}` : r.user_email ? String(r.user_email) : String(r.id ?? ""));
      const id = `${q.type}:${who}`;
      const at = Number(r.at);
      const have = drafts.get(id);
      if (have && have.at >= at) continue;
      drafts.set(id, {
        id, type: q.type, severity: type.severity, user: r.user_id ?? null, at, what: built.what, evidence: built.evidence,
        email: r.user_id ? undefined : r.address ? `number ${maskNumber(String(r.address))}` : String(r.user_email || ""),
        name: r.user_id ? undefined : String(r.user_name || ""),
        ...(q.type === "OPEN_TICKET" ? { href: `/tickets/${r.id}` } : {}),
      });
    }
  }

  // The people.
  const ids = [...new Set([...drafts.values()].map((d) => d.user).filter((x): x is string => !!x))];
  const people = new Map<string, { email: string; name: string; role: string | null }>();
  for (let i = 0; i < ids.length; i += 500) {
    for (const r of await read(`SELECT id, email, name, role FROM public."user" WHERE id = ANY (ARRAY[${ids.slice(i, i + 500).map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[])`)) {
      people.set(String(r.id), { email: r.email ?? "", name: r.name ?? "", role: r.role ?? null });
    }
  }
  const tests = testUsers();
  // As the Failures tab: the Stu dataset's internal flags add the shared-browser rule (an account on the same visitor id as a team account).
  const shared = new Map((await stuData().catch(() => null))?.users.filter((u) => u.internal).map((u) => [u.id, u.internal!]) ?? []);
  const flags: Flag[] = [];
  for (const d of drafts.values()) {
    const p = d.user ? people.get(d.user) : undefined;
    const email = p?.email ?? d.email ?? "";
    const name = p?.name ?? d.name ?? "";
    const why = (d.user || email.includes("@") ? internalReason({ id: d.user ?? "", email, role: p?.role ?? null }, tests) : null) ?? (d.user ? shared.get(d.user) ?? null : null);
    if (why && !internal) continue;
    flags.push({ ...d, email, name, internal: why });
  }

  const env = await read(`SELECT current_database() AS db`).then((r) => (/staging/i.test(String(r[0]?.db ?? "")) ? "staging" : "production")).catch(() => "unknown");
  return { generatedAt: new Date().toISOString(), env, from, to, flags: newestFirst(flags), seats, missing, capped };
}

const cache = new Map<string, { at: number; data: Promise<FlagReport> }>();

/** The flags for a window (hours back, or IST days), at most two minutes old (fresh: read now). */
export function flagReport(q: { hours?: string | null; start?: string | null; end?: string | null }, internal: boolean, fresh = false): Promise<FlagReport> {
  const now = Date.now();
  const w = flagWindow(q, now);
  const key = `${w.key}|${internal ? 1 : 0}`;
  const hit = cache.get(key);
  if (!fresh && hit && now - hit.at < TTL_MS) return hit.data;
  const data = load(w.from, w.to, internal);
  if (cache.size > 30) cache.clear();
  cache.set(key, { at: now, data });
  data.catch(() => {
    if (cache.get(key)?.data === data) cache.delete(key);
  });
  return data;
}
