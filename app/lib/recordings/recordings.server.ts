// Recordings (5 Nov 2026): the server side of /recordings. Read only: one short read only transaction for the index
// rows of a range (career_agent.career_recordings, by started_at) and the journey events of just those people (by
// user and visitor id, through career_journey_events' user and visitor indexes), and the chunks from Azure Blob
// (blob.server.ts). The model (model.ts) has the rules and the words.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { internalReason, channelOfTouch, testUsers } from "~/lib/stu/data.server";
import { JOURNEY_NAME_TO_STEP, STEPS, addDays } from "~/lib/stu/model";
import { blobConfigured, getBytes, listNames } from "./blob.server";
import {
  type JourneyEv, type RecRow, type RecordingDetail, type RecordingsEnvelope, furthestStep, parseChunkName, personEvents, tracksOf, visitPrefix,
} from "./model";

export type { RecordingDetail, RecordingsEnvelope } from "./model";

const R = "career_agent.career_recordings";
const J = "career_agent.career_journey_events";
const ROW_CAP = 1000;
const ID_RE = /^[0-9a-z]{8,9}-[0-9a-z]{10}$/;
const PERSON_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
/** Journey rows that are not steps of the funnel, left off the timeline (one a page view, one a day). */
const QUIET = ["page_view", "page_engaged", "active_day", "feature_used"];
const ORDER = STEPS.map((s) => s.key as string);

