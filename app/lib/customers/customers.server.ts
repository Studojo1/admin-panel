// Server side of /customers (model.ts has the rules). Reads Stu's tables (career_agent) in a read-only transaction with a
// short statement timeout, like the other Stu pages; the list is kept 3 minutes (the production database is IOPS-bound).
// The team's own notes live in two tables of this database, made here on first use:
//   stu_customer_desk  one row per customer: starred, and a free note
//   stu_customer_picks companies or jobs the team found for a customer, and where each stands
// Both cascade when the customer's account is deleted. Nothing here writes to career_agent: Stu's matcher drops any
// match it did not make at its next recompute (match.server.ts, the DELETE of state 'new'), so a pick stays the team's
// until the customer is told.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { internalReason, testUsers } from "~/lib/stu/data.server";
import {
  type CustomersEnvelope, type PickStatus, type Signals, type WireCustomer, type WireDetail, type WirePick,
  OPEN_PICK, cleanLink, isPickStatus, scoreOf, toneCounts, toneOf,
} from "./model";

const TTL_MS = 3 * 60_000;
/** Not customers on any page, on top of the Stu pages' internal rules: the owner's own accounts and a coupon test account. */
const NOT_CUSTOMERS = ["benjenstark.578239@gmail.com", "businessconnect.pranav@gmail.com", "pranav.hegde126@gmail.com"];

type Q = (s: SQL) => Promise<any[]>;

async function read<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

