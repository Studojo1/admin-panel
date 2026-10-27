import type { Route } from "./+types/api.ugc-applicants";
import { adminOnly } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql, type SQL } from "drizzle-orm";

// Applications to the Growth Fellowship. The public form on
// studojo.com/fellowship-growth (also /creators and /ugc) writes the rows;
// this route lists them for the team, saves the review status and team notes,
// and counts the page's funnel and the applicants' share links from the events
// the public page records.

// The review states. 'new' is the default assigned on insert by the public
// form; the rest are set from this panel.
const STATUSES = ["new", "shortlisted", "selected", "rejected"] as const;
type Status = (typeof STATUSES)[number];

const isStatus = (value: string): value is Status =>
  (STATUSES as readonly string[]).includes(value);

const NOTES_MAX = 2000;

// Ids are SERIAL, so a positive int4. Anything else can never match a row, and
// passing it on would make Postgres fail with "out of range" instead of a 400.
function parseId(value: unknown): number | null {
  const id =
    typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

// The public form creates this table on first submit (frontend
// app/lib/ugc-application.server.ts). Same definition here so the page works,
// showing zero, before anyone has applied. Keep the two in step.
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_applications (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      college TEXT NOT NULL,
      course TEXT NOT NULL,
      year_of_study TEXT NOT NULL,
      graduation_year TEXT,
      city TEXT,
      linkedin_url TEXT NOT NULL,
      followers TEXT NOT NULL,
      post_frequency TEXT NOT NULL,
      last_posted TEXT NOT NULL,
      best_post_url TEXT,
      crossed_1k TEXT,
      field TEXT NOT NULL,
      target_roles TEXT NOT NULL,
      dream_companies TEXT,
      looking_for TEXT NOT NULL,
      topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      avoid_topics TEXT,
      story_work TEXT,
      story_setback TEXT,
      story_lesson TEXT,
      tone TEXT,
      can_commit TEXT NOT NULL,
      studojo_ok TEXT NOT NULL,
      why_join TEXT NOT NULL,
      referral_source TEXT,
      referred_by TEXT,
      consent_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      team_notes TEXT,
      source_path TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      referrer TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // One application per email, enforced by the database.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ugc_applications_email_unique
    ON ugc_applications (lower(email))
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ugc_applications_created_at
    ON ugc_applications (created_at DESC)
  `);
  // The second version of the form. The public form runs the same statements
  // in the same order. Connections replace followers (old rows keep their
  // followers answer). Applicants can say they have no LinkedIn, which leaves
  // every LinkedIn answer empty. Every applicant gets a share code for their
  // share links, and someone who applies through one of those links carries
  // that code in came_from_code.
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS connections TEXT`);
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS has_linkedin BOOLEAN NOT NULL DEFAULT true`);
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS share_code TEXT`);
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS came_from_code TEXT`);
  await db.execute(sql`ALTER TABLE ugc_applications ALTER COLUMN followers DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE ugc_applications ALTER COLUMN linkedin_url DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE ugc_applications ALTER COLUMN post_frequency DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE ugc_applications ALTER COLUMN last_posted DROP NOT NULL`);
  // The Growth Fellowship questions; identical statements run on the public form.
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS fellowship_goals JSONB`);
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS intern_interest TEXT`);
  await db.execute(sql`ALTER TABLE ugc_applications ADD COLUMN IF NOT EXISTS network_share TEXT`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ugc_applications_share_code
    ON ugc_applications (share_code) WHERE share_code IS NOT NULL
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ugc_applications_came_from
    ON ugc_applications (came_from_code) WHERE came_from_code IS NOT NULL
  `);
  tableReady = true;
}

// How many applicants are in each status, for the header. The four review
// states are always present, so the page can show a zero.
async function statusCounts() {
  const result = await db.execute(sql`
    SELECT status,
           COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last_24_hours
    FROM ugc_applications
    GROUP BY status
  `);
  const rows = result.rows as { status: string; count: number; last_24_hours: number }[];
  return {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    last_24_hours: rows.reduce((sum, r) => sum + r.last_24_hours, 0),
    by_status: Object.fromEntries([
      ...STATUSES.map((s): [string, number] => [s, 0]),
      ...rows.map((r): [string, number] => [r.status, r.count]),
    ]),
  };
}

// The driver returns timestamptz as Postgres text ("2026-10-26 13:48:53.62+00").
// Send ISO 8601 instead, so every browser and spreadsheet reads it the same way.
function isoTime(value: unknown): string | null {
  if (value == null) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

// topics is a JSONB array of labels, which the driver parses. A row edited by
// hand into some other shape shows no topics rather than breaking the page.
function topicList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
}