async function read<T>(fn: (q: (s: SQL) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

const lit = (xs: readonly string[]) => `ARRAY[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[]`;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function toRow(r: any, evs: JourneyEv[], tests: string[]): RecRow {
  const started = Number(r.started);
  const last = Number(r.last);
  const touch = r.last_touch && Object.keys(r.last_touch).length ? r.last_touch : r.first_touch;
  const mine = personEvents(evs, r.user_id ?? null, r.visitor_id ?? null);
  const inVisit = mine.filter((e) => e.at >= started - 60_000 && e.at <= last + 60_000);
  const signedUpHere = inVisit.some((e) => e.step === "signed_up");
  const staff = r.user_id ? internalReason({ id: String(r.user_id), email: r.email ?? null, role: r.role ?? null }, tests) : null;
  return {
    id: String(r.id),
    started,
    last,
    visitorId: r.visitor_id ?? null,
    userId: r.user_id ?? null,
    email: r.email ?? null,
    device: r.device ?? null,
    inapp: r.inapp ?? null,
    entryPath: r.entry_path ?? null,
    hosts: arr(r.hosts),
    pages: arr(r.pages),
    chunks: Number(r.chunks) || 0,
    bytes: Number(r.bytes) || 0,
    internal: r.internal ?? staff,
    channel: channelOfTouch(touch),
    source: typeof touch?.utm_source === "string" ? touch.utm_source.slice(0, 80) : null,
    campaign: typeof touch?.utm_campaign === "string" ? touch.utm_campaign.slice(0, 80) : null,
    furthest: furthestStep(mine, started, last, JOURNEY_NAME_TO_STEP, ORDER),
    signedUp: Boolean(r.user_id) || signedUpHere,
    signedUpHere,
  };
}

const ROW_SQL = (where: SQL) => sql`
  SELECT r.id, (extract(epoch from r.started_at) * 1000)::float8 AS started, (extract(epoch from r.last_at) * 1000)::float8 AS last,
         r.visitor_id, r.user_id, u.email, u.role, r.device, r.inapp, r.entry_path, r.hosts, r.pages, r.chunks,
         r.bytes::float8 AS bytes, r.internal, r.first_touch, r.last_touch, r.container
    FROM ${sql.raw(R)} r LEFT JOIN public."user" u ON u.id = r.user_id
   WHERE ${where}`;

async function eventsFor(q: (s: SQL) => Promise<any[]>, users: string[], visitors: string[], from: number, to: number, quiet = true): Promise<JourneyEv[]> {
  const u = users.filter((x) => PERSON_RE.test(x));
  const v = visitors.filter((x) => PERSON_RE.test(x));
  if (!u.length && !v.length) return [];
  const rows = await q(sql`
    SELECT (extract(epoch from at) * 1000)::float8 AS at, step, user_id, visitor_id
      FROM ${sql.raw(J)}
     WHERE at >= to_timestamp(${(from - 60_000) / 1000}) AND at < to_timestamp(${(to + 60_000) / 1000})
       AND (user_id = ANY(${sql.raw(lit(u))}) OR visitor_id = ANY(${sql.raw(lit(v))}))
       ${quiet ? sql`AND step <> ALL(${sql.raw(lit(QUIET))})` : sql``}
     ORDER BY at
     LIMIT 50000`);
  return rows.map((r) => ({ at: Number(r.at), step: String(r.step), userId: r.user_id ?? null, visitorId: r.visitor_id ?? null }));
}

async function envOf(q: (s: SQL) => Promise<any[]>): Promise<{ env: RecordingsEnvelope["env"]; live: boolean; journey: boolean }> {
  const reg = (await q(sql`
    SELECT to_regclass('career_agent.career_recordings') IS NOT NULL AS r,
           to_regclass('career_agent.career_journey_events') IS NOT NULL AS j,
           current_database() AS db`))[0] ?? {};
  const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : reg.db ? "production" : "unknown";
  return { env, live: Boolean(reg.r), journey: Boolean(reg.j) };
}

/** A person's visitor ids: their source row's and the ones their journey events carry (at most 20). */
async function visitorIdsOf(q: (s: SQL) => Promise<any[]>, userId: string): Promise<string[]> {
  const rows = await q(sql`
    SELECT visitor_id FROM career_agent.career_user_source WHERE user_id = ${userId} AND visitor_id IS NOT NULL
    UNION
    SELECT DISTINCT visitor_id FROM (
      SELECT visitor_id FROM ${sql.raw(J)} WHERE user_id = ${userId} AND visitor_id IS NOT NULL ORDER BY at DESC LIMIT 200) x
    LIMIT 20`);
  return rows.map((r) => String(r.visitor_id)).filter((v) => PERSON_RE.test(v));
}

export async function listRecordings(start: string, end: string, person: string | null): Promise<RecordingsEnvelope> {
  const t0 = Date.now();
  const from = `${start}T00:00:00+05:30`;
  const to = `${addDays(end, 1)}T00:00:00+05:30`;
  const tests = testUsers();
  const steps = STEPS.map((s) => ({ key: s.key as string, label: s.label as string, n: s.n as string }));
  const out = await read(async (q) => {
    const e = await envOf(q);
    if (!e.live) return { ...e, rows: [] as RecRow[], capped: false };
    let where = sql`r.started_at >= ${from}::timestamptz AND r.started_at < ${to}::timestamptz`;
    if (person && PERSON_RE.test(person)) {
      const vids = e.journey ? await visitorIdsOf(q, person).catch(() => [] as string[]) : [];
      where = sql`${where} AND (r.user_id = ${person} OR r.visitor_id = ${person} OR r.visitor_id = ANY(${sql.raw(lit(vids))}))`;
    }
    const raw = await q(sql`${ROW_SQL(where)} ORDER BY r.started_at DESC LIMIT ${ROW_CAP + 1}`);
    const capped = raw.length > ROW_CAP;
    const rows = raw.slice(0, ROW_CAP);
    let evs: JourneyEv[] = [];
    if (e.journey && rows.length) {
      const minStart = Math.min(...rows.map((r) => Number(r.started)));
      const maxLast = Math.max(...rows.map((r) => Number(r.last)));
      evs = await eventsFor(q, rows.map((r) => r.user_id).filter(Boolean), rows.map((r) => r.visitor_id).filter(Boolean), minStart, maxLast);
    }
    return { ...e, rows: rows.map((r) => toRow(r, evs, tests)), capped };
  });
  return { env: out.env, live: out.live, storage: blobConfigured(), rows: out.rows, capped: out.capped, steps, ms: Date.now() - t0 };
}

/** One visit: its row, its chunks as tracks to play, and the person's journey in it. Null when there is no such visit. */
export async function recordingDetail(id: string): Promise<RecordingDetail | null> {
  if (!ID_RE.test(id)) return null;
  const found = await read(async (q) => {
    const e = await envOf(q);
    if (!e.live) return null;
    const [r] = await q(ROW_SQL(sql`r.id = ${id}`));
    if (!r) return null;
    const evs = e.journey ? await eventsFor(q, r.user_id ? [r.user_id] : [], r.visitor_id ? [r.visitor_id] : [], Number(r.started), Number(r.last)) : [];
    return { r, evs };
  });
  if (!found) return null;
  const row = toRow(found.r, found.evs, testUsers());
  const prefix = visitPrefix(id);
  const storage = blobConfigured();
  const names = storage && prefix ? await listNames(String(found.r.container), prefix) : [];
  const chunks = names.map(parseChunkName).filter((c): c is NonNullable<typeof c> => c !== null);
  return { row, tracks: tracksOf(chunks), journey: personEvents(found.evs, row.userId, row.visitorId), storage };
}

/** One chunk's gzip bytes, only when the name is one of this visit's chunks. */
export async function chunkOf(id: string, name: string): Promise<Buffer | null> {
  const prefix = ID_RE.test(id) ? visitPrefix(id) : null;
  if (!prefix || !name.startsWith(prefix) || !parseChunkName(name) || name.includes("..")) return null;
  const container = await read(async (q) => {
    const e = await envOf(q);
    if (!e.live) return null;
    const [r] = await q(sql`SELECT container FROM ${sql.raw(R)} WHERE id = ${id}`);
    return r ? String(r.container) : null;
  });
  if (!container) return null;
  return getBytes(container, name);
}
