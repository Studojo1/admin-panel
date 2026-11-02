// Server side of the Stu Overview: one section per request. Sections built from
// the Stu dataset share its one-minute cache (stuData), so nine parallel calls
// read the database once. The live feed and the zero-today check read the
// journey log directly: newest rows by primary key, and two IST days through
// the (step, at) index. Read only, LIMITed, short statement timeout.
import { sql } from "drizzle-orm";
import db from "~/lib/db.server";
import { stuData, touchOf } from "./data.server";
import { type Filters, type StuData, EXTRA_EVENTS, STEPS, addDays, todayIst } from "./model";
import {
  type Alert, type FeedRow, type OvEnvelope, type OvSection, Refs, alertsFromData, calls, engagement, insights, journeyLabel, kpis,
  maskEmail, overviewDropoffs, overviewFunnel, overviewSources, power, trends, usage,
} from "./overview";
import { CHANNELS } from "~/lib/utm-dictionary";

const channelName = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? k;

async function readOnly<T>(fn: (q: (s: ReturnType<typeof sql>) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

let envName: Promise<string> | null = null;
/** staging or production, from the database this server reads */
function env(): Promise<string> {
  envName ??= readOnly(async (q) => {
    const r = await q(sql`SELECT current_database() AS db`);
    return /staging/i.test(String(r[0]?.db ?? "")) ? "staging" : "production";
  }).catch(() => {
    envName = null;
    return "unknown";
  });
  return envName;
}

const hasJourney = (d: StuData) => d.journeyLive;
const lit = (xs: readonly string[]) => `ARRAY[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[]`;

async function feed(d: StuData, f: Filters, refs: Refs): Promise<FeedRow[]> {
  if (!hasJourney(d)) return [];
  const rows = await readOnly((q) =>
    q(sql`SELECT id::text AS id, (extract(epoch from at) * 1000)::float8 AS at, step, user_id, visitor_id, source
            FROM career_agent.career_journey_events
           ORDER BY id DESC LIMIT 400`),
  );
  const idx = new Map(d.users.map((u, i) => [u.id, i]));
  const vlink = new Map(d.visitors.filter((v) => v.u >= 0).map((v) => [v.id, v.u]));
  const out: FeedRow[] = [];
  for (const r of rows) {
    let u = r.user_id ? idx.get(r.user_id) ?? -1 : -1;
    if (u < 0 && r.visitor_id) u = vlink.get(r.visitor_id) ?? -1;
    const person = u >= 0 ? d.users[u] : null;
    if (person?.internal && !f.internal) continue;
    const t = touchOf(r.source);
    const { label, phase } = journeyLabel(String(r.step));
    if (person) refs.cell({ v: 1, users: [u] });
    out.push({
      id: String(r.id), at: Number(r.at), step: String(r.step), label, phase, u,
      who: person ? maskEmail(person.email) || person.id.slice(0, 10) : r.visitor_id ? `visitor ${String(r.visitor_id).slice(0, 8)}` : "unknown",
      source: t?.source ? [t.source, t.medium].filter(Boolean).join(" / ") + (t.campaign ? ` (${t.campaign})` : "") : person ? `channel: ${person.ch}` : "",
    });
    if (out.length >= 20) break;
  }
  return out;
}

/** Steps with events yesterday (IST) and none today, people in scope only. */
async function zeroToday(d: StuData, f: Filters): Promise<Alert | null> {
  if (!hasJourney(d)) return null;
  const today = todayIst();
  const yesterday = addDays(today, -1);
  const names = [...new Set([...STEPS.flatMap((s) => s.journey), ...EXTRA_EVENTS.call_failed, ...d.journeySteps.map((s) => s.step)])];
  const from = `${yesterday}T00:00:00+05:30`;
  const mid = `${today}T00:00:00+05:30`;
  const to = `${addDays(today, 1)}T00:00:00+05:30`;
  const rows = await readOnly((q) =>
    q(sql`SELECT step, (at >= ${mid}::timestamptz) AS today, user_id, visitor_id, count(*)::int AS n
            FROM career_agent.career_journey_events
           WHERE step = ANY(${sql.raw(lit(names))}) AND at >= ${from}::timestamptz AND at < ${to}::timestamptz
           GROUP BY 1, 2, 3, 4 LIMIT 100000`),
  );
  const idx = new Map(d.users.map((u, i) => [u.id, i]));
  const vlink = new Map(d.visitors.filter((v) => v.u >= 0).map((v) => [v.id, v.u]));
  const counts = new Map<string, { today: number; yesterday: number }>();
  for (const r of rows) {
    let u = r.user_id ? idx.get(r.user_id) ?? -1 : -1;
    if (u < 0 && r.visitor_id) u = vlink.get(r.visitor_id) ?? -1;
    if (u >= 0 && d.users[u].internal && !f.internal) continue;
    const { label } = journeyLabel(String(r.step));
    const c = counts.get(label) ?? { today: 0, yesterday: 0 };
    if (r.today) c.today += Number(r.n);
    else c.yesterday += Number(r.n);
    counts.set(label, c);
  }
  const quiet = [...counts.entries()].filter(([, c]) => c.yesterday > 0 && c.today === 0).sort((a, b) => b[1].yesterday - a[1].yesterday);
  if (!quiet.length) return null;
  return {
    key: "zero_today",
    level: "warning",
    text: `No events yet today for ${quiet.length} step${quiet.length === 1 ? "" : "s"} that had them yesterday: ${quiet.slice(0, 5).map(([l, c]) => `${l} (${c.yesterday})`).join(", ")}${quiet.length > 5 ? `, and ${quiet.length - 5} more` : ""}`,
    href: "/self-check",
  };
}

export async function overviewSection(section: OvSection, f: Filters, fresh: boolean): Promise<OvEnvelope<unknown>> {
  const t0 = Date.now();
  const [d, e] = await Promise.all([stuData(fresh), env()]);
  const refs = new Refs(d);
  let body: unknown;
  switch (section) {
    case "insights": body = insights(d, f, refs, channelName); break;
    case "usage": body = usage(d, f, refs); break;
    case "power": body = power(d, f, refs); break;
    case "kpis": body = kpis(d, f, refs); break;
    case "funnel": body = overviewFunnel(d, f, refs); break;
    case "trends": body = trends(d, f, refs); break;
    case "sources": body = overviewSources(d, f, refs); break;
    case "calls": body = calls(d, f, refs); break;
    case "dropoffs": body = overviewDropoffs(d, f, refs); break;
    case "engagement": body = engagement(d, f, refs); break;
    case "feed": body = await feed(d, f, refs); break;
    case "alerts": {
      const list = alertsFromData(d, f, refs);
      const z = await zeroToday(d, f);
      if (z) list.push(z);
      body = list;
      break;
    }
  }
  return { section, generatedAt: d.generatedAt, journeyLive: d.journeyLive, env: e, ms: Date.now() - t0, people: refs.people, vlinks: refs.vlinks, body };
}