// ---------------------------------------------------------------------------
// Funnel and share links
//
// The public page writes one system_events row per step, with metadata
// { anon_id, path, in_app, info }. anon_id is one id per browser (null when the
// browser blocks storage); path is the page's pathname plus query string, so a
// visit through a share link carries ?ref=<share code>&utm_source=<channel>.
// Only these event types are read:
//   funnel_creators_view      a page view
//   funnel_creators_start     first interaction with the form
//   funnel_creators_step      info "2", "3" or "4": the step reached on Next
//   funnel_creators_submit    info: the new applicant's share code
//   funnel_creators_no_linkedin, _no_linkedin_continue, _no_linkedin_create:
//                             the "no LinkedIn" warning was shown, and what
//                             they did next
//   funnel_creators_share     info "<channel>:<share code>": a share button
//                             click on the success screen
// ---------------------------------------------------------------------------

// The windows the page can ask for, in days. Anything else gets the default.
const RANGES = { "7d": 7, "30d": 30, all: null } as const;
type Range = keyof typeof RANGES;
const DEFAULT_RANGE: Range = "30d";

function parseRange(value: string | null): Range {
  return value !== null && Object.prototype.hasOwnProperty.call(RANGES, value) ? (value as Range) : DEFAULT_RANGE;
}

// Rows from inside the window. Both tables name their time column created_at,
// and every query below reads one table per FROM, so the name is unambiguous.
function inWindow(range: Range): SQL {
  const days = RANGES[range];
  return days === null ? sql`` : sql`AND created_at >= NOW() - make_interval(days => ${days}::int)`;
}

// The share buttons on the success screen. Anything else in an event or a
// link's utm_source is counted as "other".
const CHANNELS = ["linkedin", "whatsapp", "copy"] as const;
type Channel = (typeof CHANNELS)[number] | "other";

const channelOf = (value: string | null): Channel =>
  value !== null && (CHANNELS as readonly string[]).includes(value) ? (value as Channel) : "other";

// Unique browsers by anon_id. An event without one counts on its own, so a
// browser that blocks storage is still counted (once per event).
const PEOPLE = sql`(COUNT(DISTINCT anon) + COUNT(*) FILTER (WHERE anon IS NULL))::int`;

// Page views with the share code (ref) and utm_source read from the query
// string. The path is lowercased first, so ?ref=AB12CD34 is the same link as
// ?ref=ab12cd34 (the form lowercases the code it saves the same way). A ref
// that is not exactly 8 letters or digits is not a share link.
function views(range: Range): SQL {
  return sql`
    SELECT NULLIF(metadata->>'anon_id', '') AS anon,
           substring(lower(metadata->>'path') from '[?&]ref=([a-z0-9]{8})(&|$)') AS ref,
           NULLIF(substring(lower(metadata->>'path') from '[?&]utm_source=([^&]*)'), '') AS source
    FROM system_events
    WHERE event_type = 'funnel_creators_view' ${inWindow(range)}
  `;
}

// Share button clicks, split into the channel and the sharer's code.
function shareClicks(range: Range): SQL {
  return sql`
    SELECT split_part(info, ':', 1) AS channel,
           substring(info from '^[a-z]+:([a-z0-9]{8})$') AS code
    FROM (
      SELECT lower(COALESCE(metadata->>'info', '')) AS info
      FROM system_events
      WHERE event_type = 'funnel_creators_share' ${inWindow(range)}
    ) e
  `;
}

