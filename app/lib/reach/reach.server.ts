// Server side of /reach and the Overview's "Reached twice this week" tile (model.ts has the rules and the words). Read
// only, one transaction with a short statement timeout. The students and their internal flags come from the Stu dataset
// the other Stu pages share (data.server.ts stuData, stale-while-revalidate), so the exclusions match theirs; a student
// with a WhatsApp link the dataset lacks is read here and flagged by the same rule (internalReason). The WhatsApp rows
// are career_agent's: the links, the send ledger (career_daily_sends), the messages (career_channel_messages), the day's
// picks (career_today_picks) and the phone step's codes (career_phone_otps, in Meta's count of students we started).
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { swrCache } from "~/lib/swr-cache";
import { internalReason, stuData, testUsers } from "~/lib/stu/data.server";
import {
  type AttemptIn, type DeliveryIn, type InboundIn, type Lane, type LinkIn, type MetaDayIn, type ReachEnvelope, type StudentIn,
  REACH_DAYS, TREND_DAYS, buildReach, metaCode,
} from "./model";

const S = "career_agent";
const TABLES = ["career_channel_links", "career_daily_sends", "career_channel_messages", "career_today_picks", "career_phone_otps", "career_profiles"];
/** A business message on the ledger (rows of alias d), the product's rule (career-agent reach.server.ts BUSINESS_SQL). */
const BUSINESS = (d: string) => sql.raw(`${d}.channel <> 'email' AND ${d}.kind <> 'inbound' AND COALESCE(${d}.meta->>'dry', '') <> 'true'`);
const ms = (x: string) => sql.raw(`(extract(epoch from ${x}) * 1000)::float8`);
const istDaySql = (x: string) => sql.raw(`to_char(${x} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`);
/** Deliveries read back: the trend's 14 days plus the 7 before its first, and a day's slack. */
const DELIVERY_DAYS = TREND_DAYS + REACH_DAYS + 1;

