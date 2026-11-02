import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import { stuData } from "~/lib/stu/data.server";
import { istDay, stepAt, todayIst } from "~/lib/stu/model";
import {
  buildReport,
  touchKey,
  withUtmId,
  type LinkKey,
  type ReportClick,
  type ReportUser,
  type ReportVisitor,
} from "~/lib/utm-attribution";
import type { Route } from "./+types/api.utm-report";

/** GET /api/utm-report?start=YYYY-MM-DD&end=YYYY-MM-DD&touch=first|last&internal=1
 *
 * Every UTM link, and every campaign, judged by what the new product (Stu)
 * got from it, read only from this environment's own database:
 *   clicks     utm_link_clicks, written by studojo.com/go/<slug> (bots apart)
 *   visitors   distinct website visitors whose journey events carried the link
 *              (career_agent.career_journey_events.source)
 *   sign-ups   people who joined Stu in the range (the dashboards' cohort: IST
 *              day of joining), credited by their first touch (or last touch)
 *              from career_agent.career_user_source, else the journey log
 *   onboarded, paid, revenue  the same rules as the Stu dashboards (ground-truth
 *              tables over the journey log, test payments left out)
 * A touch is credited on utm_id = the link's slug, else by matching utm_*
 * (app/lib/utm-attribution.ts). Internal accounts (staff, studojo.com, test,
 * guest) are left out unless internal=1, as on the dashboards. Days are IST.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const J = "career_agent.career_journey_events";
const SRC = "career_agent.career_user_source";
const ist = (x: string) => `to_char((${x}) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
const NONEMPTY = (c: string) => `${c} IS NOT NULL AND ${c} <> '{}'::jsonb`;

type Q = (text: string) => Promise<any[]>;

async function readOnly<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
      const q: Q = async (text) => (await tx.execute(sql.raw(text))).rows as any[];
      return fn(q);
    },
    { accessMode: "read only" },
  );
}

async function loadRaw(touch: "first" | "last") {
  return readOnly(async (q) => {
    const reg = (
      await q(`SELECT to_regclass('public.utm_campaigns') IS NOT NULL AS links,
                      to_regclass('public.utm_link_clicks') IS NOT NULL AS clicks,
                      to_regclass('${J}') IS NOT NULL AS journey,
                      to_regclass('${SRC}') IS NOT NULL AS source`)
    )[0] as { links: boolean; clicks: boolean; journey: boolean; source: boolean };
    const srcCols = reg.source
      ? new Set(
          (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'career_agent' AND table_name = 'career_user_source'`)).map(
            (r) => r.column_name as string,
          ),
        )
      : new Set<string>();
    const touchCol = touch === "first" ? "first_touch" : "last_touch";

    const links = reg.links
      ? await q(`SELECT id, slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term
                   FROM public.utm_campaigns ORDER BY created_at, id`)
      : [];
    const clicks = reg.clicks
      ? await q(`SELECT link_id, ${ist("clicked_at")} AS day, is_bot, count(*)::int AS n
                   FROM public.utm_link_clicks GROUP BY 1, 2, 3`)
      : [];
    const sourceRows =
      reg.source && srcCols.has(touchCol)
        ? await q(`SELECT user_id, ${touchCol} AS touch FROM ${SRC} WHERE user_id IS NOT NULL AND ${NONEMPTY(touchCol)}`)
        : [];

    let pairs: any[] = [];
    let eventTouch: any[] = [];
    let visitorTouches: any[] = [];
    if (reg.journey) {
      const uvParts = [`SELECT DISTINCT user_id, visitor_id FROM ${J} WHERE user_id IS NOT NULL AND visitor_id IS NOT NULL`];
      if (srcCols.has("visitor_id")) uvParts.push(`SELECT user_id, visitor_id FROM ${SRC} WHERE user_id IS NOT NULL AND visitor_id IS NOT NULL`);
      const uv = uvParts.join(" UNION ");
      pairs = await q(`${uv} LIMIT 300000`);
      // The person's first (or last) journey event with a source, their own or their visitor id's before sign-in.
      eventTouch = await q(`
        WITH uv AS (${uv}),
             ev AS (
               SELECT e.user_id, e.at, e.source FROM ${J} e WHERE e.user_id IS NOT NULL AND ${NONEMPTY("e.source")}
               UNION ALL
               SELECT uv.user_id, e.at, e.source FROM ${J} e JOIN uv ON uv.visitor_id = e.visitor_id
                WHERE e.user_id IS NULL AND ${NONEMPTY("e.source")})
        SELECT DISTINCT ON (user_id) user_id, source FROM ev
         ORDER BY user_id, at ${touch === "first" ? "ASC" : "DESC"} LIMIT 200000`);
      visitorTouches = await q(`
        SELECT visitor_id, ${ist("at")} AS day, source FROM ${J}
         WHERE visitor_id IS NOT NULL AND source IS NOT NULL
           AND (source ? 'utm_id' OR source ? 'utm_source' OR source ? 'utm_campaign')
         GROUP BY 1, 2, 3 LIMIT 300000`);
    }
    return { reg, links, clicks, sourceRows, pairs, eventTouch, visitorTouches };
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const p = (k: string) => url.searchParams.get(k) ?? "";
  const end = DAY_RE.test(p("end")) ? p("end") : todayIst();
  const start = DAY_RE.test(p("start")) ? p("start") : "2000-01-01";
  const touch = p("touch") === "last" ? "last" : "first";
  const internal = p("internal") === "1";
  const headers = { "Cache-Control": "no-store" };

  try {
    const [d, raw] = await Promise.all([stuData(p("fresh") === "1"), loadRaw(touch)]);

    const links: LinkKey[] = raw.links.map((r) => ({
      id: String(r.id),
      slug: r.slug,
      source: r.utm_source,
      medium: r.utm_medium,
      campaign: r.utm_campaign,
      content: r.utm_content,
      term: r.utm_term,
    }));
    const clicks: ReportClick[] = raw.clicks.map((r) => ({ linkId: String(r.link_id), day: String(r.day), bot: !!r.is_bot, n: Number(r.n) || 0 }));

    // Revenue as on the dashboards: real payments (paise), refunds taken off, test payments left out.
    const idx = new Map<string, number>();
    d.users.forEach((u, i) => idx.set(u.id, i));
    const revenue = new Map<number, number>();
    for (const [kind, i, , , amt] of d.act) if (kind === "pay") revenue.set(i, (revenue.get(i) ?? 0) + amt);

    const rowTouch = new Map<string, unknown>();
    for (const r of raw.sourceRows) rowTouch.set(r.user_id, r.touch);
    const evTouch = new Map<string, unknown>();
    for (const r of raw.eventTouch) evTouch.set(r.user_id, r.source);

    const users: ReportUser[] = d.users.map((u, i) => ({
      day: istDay(u.joined),
      internal: !!u.internal,
      touch: withUtmId(touchKey(rowTouch.get(u.id)), touchKey(evTouch.get(u.id))),
      onboarded: stepAt(d, u, "onboarded") != null,
      paid: stepAt(d, u, "paid") != null,
      revenue: revenue.get(i) ?? 0,
    }));

    // A visitor who became an internal account is internal too.
    const visitorUser = new Map<string, number>();
    for (const v of d.visitors) if (v.u >= 0) visitorUser.set(v.id, v.u);
    for (const r of raw.pairs) {
      const i = idx.get(r.user_id);
      if (i != null && !visitorUser.has(r.visitor_id)) visitorUser.set(r.visitor_id, i);
    }
    const visitors: ReportVisitor[] = raw.visitorTouches.map((r) => {
      const i = visitorUser.get(r.visitor_id);
      return { id: r.visitor_id, day: String(r.day), internal: i != null && !!d.users[i]?.internal, touch: touchKey(r.source) };
    });

    const report = buildReport({ links, clicks, users, visitors, start, end, internal });
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        start,
        end,
        touch,
        internal,
        live: { links: raw.reg.links, clicks: raw.reg.clicks, journey: raw.reg.journey, source: raw.reg.source },
        ...report,
      },
      { headers },
    );
  } catch (e: any) {
    console.error("[utm-report]", e);
    return Response.json({ error: "Report query failed" }, { status: 500 });
  }
}