// Per applicant: share button clicks by channel, unique visitors through their
// link and applications through their link, in the window. Only applicants
// with at least one of those, best first.
function sharerStats(range: Range, limit: number | null): SQL {
  return sql`
    WITH clicks AS (
      SELECT code,
             COUNT(*) FILTER (WHERE channel = 'linkedin')::int AS linkedin,
             COUNT(*) FILTER (WHERE channel = 'whatsapp')::int AS whatsapp,
             COUNT(*) FILTER (WHERE channel = 'copy')::int AS copied,
             COUNT(*)::int AS total
      FROM (${shareClicks(range)}) s
      WHERE code IS NOT NULL
      GROUP BY code
    ),
    visits AS (
      SELECT ref AS code, ${PEOPLE} AS visitors
      FROM (${views(range)}) v
      WHERE ref IS NOT NULL
      GROUP BY ref
    ),
    applied AS (
      SELECT came_from_code AS code, COUNT(*)::int AS applications
      FROM ugc_applications
      WHERE came_from_code IS NOT NULL ${inWindow(range)}
      GROUP BY came_from_code
    )
    SELECT a.id, a.full_name, a.share_code,
           COALESCE(c.linkedin, 0) AS clicks_linkedin,
           COALESCE(c.whatsapp, 0) AS clicks_whatsapp,
           COALESCE(c.copied, 0) AS clicks_copy,
           COALESCE(c.total, 0) AS clicks_total,
           COALESCE(v.visitors, 0) AS visitors,
           COALESCE(p.applications, 0) AS applications
    FROM ugc_applications a
    LEFT JOIN clicks c ON c.code = a.share_code
    LEFT JOIN visits v ON v.code = a.share_code
    LEFT JOIN applied p ON p.code = a.share_code
    WHERE c.code IS NOT NULL OR v.code IS NOT NULL OR p.code IS NOT NULL
    ORDER BY applications DESC, visitors DESC, clicks_total DESC, a.id
    ${limit === null ? sql`` : sql`LIMIT ${limit}`}
  `;
}

type SharerRow = {
  id: number;
  full_name: string;
  share_code: string;
  clicks_linkedin: number;
  clicks_whatsapp: number;
  clicks_copy: number;
  clicks_total: number;
  visitors: number;
  applications: number;
};

interface ShareStats {
  clicks: { linkedin: number; whatsapp: number; copy: number; total: number };
  visitors: number;
}

const clickCounts = (r: SharerRow): ShareStats["clicks"] => ({
  linkedin: r.clicks_linkedin,
  whatsapp: r.clicks_whatsapp,
  copy: r.clicks_copy,
  total: r.clicks_total,
});

const TOP_SHARERS = 10;

