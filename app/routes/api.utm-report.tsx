import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { requireAdmin } from "~/lib/auth-helper.server";
import { channelFromReferrer, normalizeTags } from "~/lib/utm-dictionary";
import type { Route } from "./+types/api.utm-report";

/** GET /api/utm-report?view=links | sources | hygiene&days=30
 *
 * Numbers come from our own tables, not PostHog, so a link is judged by the
 * signups and payments it produced rather than by page views:
 *   clicks   utm_link_clicks, written by studojo.com/go/<slug> (bots excluded)
 *   signups  user_attribution, the first-touch tags stored at signup
 *   payers   payment_orders with status 'paid', for those same users
 *
 * First touch only: a user who clicked two links is credited to the first.
 */

// Test accounts would otherwise count as signups from whatever link a probe used.
const REAL_USER = sql`u.email NOT ILIKE '%@example.com' AND u.email NOT ILIKE '%studojo.test%'`;

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows[0] as any)?.ok);
}

const num = (v: unknown) => Number(v ?? 0);

async function linksView() {
  const hasClicks = await tableExists("public.utm_link_clicks");
  const clicks = hasClicks
    ? sql`(SELECT count(*) FROM utm_link_clicks k WHERE k.link_id = c.id AND NOT k.is_bot)`
    : sql`0`;
  const botClicks = hasClicks
    ? sql`(SELECT count(*) FROM utm_link_clicks k WHERE k.link_id = c.id AND k.is_bot)`
    : sql`0`;

  const r = await db.execute(sql`
    SELECT c.id,
           ${clicks} AS clicks,
           ${botClicks} AS bot_clicks,
           s.signups, s.payers, s.inr, s.usd
    FROM utm_campaigns c
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT a.user_id) AS signups,
             count(DISTINCT p.user_id) AS payers,
             coalesce(sum(p.amount_cents) FILTER (WHERE upper(p.currency) = 'INR'), 0) / 100.0 AS inr,
             coalesce(sum(p.amount_cents) FILTER (WHERE upper(p.currency) = 'USD'), 0) / 100.0 AS usd
      FROM user_attribution a
      JOIN "user" u ON u.id = a.user_id AND ${REAL_USER}
      LEFT JOIN payment_orders p ON p.user_id = a.user_id AND p.status = 'paid'
      WHERE lower(a.utm_source) = lower(c.utm_source)
        AND lower(coalesce(a.utm_medium, '')) = lower(c.utm_medium)
        AND lower(coalesce(a.utm_campaign, '')) = lower(c.utm_campaign)
        AND (c.utm_content IS NULL OR lower(coalesce(a.utm_content, '')) = lower(c.utm_content))
        AND (c.utm_term IS NULL OR lower(coalesce(a.utm_term, '')) = lower(c.utm_term))
    ) s ON TRUE
  `);
  const stats: Record<string, unknown> = {};
  for (const row of r.rows as any[]) {
    stats[row.id] = {
      clicks: num(row.clicks),
      botClicks: num(row.bot_clicks),
      signups: num(row.signups),
      payers: num(row.payers),
      inr: num(row.inr),
      usd: num(row.usd),
    };
  }
  return { stats };
}

type SourceRow = {
  source: string;
  medium: string;
  campaign: string;
  tagged: boolean;
  signups: number;
  payers: number;
  inr: number;
  usd: number;
};