let tablesReady: Promise<void> | null = null;
export function ensureTables(): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stu_customer_desk (
        user_id    TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
        star       BOOLEAN NOT NULL DEFAULT FALSE,
        note       TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stu_customer_picks (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        company    TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT '',
        link       TEXT NOT NULL DEFAULT '',
        contact    TEXT NOT NULL DEFAULT '',
        note       TEXT NOT NULL DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'idea',  -- idea | told | applied | interview | offer | hired | dropped
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by TEXT,
        updated_by TEXT
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS stu_customer_picks_user ON stu_customer_picks (user_id, created_at DESC)`);
  })().catch((e) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

const num = (v: unknown): number => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown, max = 400): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strs = (v: unknown, max = 30): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 120)))].slice(0, max) : [];

// The WhatsApp verification message ("LINK K7M2PQ") is not a message to Stu (as on the Stu pages, ADMIN-FIX 5 Nov 2026).
const NOT_LINK_CODE = sql.raw(`NOT (coalesce(body, '') ~* '^\\s*link\\s+[a-z0-9]{4,12}\\s*$')`);

/** A customer's own messages to Stu (WhatsApp in, and chat), newest first. */
const SAID = (where: SQL, limit: number) => sql`
  SELECT * FROM (
    SELECT user_id, (extract(epoch FROM created_at) * 1000)::float8 AS at, left(body, 600) AS text, 'whatsapp' AS via
      FROM career_agent.career_channel_messages
     WHERE direction = 'in' AND user_id IS NOT NULL AND ${NOT_LINK_CODE} AND ${where}
    UNION ALL
    SELECT th.user_id, (extract(epoch FROM m.created_at) * 1000)::float8, left(m.content, 600), 'chat'
      FROM career_agent.career_messages m JOIN career_agent.career_threads th ON th.id = m.thread_id
     WHERE m.role = 'user' AND ${where}
  ) s ORDER BY at DESC LIMIT ${limit}`;

const LIST = sql`
  WITH q AS (
    SELECT user_id,
           count(*) FILTER (WHERE replied_at IS NOT NULL) AS replies,
           count(*) FILTER (WHERE reply_tag = 'positive') AS pos,
           count(DISTINCT lower(split_part(to_email, '@', 2))) FILTER (WHERE status <> 'draft') AS companies
      FROM career_agent.career_sequences
     WHERE NOT coalesce(is_test, false) AND NOT coalesce(dry_run, false)
     GROUP BY 1),
  st AS (
    SELECT s.user_id, count(*) AS sent
      FROM career_agent.career_sequence_steps x JOIN career_agent.career_sequences s ON s.id = x.sequence_id
     WHERE x.status = 'sent' AND NOT coalesce(s.is_test, false) AND NOT coalesce(s.dry_run, false)
     GROUP BY 1),
  c AS (
    SELECT user_id, count(*) FILTER (WHERE mode = 'desk') AS desk, count(*) FILTER (WHERE mode = 'build') AS build,
           coalesce(sum(duration_s), 0) AS secs, max(coalesce(started_at, created_at)) AS last_call
      FROM career_agent.career_voice_calls GROUP BY 1),
  m AS (
    SELECT user_id, count(*) AS n, count(*) FILTER (WHERE state = 'saved') AS saved, count(*) FILTER (WHERE state = 'applied') AS applied
      FROM career_agent.career_matches GROUP BY 1),
  g AS (SELECT user_id, string_agg(DISTINCT source, '+') AS src FROM career_agent.career_plan_grants WHERE revoked_at IS NULL GROUP BY 1),
  o AS (SELECT user_id, count(*) AS n FROM career_agent.career_credit_orders WHERE status = 'paid' AND NOT coalesce(test, false) GROUP BY 1),
  j AS (
    SELECT user_id, max(at) AS last_at,
           count(DISTINCT (at AT TIME ZONE 'Asia/Kolkata')::date) FILTER (WHERE at > now() - interval '21 days') AS days21
      FROM career_agent.career_journey_events WHERE user_id IS NOT NULL GROUP BY 1)
  SELECT p.user_id AS id, u.name, u.email, u.role, coalesce(ph.phone, u.phone_number) AS phone, coalesce(ph.whatsapp_ok, false) AS wa,
         (extract(epoch FROM u.created_at AT TIME ZONE 'UTC') * 1000)::float8 AS signed,
         left(p.profile->>'headline', 160) AS headline,
         CASE WHEN jsonb_typeof(p.preferences->'roles') = 'array' THEN p.preferences->'roles' ELSE '[]'::jsonb END AS roles,
         CASE WHEN jsonb_typeof(p.preferences->'cities') = 'array' THEN p.preferences->'cities' ELSE '[]'::jsonb END AS cities,
         coalesce(p.preferences->>'remote_ok', '') = 'true' AS remote,
         coalesce(q.pos, 0) AS pos, coalesce(q.replies, 0) AS replies, coalesce(q.companies, 0) AS companies, coalesce(st.sent, 0) AS sent,
         coalesce(c.desk, 0) AS desk, coalesce(c.build, 0) AS build, coalesce(c.secs, 0) AS secs,
         coalesce(m.n, 0) AS matches, coalesce(m.saved, 0) AS saved, coalesce(m.applied, 0) AS applied,
         CASE WHEN g.src IS NOT NULL THEN g.src WHEN o.n > 0 THEN 'order' END AS paid,
         coalesce(j.days21, 0) AS days21,
         (extract(epoch FROM greatest(j.last_at, c.last_call, p.updated_at)) * 1000)::float8 AS last_seen
    FROM career_agent.career_profiles p
    JOIN public."user" u ON u.id = p.user_id
    LEFT JOIN career_agent.career_phones ph ON ph.user_id = p.user_id
    LEFT JOIN q ON q.user_id = p.user_id LEFT JOIN st ON st.user_id = p.user_id LEFT JOIN c ON c.user_id = p.user_id
    LEFT JOIN m ON m.user_id = p.user_id LEFT JOIN g ON g.user_id = p.user_id LEFT JOIN o ON o.user_id = p.user_id
    LEFT JOIN j ON j.user_id = p.user_id`;

interface Pool {
  env: string;
  at: number;
  ms: number;
  all: WireCustomer[];
}
let cache: Pool | null = null;

async function loadPool(fresh: boolean): Promise<Pool> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache;
  const t0 = Date.now();
  await ensureTables();
  const pool = await read(async (q): Promise<Pool> => {
    const reg = (await q(sql`
      SELECT to_regclass('career_agent.career_profiles') IS NOT NULL AS ok,
             to_regclass('career_agent.career_journey_events') IS NOT NULL AS j,
             current_database() AS db`))[0] ?? {};
    const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : "production";
    if (!reg.ok || !reg.j) return { env, at: Date.now(), ms: 0, all: [] };
    const rows = await q(LIST);
    const said = await q(SAID(sql`true`, 20000));
    const byUser = new Map<string, { text: string | null; at: number }[]>();
    for (const m of said) {
      const list = byUser.get(m.user_id) ?? [];
      list.push({ text: m.text, at: num(m.at) });
      byUser.set(m.user_id, list);
    }
    const desk = new Map<string, { star: boolean; note: string }>();
    for (const d of await q(sql`SELECT user_id, star, note FROM public.stu_customer_desk`)) desk.set(d.user_id, { star: !!d.star, note: d.note ?? "" });
    const picks = new Map<string, { n: number; open: number; hired: boolean }>();
    for (const p of await q(sql`SELECT user_id, status, count(*) AS n FROM public.stu_customer_picks GROUP BY 1, 2`)) {
      const cur = picks.get(p.user_id) ?? { n: 0, open: 0, hired: false };
      cur.n += num(p.n);
      if (OPEN_PICK.has(p.status as PickStatus)) cur.open += num(p.n);
      if (p.status === "hired") cur.hired = true;
      picks.set(p.user_id, cur);
    }
    const tests = testUsers();
    const all: WireCustomer[] = rows.map((r) => {
      const tone = toneCounts(byUser.get(r.id) ?? []);
      const lastMsg = (byUser.get(r.id) ?? [])[0]?.at ?? null;
      const lastSeen = Math.max(numOrNull(r.last_seen) ?? 0, lastMsg ?? 0) || null;
      const s: Signals = {
        posReplies: num(r.pos), replies: num(r.replies), sent: num(r.sent), companies: num(r.companies), paid: r.paid ?? null,
        praise: tone.praise, gripes: tone.gripes, refund: tone.refund, desk: num(r.desk), build: num(r.build),
        callMin: Math.round(num(r.secs) / 60), days21: num(r.days21), lastSeen,
        matches: num(r.matches), saved: num(r.saved), applied: num(r.applied),
      };
      const email = (r.email ?? "").toLowerCase();
      const d = desk.get(r.id);
      const pk = picks.get(r.id);
      return {
        id: r.id, name: r.name ?? "", email: r.email ?? "", phone: r.phone ?? null, whatsapp: !!r.wa, signedUp: num(r.signed),
        internal: internalReason({ id: r.id, email: r.email, role: r.role }, tests) ?? (NOT_CUSTOMERS.includes(email) ? "test account" : null),
        headline: r.headline ?? null, roles: strs(r.roles, 8), cities: strs(r.cities, 8), remote: !!r.remote,
        s, score: scoreOf(s), star: d?.star ?? false, note: d?.note ?? "", picks: pk?.n ?? 0, picksOpen: pk?.open ?? 0, hired: pk?.hired ?? false,
      };
    });
    return { env, at: Date.now(), ms: 0, all };
  });
  pool.ms = Date.now() - t0;
  cache = pool;
  return pool;
}

export async function customersList(internal: boolean, fresh: boolean): Promise<CustomersEnvelope> {
  const pool = await loadPool(fresh);
  return { env: pool.env, at: pool.at, ms: pool.ms, customers: internal ? pool.all : pool.all.filter((c) => !c.internal) };
}

const when = (start: unknown, end: unknown): string => [str(start, 20), str(end, 20)].filter(Boolean).join(" to ");

const pickOf = (r: any): WirePick => ({
  id: num(r.id), company: r.company ?? "", role: r.role ?? "", link: r.link ?? "", contact: r.contact ?? "", note: r.note ?? "",
  status: isPickStatus(r.status) ? r.status : "idea", createdAt: num(r.created), updatedAt: num(r.updated), by: r.updated_by ?? r.created_by ?? null,
});

async function picksOf(id: string): Promise<WirePick[]> {
  await ensureTables();
  const rows = (await db.execute(sql`
    SELECT id, company, role, link, contact, note, status, created_by, updated_by,
           (extract(epoch FROM created_at) * 1000)::float8 AS created, (extract(epoch FROM updated_at) * 1000)::float8 AS updated
      FROM public.stu_customer_picks WHERE user_id = ${id} ORDER BY created_at DESC LIMIT 200`)).rows as any[];
  return rows.map(pickOf);
}

export async function customerDetail(id: string): Promise<WireDetail | null> {
  let pool = await loadPool(false);
  let c = pool.all.find((x) => x.id === id);
  if (!c) {
    pool = await loadPool(true);
    c = pool.all.find((x) => x.id === id);
  }
  if (!c) return null;
  const detail = await read(async (q) => {
    const hasCand = !!(await q(sql`SELECT to_regclass('career_agent.career_cand_profile') IS NOT NULL AS ok`))[0]?.ok;
    const p = (await q(sql`
      SELECT p.preferences, p.profile, p.resume_file, left(p.resume_text, 30000) AS resume_text
        FROM career_agent.career_profiles p WHERE p.user_id = ${id}`))[0] ?? {};
    const cand = hasCand ? (await q(sql`SELECT * FROM career_agent.career_cand_profile WHERE user_id = ${id}`))[0] ?? null : null;
    const calls = await q(sql`
      SELECT mode, (extract(epoch FROM coalesce(started_at, created_at)) * 1000)::float8 AS at, coalesce(duration_s, 0) AS secs,
             CASE WHEN jsonb_typeof(analysis->'summary') = 'string' THEN left(analysis->>'summary', 2000) END AS summary
        FROM career_agent.career_voice_calls WHERE user_id = ${id} ORDER BY coalesce(started_at, created_at) DESC LIMIT 30`);
    const plan = (await q(sql`SELECT plan FROM career_agent.career_plans WHERE user_id = ${id}`))[0]?.plan ?? null;
    const grants = await q(sql`
      SELECT source, (extract(epoch FROM ends_at) * 1000)::float8 AS ends FROM career_agent.career_plan_grants
       WHERE user_id = ${id} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 10`);
    const orders = await q(sql`
      SELECT coalesce(item, '') AS item, coalesce(amount_paise, 0) AS paise, (extract(epoch FROM coalesce(paid_at, created_at)) * 1000)::float8 AS at
        FROM career_agent.career_credit_orders WHERE user_id = ${id} AND status = 'paid' AND NOT coalesce(test, false) ORDER BY created_at DESC LIMIT 10`);
    const counts = await q(sql`SELECT state, count(*) AS n FROM career_agent.career_matches WHERE user_id = ${id} GROUP BY 1`);
    const top = await q(sql`
      SELECT j.title, j.company, coalesce(j.location, '') AS location, j.apply_url, m.score, m.state,
             (extract(epoch FROM m.created_at) * 1000)::float8 AS at
        FROM career_agent.career_matches m JOIN career_agent.career_jobs j ON j.id = m.job_id
       WHERE m.user_id = ${id}
       ORDER BY CASE m.state WHEN 'applied' THEN 0 WHEN 'saved' THEN 1 WHEN 'new' THEN 2 ELSE 3 END, m.score DESC
       LIMIT 30`);
    const outreach = await q(sql`
      SELECT coalesce(j.company, '') AS company, coalesce(j.title, '') AS title,
             trim(coalesce(s.to_name, '') || ' <' || coalesce(s.to_email, '') || '>') AS to_whom, s.status,
             (extract(epoch FROM s.started_at) * 1000)::float8 AS started, (extract(epoch FROM s.replied_at) * 1000)::float8 AS replied,
             s.reply_tag, left(s.reply_text, 800) AS reply,
             (SELECT count(*) FROM career_agent.career_sequence_steps x WHERE x.sequence_id = s.id AND x.status = 'sent') AS sent
        FROM career_agent.career_sequences s
        LEFT JOIN career_agent.career_outreach o ON o.id = s.outreach_id
        LEFT JOIN career_agent.career_jobs j ON j.id = o.job_id
       WHERE s.user_id = ${id} AND NOT coalesce(s.is_test, false) AND NOT coalesce(s.dry_run, false)
       ORDER BY coalesce(s.replied_at, s.started_at, s.created_at) DESC LIMIT 80`);
    const said = await q(SAID(sql`user_id = ${id}`, 120));
    return { p, cand, calls, plan, grants, orders, counts, top, outreach, said };
  });

  const pref = detail.p.preferences ?? {};
  const prof = detail.p.profile ?? {};
  const cand = detail.cand ?? {};
  const pick = <T>(a: T | null | undefined, b: T | null | undefined): T | null => (a != null && !(Array.isArray(a) && !a.length) && a !== "" ? a : b ?? null);
  const onboarding = detail.calls.find((x: any) => x.mode === "onboarding" && x.summary);
  const seen = new Set<string>();
  const said: WireDetail["said"] = [];
  for (const m of detail.said) {
    const key = `${Math.floor(num(m.at) / 600_000)}|${(m.text ?? "").trim().toLowerCase()}`;
    if (seen.has(key) || !(m.text ?? "").trim()) continue;
    seen.add(key);
    said.push({ at: num(m.at), via: m.via === "chat" ? "chat" : "whatsapp", text: String(m.text).slice(0, 600), tone: toneOf(m.text) });
    if (said.length >= 50) break;
  }
  const counts: Record<string, number> = {};
  for (const r of detail.counts) counts[r.state] = num(r.n);

  return {
    c,
    wants: {
      roles: strs(pick(cand.roles_wanted, pref.roles)),
      adjacent: strs(cand.roles_adjacent),
      refused: strs(pick(cand.roles_refused, pref.roles_refused)),
      cities: strs(pick(cand.cities, pref.cities)),
      relocate: str(pick(cand.relocate, pref.relocate), 80),
      modes: strs(pick(cand.work_modes, pref.work_modes)),
      types: strs(pick(cand.job_types, pref.job_types)),
      payYear: numOrNull(pick(cand.expected_fixed_min, pref.pay_min_year)),
      stipendMonth: numOrNull(pick(cand.expected_stipend_min, pref.stipend_min_month)),
      payNow: str(cand.current_pay_text, 120),
      notice: str(cand.notice_text, 120),
      from: str(pick(cand.available_from, pref.start), 80),
      intent: str(pick(cand.intent, pref.intent), 80),
      whyNow: str(pick(cand.why_now, pref.why_now), 600),
      stages: strs(pick(cand.company_stages, pref.company_stages)),
      sectors: strs(pick(cand.sectors, pref.sectors)),
      sectorsRefused: strs(pick(cand.sectors_refused, pref.sectors_avoid)),
      values: strs(pick(cand.work_values, pref.work_values)),
      avoid: strs(pref.avoid_companies),
    },
    profile: {
      summary: str(pick(cand.summary, prof.summary), 1500),
      title: str(cand.current_title, 160),
      org: str(cand.current_org_name, 160),
      expMonths: numOrNull(cand.total_exp_months),
      degree: str(cand.highest_degree, 160),
      grad: numOrNull(pick(cand.grad_year, prof.graduation_year)),
      skills: strs(prof.skills, 40),
      links: strs(pick(cand.links, prof.links), 10).filter((l) => !!cleanLink(l)),
      experience: (Array.isArray(prof.experience) ? prof.experience : []).slice(0, 12).map((e: any) => ({
        title: str(e?.title, 160) ?? "", company: str(e?.company, 160) ?? "", when: when(e?.start, e?.end),
      })),
      education: (Array.isArray(prof.education) ? prof.education : []).slice(0, 6).map((e: any) => ({
        school: str(e?.school, 160) ?? "", degree: [str(e?.degree, 120), str(e?.field, 120)].filter(Boolean).join(", "), when: when(e?.start, e?.end),
      })),
      projects: (Array.isArray(prof.projects) ? prof.projects : []).slice(0, 10).map((e: any) => ({
        name: str(e?.name, 160) ?? "", tech: Array.isArray(e?.tech) ? strs(e.tech, 12).join(", ") : str(e?.tech, 200) ?? "",
      })),
    },
    resume: { file: str(detail.p.resume_file, 200), text: typeof detail.p.resume_text === "string" ? detail.p.resume_text : null },
    call: onboarding ? { at: num(onboarding.at), minutes: Math.round(num(onboarding.secs) / 60), summary: onboarding.summary } : null,
    calls: detail.calls.map((x: any) => ({ mode: x.mode ?? "", at: num(x.at), minutes: Math.round(num(x.secs) / 60) })),
    plan: {
      plan: str(detail.plan, 40),
      grants: detail.grants.map((g: any) => ({ source: g.source ?? "", ends: numOrNull(g.ends) })),
      orders: detail.orders.map((o: any) => ({ item: o.item, rupees: Math.round(num(o.paise) / 100), at: num(o.at) })),
    },
    matches: {
      counts,
      top: detail.top.map((m: any) => ({
        title: m.title ?? "", company: m.company ?? "", where: m.location ?? "", link: cleanLink(m.apply_url), score: num(m.score), state: m.state ?? "", at: num(m.at),
      })),
    },
    outreach: detail.outreach.map((o: any) => ({
      company: o.company, title: o.title, to: o.to_whom ?? "", status: o.status ?? "", started: numOrNull(o.started), replied: numOrNull(o.replied),
      tag: o.reply_tag ?? null, reply: o.reply ?? null, sent: num(o.sent),
    })),
    said,
    picks: await picksOf(id),
  };
}

// ------------------------------------------------------------------ the team's notes and picks (writes)

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Keep the cached list in step with a write, so the list shows it without a full reload. */
async function refreshDesk(id: string): Promise<void> {
  if (!cache) return;
  const c = cache.all.find((x) => x.id === id);
  if (!c) return;
  const d = (await db.execute(sql`SELECT star, note FROM public.stu_customer_desk WHERE user_id = ${id}`)).rows[0] as any;
  const rows = (await db.execute(sql`SELECT status, count(*) AS n FROM public.stu_customer_picks WHERE user_id = ${id} GROUP BY 1`)).rows as any[];
  c.star = !!d?.star;
  c.note = d?.note ?? "";
  c.picks = rows.reduce((a, r) => a + num(r.n), 0);
  c.picksOpen = rows.filter((r) => OPEN_PICK.has(r.status)).reduce((a, r) => a + num(r.n), 0);
  c.hired = rows.some((r) => r.status === "hired");
}

export type DeskOp =
  | { op: "star"; id: string; star: boolean }
  | { op: "note"; id: string; note: string }
  | { op: "pick"; id: string; company: string; role?: string; link?: string; contact?: string; note?: string; status?: string }
  | { op: "pick-update"; id: string; pickId: number; company?: string; role?: string; link?: string; contact?: string; note?: string; status?: string }
  | { op: "pick-delete"; id: string; pickId: number };

export class BadRequest extends Error {}

/** One change to the team's notes for a customer. Returns the customer's star, note and picks after it. */
export async function deskWrite(body: DeskOp, by: string): Promise<{ star: boolean; note: string; picks: WirePick[] }> {
  await ensureTables();
  const id = text(body?.id, 80);
  if (!id) throw new BadRequest("Missing customer");
  const exists = (await db.execute(sql`SELECT 1 FROM career_agent.career_profiles WHERE user_id = ${id}`)).rows.length > 0;
  if (!exists) throw new BadRequest("No such customer");
  switch (body.op) {
    case "star":
      await db.execute(sql`
        INSERT INTO public.stu_customer_desk (user_id, star, updated_by) VALUES (${id}, ${!!body.star}, ${by})
        ON CONFLICT (user_id) DO UPDATE SET star = EXCLUDED.star, updated_at = now(), updated_by = EXCLUDED.updated_by`);
      break;
    case "note":
      await db.execute(sql`
        INSERT INTO public.stu_customer_desk (user_id, note, updated_by) VALUES (${id}, ${text(body.note, 4000)}, ${by})
        ON CONFLICT (user_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by`);
      break;
    case "pick": {
      const company = text(body.company, 160);
      if (!company) throw new BadRequest("Add the company");
      const status = isPickStatus(body.status) ? body.status : "idea";
      await db.execute(sql`
        INSERT INTO public.stu_customer_picks (user_id, company, role, link, contact, note, status, created_by, updated_by)
        VALUES (${id}, ${company}, ${text(body.role, 160)}, ${cleanLink(body.link)}, ${text(body.contact, 300)}, ${text(body.note, 2000)}, ${status}, ${by}, ${by})`);
      break;
    }
    case "pick-update": {
      const pickId = Number(body.pickId);
      if (!Number.isInteger(pickId)) throw new BadRequest("Missing pick");
      const cur = (await db.execute(sql`SELECT * FROM public.stu_customer_picks WHERE id = ${pickId} AND user_id = ${id}`)).rows[0] as any;
      if (!cur) throw new BadRequest("No such pick");
      const company = body.company === undefined ? cur.company : text(body.company, 160);
      if (!company) throw new BadRequest("Add the company");
      await db.execute(sql`
        UPDATE public.stu_customer_picks SET
          company = ${company},
          role = ${body.role === undefined ? cur.role : text(body.role, 160)},
          link = ${body.link === undefined ? cur.link : cleanLink(body.link)},
          contact = ${body.contact === undefined ? cur.contact : text(body.contact, 300)},
          note = ${body.note === undefined ? cur.note : text(body.note, 2000)},
          status = ${isPickStatus(body.status) ? body.status : cur.status},
          updated_at = now(), updated_by = ${by}
        WHERE id = ${pickId} AND user_id = ${id}`);
      break;
    }
    case "pick-delete": {
      const pickId = Number(body.pickId);
      if (!Number.isInteger(pickId)) throw new BadRequest("Missing pick");
      await db.execute(sql`DELETE FROM public.stu_customer_picks WHERE id = ${pickId} AND user_id = ${id}`);
      break;
    }
    default:
      throw new BadRequest("Unknown change");
  }
  await refreshDesk(id);
  const d = (await db.execute(sql`SELECT star, note FROM public.stu_customer_desk WHERE user_id = ${id}`)).rows[0] as any;
  return { star: !!d?.star, note: d?.note ?? "", picks: await picksOf(id) };
}