async function loadAnalytics(range: Range) {
  const [funnelResult, visitResult, appResult, clickResult, topResult] = await Promise.all([
    // Unique browsers at each step of the form, and at the "no LinkedIn" warning.
    db.execute(sql`
      SELECT stage, ${PEOPLE} AS people
      FROM (
        SELECT CASE
                 WHEN event_type = 'funnel_creators_view' THEN 'view'
                 WHEN event_type = 'funnel_creators_start' THEN 'start'
                 WHEN event_type = 'funnel_creators_step' AND metadata->>'info' = '2' THEN 'step2'
                 WHEN event_type = 'funnel_creators_step' AND metadata->>'info' = '3' THEN 'step3'
                 WHEN event_type = 'funnel_creators_step' AND metadata->>'info' = '4' THEN 'step4'
                 WHEN event_type = 'funnel_creators_submit' THEN 'submit'
                 WHEN event_type = 'funnel_creators_no_linkedin' THEN 'no_linkedin_shown'
                 WHEN event_type = 'funnel_creators_no_linkedin_continue' THEN 'no_linkedin_continued'
                 WHEN event_type = 'funnel_creators_no_linkedin_create' THEN 'no_linkedin_created'
               END AS stage,
               NULLIF(metadata->>'anon_id', '') AS anon
        FROM system_events
        WHERE event_type IN (
                'funnel_creators_view', 'funnel_creators_start', 'funnel_creators_step',
                'funnel_creators_submit', 'funnel_creators_no_linkedin',
                'funnel_creators_no_linkedin_continue', 'funnel_creators_no_linkedin_create'
              ) ${inWindow(range)}
      ) e
      WHERE stage IS NOT NULL
      GROUP BY stage
    `),
    // Visitors by where they came from. Visits through a share link are kept
    // apart from the rest (their utm_source is the share button, not a
    // campaign). The second grouping gives each side's own unique total.
    db.execute(sql`
      SELECT via_share, source, GROUPING(source) = 1 AS subtotal, ${PEOPLE} AS visitors
      FROM (SELECT anon, ref IS NOT NULL AS via_share, source FROM (${views(range)}) v) t
      GROUP BY GROUPING SETS ((via_share, source), (via_share))
    `),
    // Applications by where they came from, from the table itself.
    db.execute(sql`
      SELECT came_from_code IS NOT NULL AS via_share,
             NULLIF(lower(btrim(utm_source)), '') AS source,
             COUNT(*)::int AS applications,
             COUNT(*) FILTER (WHERE NOT has_linkedin)::int AS no_linkedin
      FROM ugc_applications
      WHERE TRUE ${inWindow(range)}
      GROUP BY 1, 2
    `),
    // Share button clicks by channel; the rollup row is the total.
    db.execute(sql`
      SELECT channel, GROUPING(channel) = 1 AS subtotal,
             COUNT(*)::int AS clicks, COUNT(DISTINCT code)::int AS sharers
      FROM (
        SELECT CASE WHEN channel IN ('linkedin', 'whatsapp', 'copy') THEN channel ELSE 'other' END AS channel, code
        FROM (${shareClicks(range)}) s
      ) c
      GROUP BY ROLLUP (channel)
    `),
    db.execute(sharerStats(range, TOP_SHARERS)),
  ]);

  const people = new Map(
    (funnelResult.rows as { stage: string; people: number }[]).map((r): [string, number] => [r.stage, r.people])
  );
  const stage = (key: string) => people.get(key) ?? 0;

  type ChannelStats = { channel: Channel; clicks: number; sharers: number; visitors: number; applications: number };
  const channels = new Map(
    [...CHANNELS, "other" as const].map((c): [Channel, ChannelStats] => [
      c,
      { channel: c, clicks: 0, sharers: 0, visitors: 0, applications: 0 },
    ])
  );
  const sources = new Map<string, { source: string | null; visitors: number; applications: number }>();
  const sourceRow = (source: string | null) => {
    const key = source ?? "";
    let row = sources.get(key);
    if (!row) {
      row = { source, visitors: 0, applications: 0 };
      sources.set(key, row);
    }
    return row;
  };
  const shareLinks = { visitors: 0, applications: 0 };

  for (const r of visitResult.rows as { via_share: boolean; source: string | null; subtotal: boolean; visitors: number }[]) {
    if (r.via_share) {
      if (r.subtotal) shareLinks.visitors = r.visitors;
      else channels.get(channelOf(r.source))!.visitors += r.visitors;
    } else if (!r.subtotal) {
      sourceRow(r.source).visitors += r.visitors;
    }
  }

  let applications = 0;
  let appliedWithoutLinkedin = 0;
  for (const r of appResult.rows as { via_share: boolean; source: string | null; applications: number; no_linkedin: number }[]) {
    applications += r.applications;
    appliedWithoutLinkedin += r.no_linkedin;
    if (r.via_share) {
      shareLinks.applications += r.applications;
      channels.get(channelOf(r.source))!.applications += r.applications;
    } else {
      sourceRow(r.source).applications += r.applications;
    }
  }

  let clicks = 0;
  let sharers = 0;
  for (const r of clickResult.rows as { channel: Channel | null; subtotal: boolean; clicks: number; sharers: number }[]) {
    if (r.subtotal) {
      clicks = r.clicks;
      sharers = r.sharers;
    } else {
      const c = channels.get(channelOf(r.channel))!;
      c.clicks += r.clicks;
      c.sharers += r.sharers;
    }
  }

  return {
    range,
    funnel: {
      view: stage("view"),
      start: stage("start"),
      step2: stage("step2"),
      step3: stage("step3"),
      step4: stage("step4"),
      submit: stage("submit"),
      applications,
    },
    no_linkedin: {
      shown: stage("no_linkedin_shown"),
      continued: stage("no_linkedin_continued"),
      created: stage("no_linkedin_created"),
      applications: appliedWithoutLinkedin,
    },
    sources: {
      // Traffic that did not come through a share link, by utm_source (null:
      // no utm_source at all), most visitors first.
      rows: [...sources.values()].sort(
        (a, b) => b.visitors - a.visitors || b.applications - a.applications || (a.source ?? "").localeCompare(b.source ?? "")
      ),
      share_links: shareLinks,
    },
    sharing: {
      channels: [...channels.values()],
      clicks,
      sharers,
      visitors: shareLinks.visitors,
      applications: shareLinks.applications,
    },
    top_sharers: (topResult.rows as SharerRow[]).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      share_code: r.share_code,
      clicks: clickCounts(r),
      visitors: r.visitors,
      applications: r.applications,
    })),
  };
}

// drizzle wraps a failed query in an error whose message is the whole SQL
// text; the database's own reason is in cause.
function reason(e: unknown): string {
  const err = e as { message?: string; cause?: { message?: string } } | null;
  return err?.cause?.message ?? err?.message ?? String(e);
}

// The numbers are extra: when they cannot be counted (the events table is
// missing, say), the applicants still load and the page says what failed.
async function analyticsOrError(range: Range) {
  try {
    return { analytics: await loadAnalytics(range) };
  } catch (e) {
    console.error("[ugc-applicants] funnel and sharing numbers failed:", reason(e));
    return { analytics: null, analytics_error: "The funnel and sharing numbers could not be counted." };
  }
}

