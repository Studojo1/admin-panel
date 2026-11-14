// Server side of the Visitors section (model.ts has the rules and the words). Read only, short statement timeout,
// and every journey read is narrowed first: the range's rows by (step, at) through career_journey_events_step_idx,
// then the first touch and the account links of just those visitor ids through career_journey_events_visitor_idx.
// The Stu people (their steps, sign-up day, internal flag) come from the Stu dataset the other Stu pages share
// (data.server.ts stuData, stale-while-revalidate), so the exclusions and the step times match theirs. Crawler hits come
// from public.site_bot_hits, written by the site (Studojo1/frontend journey.server.ts countBotHit); a database
// without it shows them as not recorded. Nothing here names a person: the report holds counts only.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { swrCache } from "~/lib/swr-cache";
import { internalReason, stuData, testUsers } from "~/lib/stu/data.server";
import { stepAt } from "~/lib/stu/model";
import { type BotRow, type DeviceFilter, type Person, type SiteRow, type VisitorsEnvelope, PERSON_STEPS, SITE_STEPS, addDays, buildReport } from "./model";

const J = "career_agent.career_journey_events";
const ROW_CAP = 200_000;

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
/** Visitor ids are the site's stu_vid ([A-Za-z0-9_-], 8 to 64 characters), so a comma list is safe. */
const VID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * ADMIN-AUDIT-STU (14 Nov 2026): stale-while-revalidate per range, device and internal (app/lib/swr-cache.ts). A report
 * under a minute old is served as is; up to 5 minutes old it is served at once and rebuilt in the background.
 */
const reports = swrCache<VisitorsEnvelope>({
  freshMs: 60_000, maxStaleMs: 5 * 60_000, max: 60,
  onError: (k, err) => console.error("[visitors] background rebuild failed, serving the last copy", k, err),
});

export async function visitorsReport(start: string, end: string, device: DeviceFilter, internal: boolean, fresh: boolean): Promise<VisitorsEnvelope> {
  const t0 = Date.now();
  const out = await reports.get(`${start}|${end}|${device}|${internal ? 1 : 0}`, () => buildVisitorsReport(start, end, device, internal, fresh), fresh);
  return { ...out, ms: Date.now() - t0 };
}