async function sourcesView(days: number) {
  // Grouped in SQL by the raw values, then folded into dictionary channels here
  // so every old spelling (ig/paid, social, nurture) lands in one row.
  const r = await db.execute(sql`
    SELECT a.utm_source, a.utm_medium, a.utm_campaign,
           nullif(split_part(split_part(a.referrer, '://', 2), '/', 1), '') AS ref_host,
           (a.user_id IS NOT NULL) AS captured,
           count(DISTINCT u.id) AS signups,
           count(DISTINCT p.user_id) AS payers,
           coalesce(sum(p.amount_cents) FILTER (WHERE upper(p.currency) = 'INR'), 0) / 100.0 AS inr,
           coalesce(sum(p.amount_cents) FILTER (WHERE upper(p.currency) = 'USD'), 0) / 100.0 AS usd
    FROM "user" u
    LEFT JOIN user_attribution a ON a.user_id = u.id
    LEFT JOIN payment_orders p ON p.user_id = u.id AND p.status = 'paid'
    WHERE u.created_at > now() - make_interval(days => ${days}) AND ${REAL_USER}
    GROUP BY 1, 2, 3, 4, 5
  `);

  const merged = new Map<string, SourceRow>();
  let total = 0;
  let notCaptured = 0;
  let taggedSignups = 0;
  for (const row of r.rows as any[]) {
    const signups = num(row.signups);
    total += signups;
    let source: string;
    let medium: string;
    let tagged = false;
    if (!row.captured) {
      notCaptured += signups;
      source = "(not captured)";
      medium = "";
    } else if (row.utm_source) {
      const n = normalizeTags(row.utm_source, row.utm_medium);
      source = n.source;
      medium = n.medium;
      tagged = n.tagged;
      if (tagged) taggedSignups += signups;
    } else {
      const c = channelFromReferrer(row.ref_host ? `https://${row.ref_host}` : null);
      source = c.source;
      medium = c.medium;
    }
    const campaign = tagged ? String(row.utm_campaign || "").toLowerCase() : "";
    const key = `${source}|${medium}|${campaign}|${tagged}`;
    const cur = merged.get(key) ?? { source, medium, campaign, tagged, signups: 0, payers: 0, inr: 0, usd: 0 };
    cur.signups += signups;
    cur.payers += num(row.payers);
    cur.inr += num(row.inr);
    cur.usd += num(row.usd);
    merged.set(key, cur);
  }
  const rows = [...merged.values()].sort((a, b) => b.signups - a.signups || b.payers - a.payers);
  return { days, total, taggedSignups, notCaptured, rows };
}

async function hygieneView(days: number) {
  // Tag combinations stored against real signups that fall outside the
  // dictionary. PostHog visit-level combinations are checked by the page.
  const r = await db.execute(sql`
    SELECT a.utm_source, a.utm_medium, a.utm_campaign, count(*) AS signups
    FROM user_attribution a
    JOIN "user" u ON u.id = a.user_id AND ${REAL_USER}
    WHERE a.utm_source IS NOT NULL AND u.created_at > now() - make_interval(days => ${days})
    GROUP BY 1, 2, 3
    ORDER BY 4 DESC
  `);
  const problems = [];
  for (const row of r.rows as any[]) {
    const n = normalizeTags(row.utm_source, row.utm_medium);
    if (!n.tagged) continue; // a tag another site added, e.g. chatgpt.com
    const reasons: string[] = [];
    if (!n.known) reasons.push("source or medium not in the dictionary");
    if (row.utm_campaign && /^\d+$/.test(row.utm_campaign)) reasons.push("campaign is a bare number (Meta id)");
    if (!row.utm_campaign) reasons.push("no campaign");
    if (row.utm_source !== n.source || (row.utm_medium ?? "") !== n.medium)
      reasons.push(`old spelling, reported as ${n.source} / ${n.medium}`);
    if (reasons.length)
      problems.push({
        source: row.utm_source,
        medium: row.utm_medium,
        campaign: row.utm_campaign,
        signups: num(row.signups),
        reasons,
      });
  }
  return { days, problems };
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "links";
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));

  if (!(await tableExists("public.user_attribution"))) {
    return Response.json({ error: "user_attribution does not exist yet" }, { status: 503 });
  }

  try {
    if (view === "sources") return Response.json(await sourcesView(days));
    if (view === "hygiene") return Response.json(await hygieneView(days));
    return Response.json(await linksView());
  } catch (e: any) {
    console.error("[utm-report]", e);
    return Response.json({ error: "Report query failed" }, { status: 500 });
  }
}