// Every applicant's share clicks and visitors through their link, all time,
// by applicant id. Null when they cannot be counted.
async function allTimeShareStats() {
  try {
    const result = await db.execute(sharerStats("all", null));
    return new Map(
      (result.rows as SharerRow[]).map((r): [number, ShareStats] => [r.id, { clicks: clickCounts(r), visitors: r.visitors }])
    );
  } catch (e) {
    console.error("[ugc-applicants] share stats failed:", reason(e));
    return null;
  }
}

const NO_SHARES: ShareStats = { clicks: { linkedin: 0, whatsapp: 0, copy: 0, total: 0 }, visitors: 0 };

// POST { intent: "set-status", id, status }: move an applicant through review.
// POST { intent: "set-notes", id, notes }: save the team's notes on an applicant.
export async function action({ request }: Route.ActionArgs) {
  const denied = await adminOnly(request);
  if (denied) return denied;
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  await ensureTable();
  const parsed = await request.json().catch(() => null);
  const body: Record<string, unknown> = parsed && typeof parsed === "object" ? parsed : {};

  if (body.intent === "set-status") {
    const id = parseId(body.id);
    const status = String(body.status ?? "");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    if (!isStatus(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    const result = await db.execute(sql`
      UPDATE ugc_applications SET status = ${status}
      WHERE id = ${id}
      RETURNING id, status
    `);
    if (result.rows.length === 0) {
      return Response.json({ error: "Applicant not found" }, { status: 404 });
    }
    // Fresh counts, so the header stays right without reloading every row.
    return Response.json({ ok: true, applicant: result.rows[0], counts: await statusCounts() });
  }

  if (body.intent === "set-notes") {
    const id = parseId(body.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    // A missing notes field is an error rather than "clear the notes"; clearing
    // is sending an empty string (or null).
    if (typeof body.notes !== "string" && body.notes !== null) {
      return Response.json({ error: "notes must be text" }, { status: 400 });
    }
    const notes = String(body.notes ?? "").replace(/\r\n?/g, "\n").trim();
    if (notes.length > NOTES_MAX) {
      return Response.json({ error: "Notes can be at most 2,000 characters" }, { status: 400 });
    }
    // Empty notes are stored as NULL, the same as never having written any.
    const result = await db.execute(sql`
      UPDATE ugc_applications SET team_notes = ${notes || null}
      WHERE id = ${id}
      RETURNING id, team_notes
    `);
    if (result.rows.length === 0) {
      return Response.json({ error: "Applicant not found" }, { status: 404 });
    }
    return Response.json({ ok: true, applicant: result.rows[0] });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}

// GET: every application, newest first, with counts by status, each
// applicant's all-time share stats, and the funnel and sharing numbers for
// ?range=7d, 30d (the default) or all. All rows at once because the page
// filters, searches and exports in the browser.
// GET ?only=analytics: just the funnel and sharing numbers, for switching the
// range without reloading every applicant.
export async function loader({ request }: Route.LoaderArgs) {
  const denied = await adminOnly(request);
  if (denied) return denied;

  await ensureTable();

  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get("range"));

  if (params.get("only") === "analytics") {
    return Response.json(await analyticsOrError(range));
  }

  const [result, counts, analytics, shareStats] = await Promise.all([
    db.execute(sql`
      SELECT id, full_name, email, whatsapp, college, course, year_of_study,
             graduation_year, city, has_linkedin, linkedin_url, connections, followers,
             post_frequency, last_posted, best_post_url, crossed_1k,
             fellowship_goals, intern_interest, network_share, field, target_roles,
             dream_companies, looking_for, topics, avoid_topics,
             story_work, story_setback, story_lesson, tone,
             can_commit, studojo_ok, why_join, referral_source, referred_by,
             consent_at, status, team_notes, share_code, came_from_code,
             source_path, utm_source, utm_medium, utm_campaign, referrer,
             created_at
      FROM ugc_applications
      ORDER BY created_at DESC, id DESC
    `),
    statusCounts(),
    analyticsOrError(range),
    allTimeShareStats(),
  ]);

  const applicants = (result.rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    topics: topicList(row.topics),
    fellowship_goals: topicList(row.fellowship_goals),
    consent_at: isoTime(row.consent_at),
    created_at: isoTime(row.created_at),
    share: shareStats ? (shareStats.get(row.id as number) ?? NO_SHARES) : null,
  }));

  return Response.json({ applicants, counts, ...analytics });
}