async function read<T>(fn: (q: (s: SQL) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

/** A report under 3 minutes old is served as is; up to 10 minutes old it is served at once and rebuilt in the background. */
const reports = swrCache<ReachEnvelope>({
  freshMs: 3 * 60_000, maxStaleMs: 10 * 60_000, max: 4,
  onError: (k, err) => console.error("[reach] background rebuild failed, serving the last copy", k, err),
});

export async function reachReport(internal: boolean, fresh: boolean): Promise<ReachEnvelope> {
  const t0 = Date.now();
  const out = await reports.get(internal ? "internal" : "students", () => buildReachEnvelope(internal, fresh), fresh);
  return { ...out, ms: Date.now() - t0 };
}

async function buildReachEnvelope(internal: boolean, fresh: boolean): Promise<ReachEnvelope> {
  const t0 = Date.now();
  const [d, rows] = await Promise.all([stuData(fresh), read(readRows)]);

  // The students: the Stu dataset's people, then anyone with a WhatsApp link it lacks.
  const onboarded = new Set(rows.onboarded);
  const students: StudentIn[] = d.users.map((u) => ({ id: u.id, name: u.name, email: u.email, internal: u.internal, onboarded: onboarded.has(u.id) }));
  const known = new Set(students.map((s) => s.id));
  const tests = testUsers();
  for (const l of rows.linkUsers) {
    if (known.has(l.id)) continue;
    known.add(l.id);
    students.push({
      id: l.id, name: l.name ?? "", email: l.email ?? "",
      internal: internalReason({ id: l.id, email: l.email, role: l.role }, tests), onboarded: onboarded.has(l.id),
    });
  }

  const report = buildReach({
    now: rows.now, internal, students, links: rows.links, deliveries: rows.deliveries, lastDelivered: rows.lastDelivered,
    attempts: rows.attempts, inbound: rows.inbound, picks: rows.picks, meta: rows.meta,
  });
  return { report, generatedAt: new Date().toISOString(), env: rows.env, ms: Date.now() - t0, missing: rows.missing };
}

interface Rows {
  env: string;
  missing: boolean;
  now: number;
  links: LinkIn[];
  linkUsers: { id: string; name: string | null; email: string | null; role: string | null }[];
  deliveries: DeliveryIn[];
  lastDelivered: Record<string, number>;
  attempts: AttemptIn[];
  inbound: InboundIn[];
  picks: string[];
  onboarded: string[];
  meta: { students24h: number; days: MetaDayIn[] };
}

async function readRows(q: (s: SQL) => Promise<any[]>): Promise<Rows> {
  const reg = (await q(sql`
    SELECT current_database() AS db, (extract(epoch from now()) * 1000)::float8 AS now,
           array(SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = ${S} AND c.relname = ANY(string_to_array(${TABLES.join(",")}, ','))
                    AND has_table_privilege(c.oid, 'SELECT')) AS have`))[0] ?? {};
  const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : "production";
  const now = Number(reg.now) || Date.now();
  const have = new Set<string>(Array.isArray(reg.have) ? reg.have : []);
  const empty: Rows = {
    env, missing: true, now, links: [], linkUsers: [], deliveries: [], lastDelivered: {}, attempts: [], inbound: [], picks: [], onboarded: [],
    meta: { students24h: 0, days: [] },
  };
  if (!have.has("career_channel_links") || !have.has("career_daily_sends")) return empty;
  const hasMessages = have.has("career_channel_messages");

  const links = await q(sql`
    SELECT l.user_id, ${ms("l.created_at")} AS created, ${ms("l.unlinked_at")} AS unlinked, l.status = 'active' AS active,
           l.digest_on, ${ms("l.last_inbound_at")} AS last_in, u.name, u.email, u.role
      FROM career_agent.career_channel_links l LEFT JOIN public."user" u ON u.id = l.user_id
     WHERE l.channel = 'whatsapp'
     LIMIT 50000`);

  const deliveries = await q(sql`
    SELECT d.user_id, ${ms("d.delivered_at")} AS at,
           CASE WHEN d.meta->>'floor' = 'true' THEN 'floor' WHEN d.meta->>'catchup' = 'true' THEN 'catchup' ELSE 'other' END AS lane
      FROM career_agent.career_daily_sends d
     WHERE d.delivered_at > now() - make_interval(days => ${DELIVERY_DAYS}::int) AND ${BUSINESS("d")}
     LIMIT 300000`);

  const last = await q(sql`
    SELECT d.user_id, ${ms("max(d.delivered_at)")} AS at
      FROM career_agent.career_daily_sends d
     WHERE d.delivered_at IS NOT NULL AND ${BUSINESS("d")}
       AND d.user_id IN (SELECT user_id FROM career_agent.career_channel_links WHERE channel = 'whatsapp')
     GROUP BY 1`);

  // The latest business try in 7 days (a message tied to a ledger row, or a template), delivered by the ledger's receipt
  // or the message's own; failed by the message, the ledger, or a Meta code on either.
  const attempts = hasMessages
    ? await q(sql`
      WITH m AS (
        SELECT m.user_id, m.created_at,
               COALESCE(NULLIF(m.meta->>'error_code', ''), NULLIF(d.meta->>'wa_error', '')) AS code,
               left(COALESCE(NULLIF(m.meta->>'error', ''), d.meta->>'error'), 160) AS error,
               (d.delivered_at IS NOT NULL OR d.read_at IS NOT NULL OR m.meta ? 'delivered_at' OR m.meta ? 'read_at') AS delivered,
               (m.status = 'failed' OR COALESCE(d.meta->>'failed', '') = 'true') AS failed,
               left(COALESCE(NULLIF(m.meta->>'template', ''), d.kind, m.kind), 40) AS what
          FROM career_agent.career_channel_messages m
          LEFT JOIN career_agent.career_daily_sends d
            ON d.id = CASE WHEN jsonb_typeof(m.meta->'daily_send') = 'number' THEN (m.meta->>'daily_send')::bigint END
         WHERE m.direction = 'out' AND m.channel = 'whatsapp' AND m.user_id IS NOT NULL
           AND m.created_at > now() - make_interval(days => ${REACH_DAYS}::int)
           AND (m.meta ? 'daily_send' OR m.kind = 'template')
      )
      SELECT DISTINCT ON (user_id) user_id, ${ms("created_at")} AS at, failed, delivered, code, error, what,
             count(*) OVER (PARTITION BY user_id)::int AS tries,
             count(*) FILTER (WHERE failed) OVER (PARTITION BY user_id)::int AS failed_tries
        FROM m
       ORDER BY user_id, created_at DESC
       LIMIT 50000`)
    : [];

  const inbound = hasMessages
    ? await q(sql`
      SELECT DISTINCT ON (m.user_id) m.user_id, ${ms("m.created_at")} AS at, m.kind, left(m.body, 160) AS body
        FROM career_agent.career_channel_messages m
       WHERE m.direction = 'in' AND m.channel = 'whatsapp' AND m.user_id IS NOT NULL
       ORDER BY m.user_id, m.created_at DESC
       LIMIT 50000`)
    : [];

  const picks = have.has("career_today_picks")
    ? await q(sql`
      SELECT DISTINCT user_id FROM career_agent.career_today_picks
       WHERE local_day >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ${REACH_DAYS - 1}::int AND cardinality(job_ids) > 0
       LIMIT 100000`)
    : [];

  const onboarded = have.has("career_profiles")
    ? await q(sql`SELECT user_id FROM career_agent.career_profiles WHERE onboarded_at IS NOT NULL LIMIT 100000`)
    : [];

  // Meta's count (career-agent wa-limit.server.ts WA_DAILY_SQL): distinct students with a WhatsApp template that went
  // (not failed, not dry) and the phone step's codes. Every account, as Meta counts them.
  const otps = have.has("career_phone_otps")
    ? sql`UNION ALL SELECT user_id, created_at FROM career_agent.career_phone_otps WHERE created_at > now() - make_interval(days => ${TREND_DAYS + 1}::int)`
    : sql``;
  const started = await q(sql`
    WITH t AS (
      SELECT user_id, sent_at AS at FROM career_agent.career_daily_sends
       WHERE channel = 'whatsapp' AND meta->>'mode' = 'template' AND COALESCE(meta->>'dry', '') <> 'true'
         AND COALESCE(meta->>'failed', '') <> 'true' AND sent_at > now() - make_interval(days => ${TREND_DAYS + 1}::int)
      ${otps}
    )
    SELECT 'all' AS day, count(DISTINCT user_id)::int AS n FROM t WHERE at > now() - interval '24 hours'
    UNION ALL
    SELECT ${istDaySql("at")} AS day, count(DISTINCT user_id)::int AS n FROM t GROUP BY 1`);
  const refused = hasMessages
    ? await q(sql`
      SELECT ${istDaySql("created_at")} AS day, COALESCE(meta->>'error_code', '') AS code, left(COALESCE(meta->>'error', ''), 120) AS error, count(*)::int AS n
        FROM career_agent.career_channel_messages
       WHERE direction = 'out' AND status = 'failed' AND created_at > now() - make_interval(days => ${TREND_DAYS + 1}::int)
       GROUP BY 1, 2, 3`)
    : [];

  const days = new Map<string, MetaDayIn>();
  const dayOf = (k: string) => {
    let x = days.get(k);
    if (!x) days.set(k, (x = { day: k, students: 0, spam: 0, cap: 0 }));
    return x;
  };
  let students24h = 0;
  for (const r of started) {
    if (r.day === "all") students24h = Number(r.n) || 0;
    else dayOf(String(r.day)).students = Number(r.n) || 0;
  }
  for (const r of refused) {
    const c = metaCode(r.code, r.error);
    if (c === "131048") dayOf(String(r.day)).spam += Number(r.n) || 0;
    if (c === "131049") dayOf(String(r.day)).cap += Number(r.n) || 0;
  }

  const num = (v: unknown) => (v == null ? null : Number(v));
  const lastDelivered: Record<string, number> = {};
  for (const r of last) if (r.at != null) lastDelivered[String(r.user_id)] = Number(r.at);
  const seen = new Set<string>();
  const linkUsers: Rows["linkUsers"] = [];
  for (const r of links) {
    const id = String(r.user_id);
    if (seen.has(id)) continue;
    seen.add(id);
    linkUsers.push({ id, name: r.name ?? null, email: r.email ?? null, role: r.role ?? null });
  }

  return {
    env, missing: false, now,
    links: links.map((r) => ({
      user: String(r.user_id), created: Number(r.created), unlinked: num(r.unlinked), active: Boolean(r.active),
      digestOn: Boolean(r.digest_on), lastInbound: num(r.last_in),
    })),
    linkUsers,
    deliveries: deliveries.map((r) => ({ user: String(r.user_id), at: Number(r.at), lane: String(r.lane) as Lane })),
    lastDelivered,
    attempts: attempts.map((r) => ({
      user: String(r.user_id), at: Number(r.at), failed: Boolean(r.failed), delivered: Boolean(r.delivered),
      code: r.code ?? null, error: r.error ?? null, what: r.what ?? null, tries: Number(r.tries) || 0, failedTries: Number(r.failed_tries) || 0,
    })),
    inbound: inbound.map((r) => ({ user: String(r.user_id), at: Number(r.at), kind: String(r.kind ?? ""), body: r.body ?? null })),
    picks: picks.map((r) => String(r.user_id)),
    onboarded: onboarded.map((r) => String(r.user_id)),
    meta: { students24h, days: [...days.values()] },
  };
}