async function buildVisitorsReport(start: string, end: string, device: DeviceFilter, internal: boolean, fresh: boolean): Promise<VisitorsEnvelope> {
  const t0 = Date.now();
  const from = `${start}T00:00:00+05:30`;
  const to = `${addDays(end, 1)}T00:00:00+05:30`;
  const [d, base] = await Promise.all([
    stuData(fresh),
    read(async (q) => {
      const reg = (await q(sql`
        SELECT to_regclass('career_agent.career_journey_events') IS NOT NULL AS j,
               to_regclass('public.site_bot_hits') IS NOT NULL AS b,
               EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'career_agent' AND table_name = 'career_user_source' AND column_name = 'visitor_id') AS sv,
               current_database() AS db`))[0] ?? {};
      const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : "production";
      if (!reg.j) return { env, journey: false, rows: [] as any[], touch: [] as any[], links: [] as any[], bots: reg.b ? [] : null, capped: false };
      const rows = await q(sql`
        SELECT visitor_id AS v, step, (extract(epoch from at) * 1000)::float8 AS at,
               to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               left(props->>'path', 200) AS path, left(props->>'device', 12) AS device, left(props->>'inapp', 12) AS inapp,
               CASE WHEN props->>'engaged_s' ~ '^[0-9]{1,6}$' THEN (props->>'engaged_s')::int END AS engaged,
               CASE WHEN props->>'scroll' ~ '^[0-9]{1,3}$' THEN (props->>'scroll')::int END AS scroll,
               coalesce(props->>'cta_seen', '') = 'true' AS cta,
               CASE WHEN jsonb_typeof(props->'sections') = 'array' THEN props->'sections' END AS sections
          FROM ${sql.raw(J)}
         WHERE step = ANY(${sql.raw(lit(SITE_STEPS))}) AND at >= ${from}::timestamptz AND at < ${to}::timestamptz AND visitor_id IS NOT NULL
         ORDER BY at
         LIMIT ${ROW_CAP + 1}`);
      const ids = [...new Set(rows.map((r) => String(r.v)))].filter((v) => VID_RE.test(v));
      if (!ids.length) return { env, journey: true, rows, touch: [], links: [], bots: reg.b ? await bots(q, start, end) : null, capped: false };
      const list = ids.join(",");
      // First touch: the earliest row of each visitor that carries a source (visited_home, clicked_join, sign-up rows).
      const touch = await q(sql`
        SELECT DISTINCT ON (visitor_id) visitor_id AS v,
               jsonb_build_object(
                 'utm_source', source->>'utm_source', 'utm_medium', source->>'utm_medium', 'utm_campaign', source->>'utm_campaign',
                 'utm_content', source->>'utm_content', 'referrer', left(source->>'referrer', 200), 'landing_path', left(source->>'landing_path', 200),
                 'gclid', CASE WHEN source ? 'gclid' OR source ? 'gbraid' OR source ? 'wbraid' THEN 'y' END,
                 'fbclid', CASE WHEN source ? 'fbclid' THEN 'y' END) AS source
          FROM ${sql.raw(J)}
         WHERE visitor_id = ANY(string_to_array(${list}, ',')) AND source IS NOT NULL AND source <> '{}'::jsonb
         ORDER BY visitor_id, at`);
      const fromSource = reg.sv
        ? sql` UNION SELECT visitor_id, user_id FROM career_agent.career_user_source WHERE visitor_id = ANY(string_to_array(${list}, ',')) AND user_id IS NOT NULL`
        : sql``;
      const links = await q(sql`
        SELECT DISTINCT visitor_id AS v, user_id AS u FROM ${sql.raw(J)}
         WHERE visitor_id = ANY(string_to_array(${list}, ',')) AND user_id IS NOT NULL${fromSource}
         LIMIT 100000`);
      return { env, journey: true, rows, touch, links, bots: reg.b ? await bots(q, start, end) : null, capped: rows.length > ROW_CAP };
    }),
  ]);

  // The people the visitor ids became: from the Stu dataset; an account with no Stu activity is read for its internal flag only.
  const idx = new Map(d.users.map((u, i) => [u.id, i]));
  const people: Record<string, Person> = {};
  const unknown = new Set<string>();
  for (const l of base.links) {
    const i = idx.get(String(l.u));
    if (i == null) {
      unknown.add(String(l.u));
      continue;
    }
    const u = d.users[i];
    const steps: Person["steps"] = {};
    for (const k of PERSON_STEPS) {
      const t = stepAt(d, u, k);
      if (t != null) steps[k] = t;
    }
    const prev = people[String(l.v)];
    // A visitor id linked to two accounts: internal wins, then the earlier one.
    if (!prev || (!prev.internal && u.internal) || (prev.joined != null && u.joined < prev.joined && !prev.internal)) {
      people[String(l.v)] = { id: u.id, internal: Boolean(u.internal), joined: u.joined, steps };
    }
  }
  if (unknown.size) {
    const tests = testUsers();
    const ids = [...unknown].filter((x) => /^[A-Za-z0-9_-]{1,80}$/.test(x));
    const rows = ids.length
      ? await read((q) => q(sql`SELECT id, email, role FROM public."user" WHERE id = ANY(string_to_array(${ids.join(",")}, ','))`))
      : [];
    const internalIds = new Set(rows.filter((r) => internalReason({ id: r.id, email: r.email, role: r.role }, tests)).map((r) => String(r.id)));
    for (const l of base.links) {
      const u = String(l.u);
      if (!unknown.has(u) || people[String(l.v)]) continue;
      people[String(l.v)] = { id: u, internal: internalIds.has(u), joined: null, steps: {} };
    }
  }

  const rows: SiteRow[] = base.rows.slice(0, ROW_CAP).map((r) => ({
    v: String(r.v), step: String(r.step), at: Number(r.at), day: String(r.day),
    path: r.path ?? null, device: r.device ?? null, inapp: r.inapp ?? null,
    engaged: r.engaged == null ? null : Number(r.engaged), scroll: r.scroll == null ? null : Number(r.scroll), cta: Boolean(r.cta),
    sections: Array.isArray(r.sections) ? r.sections.filter((s: unknown): s is string => typeof s === "string").slice(0, 16) : null,
  }));
  const touch: Record<string, unknown> = {};
  for (const t of base.touch) touch[String(t.v)] = t.source;

  const report = buildReport({ start, end, device, internal, rows, touch, people, bots: base.bots, pageViewStart: d.pageViewStart ?? null });
  return { ...report, generatedAt: new Date().toISOString(), env: base.env, ms: Date.now() - t0, journeyLive: base.journey, capped: base.capped };
}

async function bots(q: (s: SQL) => Promise<any[]>, start: string, end: string): Promise<BotRow[]> {
  const rows = await q(sql`
    SELECT day::text AS day, bot, path_group, hits FROM public.site_bot_hits
     WHERE day >= ${start}::date AND day <= ${end}::date
     ORDER BY day LIMIT 20000`);
  return rows.map((r) => ({ day: String(r.day), bot: String(r.bot), path_group: String(r.path_group), hits: Number(r.hits) || 0 }));
}
