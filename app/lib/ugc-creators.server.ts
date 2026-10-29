import { randomBytes, randomInt } from "node:crypto";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

// Fellows of the Studojo Growth Fellowship (the LinkedIn UGC programme):
// applicants the team has taken on. The team's admin writes and approves their
// posts; each fellow works through them on their own page
// (https://studojo.com/fellowship-growth/<slug>), which only reads and writes
// rows. This is the one place that creates or alters these tables (studojo.com
// runs no DDL). Every statement is idempotent and never drops or renames anything.

let tablesReady = false;

export async function ensureCreatorTables() {
  if (tablesReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_creators (
      id SERIAL PRIMARY KEY,
      application_id INTEGER UNIQUE,
      token TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT,
      whatsapp TEXT,
      linkedin_url TEXT,
      college TEXT,
      field TEXT,
      cohort TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      connections_at_join INTEGER,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_creator_posts (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES ugc_creators(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'personal',
      due_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      copied_at TIMESTAMPTZ,
      own_line TEXT,
      posted_at TIMESTAMPTZ,
      post_url TEXT,
      impressions INTEGER,
      reactions INTEGER,
      comments INTEGER,
      screenshot_url TEXT,
      metrics_at TIMESTAMPTZ,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ugc_creator_posts_creator ON ugc_creator_posts (creator_id, due_date)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_creator_stories (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES ugc_creators(id) ON DELETE CASCADE,
      prompt TEXT,
      text TEXT NOT NULL,
      spoken BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_creator_connections (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES ugc_creators(id) ON DELETE CASCADE,
      connections INTEGER NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // The review flow: Claude's drafts wait here until a person approves them.
  // A separate table, so no student-side query can ever show a draft. Approving
  // moves the draft into ugc_creator_posts as 'ready' and deletes it here.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_creator_drafts (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES ugc_creators(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'personal',
      due_date DATE NOT NULL,
      angle TEXT,
      status TEXT NOT NULL DEFAULT 'review',
      batch TEXT,
      feedback JSONB NOT NULL DEFAULT '[]'::jsonb,
      versions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ugc_creator_drafts_creator ON ugc_creator_drafts (creator_id, due_date)`);
  await db.execute(sql`ALTER TABLE ugc_creator_posts ADD COLUMN IF NOT EXISTS review JSONB`);
  await db.execute(sql`ALTER TABLE ugc_creator_posts ADD COLUMN IF NOT EXISTS insight TEXT`);
  await db.execute(sql`ALTER TABLE ugc_creator_posts ADD COLUMN IF NOT EXISTS insight_at TIMESTAMPTZ`);
  // What works for this fellow (written by Claude, editable by the team), and
  // the private part of their page's address.
  await db.execute(sql`ALTER TABLE ugc_creators ADD COLUMN IF NOT EXISTS learnings TEXT`);
  await db.execute(sql`ALTER TABLE ugc_creators ADD COLUMN IF NOT EXISTS slug TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ugc_creators_slug ON ugc_creators (slug) WHERE slug IS NOT NULL`);
  await db.execute(sql`
    UPDATE ugc_creators
    SET slug = COALESCE(NULLIF(lower(regexp_replace(split_part(full_name, ' ', 1), '[^a-zA-Z]', '', 'g')), ''), 'fellow')
               || '-' || substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8)
    WHERE slug IS NULL
  `);
  // The team's call notes on each fellow ("About them"), which Claude reads
  // before writing, and when the team last nudged them. Admin only: the
  // fellows' own pages must never select these.
  await db.execute(sql`ALTER TABLE ugc_creators ADD COLUMN IF NOT EXISTS team_notes TEXT`);
  await db.execute(sql`ALTER TABLE ugc_creators ADD COLUMN IF NOT EXISTS nudged_at TIMESTAMPTZ`);
  // Posts a fellow wrote before the fellowship, so Claude never repeats them.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_creator_earlier_posts (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES ugc_creators(id) ON DELETE CASCADE,
      title TEXT,
      body TEXT NOT NULL,
      posted_on DATE,
      url TEXT,
      impressions INTEGER,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ugc_creator_earlier_posts_creator ON ugc_creator_earlier_posts (creator_id)`);
  // Lessons for every fellow, no names (one row).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_playbook (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await db.execute(sql`INSERT INTO ugc_playbook (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  // The programme's rules, the one copy both apps read (one row).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ugc_programme (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      rules JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await db.execute(sql`INSERT INTO ugc_programme (id, rules) VALUES (1, ${JSON.stringify(PROGRAMME_RULES)}::jsonb) ON CONFLICT (id) DO NOTHING`);
  tablesReady = true;
}

/** 32 url-safe characters, kept for API use. */
export function newCreatorToken(): string {
  return randomBytes(24).toString("base64url");
}

// No 0/o, 1/l/i: people read these out and type them.
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * The fellow's page address: their first name and 8 random characters
 * ("riya-k3m9x2qa"). The random part keeps one fellow from guessing another's page.
 */
export function newCreatorSlug(fullName: string): string {
  const first = (fullName.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 20) || "fellow";
  let tail = "";
  for (let i = 0; i < 8; i++) tail += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return `${first}-${tail}`;
}

export function studentLink(slug: string | null | undefined): string | null {
  return slug ? `https://studojo.com/fellowship-growth/${slug}` : null;
}

// ---------------------------------------------------------------------------
// Programme rules. Weeks run Monday to Sunday, India time. A post belongs to
// the week of its due date. A week is complete when it has posts and every one
// of them is posted. The run is the complete weeks in a row counting back from
// last week, plus this week once it is complete (an unfinished current week
// does not break the run yet).
// ---------------------------------------------------------------------------

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const DAY = 86400000;

/** "YYYY-MM-DD" for a moment, in India time. */
export function istDate(t: Date | string | number = new Date()): string {
  return IST_DATE.format(new Date(t));
}

/** The Monday of the week a "YYYY-MM-DD" date falls in. */
export function weekOf(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

export interface PostRow {
  id: number;
  creator_id: number;
  title: string;
  body: string;
  kind: string;
  due_date: string;
  status: string;
  copied_at: string | null;
  own_line: string | null;
  posted_at: string | null;
  post_url: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  screenshot_url: string | null;
  metrics_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const MILESTONES = [
  { id: "trial", weeks: 2, name: "2-week certificate", detail: "A certificate for completing the 2-week trial." },
  {
    id: "month",
    weeks: 4,
    name: "1-month intern certificate",
    detail: "Top performers are invited to continue. They earn a 1-month certificate as an intern and get first preference when Studojo is hiring.",
  },
  { id: "outreach", weeks: 8, name: "The new outreach tool", detail: "Exclusive access to Studojo's new outreach tool." },
  { id: "long", weeks: 12, name: "3-month certificate", detail: "For ongoing participation in the programme." },
] as const;

export const HIRING_PIPELINE = {
  id: "pipeline",
  name: "Hiring pipeline",
  detail: "High performers are considered for internships at Studojo or referred to people hiring in our network.",
};

/** The rules both apps read, seeded into ugc_programme once; edit the row, not this. */
export const PROGRAMME_RULES = {
  goal: { impressions: 1_000_000, creators: 125, by: "2026-11-25" },
  // The founder's plan (Oct 2026): where the programme should be by each date.
  // Measure progress against these, not a straight line to the goal.
  plan: [
    { by: "2026-11-01", creators: 35, posting: 21, impressions: 110_000 },
    { by: "2026-11-08", creators: 65, posting: 39, impressions: 310_000 },
    { by: "2026-11-15", creators: 95, posting: 57, impressions: 600_000 },
    { by: "2026-11-25", creators: 125, posting: 75, impressions: 1_000_000 },
  ],
  postingDays: ["Tue", "Thu", "Sat"],
  postsPerWeek: 3,
  partnershipLabel: "In partnership with Studojo",
  weeks: "Weeks run Monday to Sunday, India time. A week is complete when it has posts and every one is posted.",
  milestones: MILESTONES.map((m) => ({ id: m.id, weeks: m.weeks, name: m.name, detail: m.detail })),
  hiringPipeline: HIRING_PIPELINE,
};

export interface CreatorStats {
  thisWeek: { start: string; due: number; posted: number };
  completedWeeks: number;
  run: number;
  postsPublished: number;
  impressions: number;
  /** Posted 7+ days ago and still without numbers. */
  awaitingNumbers: number;
  /** Posts due this week, none posted, and it is Wednesday or later. */
  atRisk: boolean;
  lastActivity: string | null;
  nextMilestone: { id: string; name: string; weeksToGo: number } | null;
  milestonesReached: string[];
}

// db.execute (drizzle) hands DATE and TIMESTAMPTZ back as text, but plain pg
// hands back Date objects; accept both so the numbers never depend on the driver.
const dayOf = (v: unknown): string => (v instanceof Date ? istDate(v) : String(v).slice(0, 10));
const msOf = (v: unknown): number => (v instanceof Date ? v.getTime() : v ? new Date(String(v)).getTime() : NaN);

export function creatorStats(posts: PostRow[], now: Date = new Date()): CreatorStats {
  const today = istDate(now);
  const thisWeek = weekOf(today);
  const byWeek = new Map<string, PostRow[]>();
  for (const p of posts) {
    const w = weekOf(dayOf(p.due_date));
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(p);
  }
  const complete = (w: string) => {
    const ps = byWeek.get(w);
    return Boolean(ps && ps.length && ps.every((p) => p.status === "posted"));
  };
  let run = complete(thisWeek) ? 1 : 0;
  for (let w = addDays(thisWeek, -7); byWeek.has(w) && complete(w); w = addDays(w, -7)) run++;
  const completedWeeks = [...byWeek.keys()].filter(complete).length;

  const due = byWeek.get(thisWeek) ?? [];
  const postedThisWeek = due.filter((p) => p.status === "posted").length;
  const weekday = Math.round((Date.parse(today) - Date.parse(thisWeek)) / DAY);

  const posted = posts.filter((p) => p.status === "posted");
  const sevenDaysAgo = now.getTime() - 7 * DAY;
  const activity = posts
    .flatMap((p) => [p.copied_at, p.posted_at, p.metrics_at])
    .map(msOf)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const next = MILESTONES.find((m) => completedWeeks < m.weeks) ?? null;
  return {
    thisWeek: { start: thisWeek, due: due.length, posted: postedThisWeek },
    completedWeeks,
    run,
    postsPublished: posted.length,
    impressions: posted.reduce((s, p) => s + (p.impressions ?? 0), 0),
    awaitingNumbers: posted.filter((p) => p.impressions === null && p.posted_at && msOf(p.posted_at) < sevenDaysAgo).length,
    atRisk: due.length > 0 && postedThisWeek === 0 && weekday >= 2,
    // Postgres text timestamps ("2026-10-19 13:49:55+05:30") don't parse in
    // every browser; hand the page an ISO string.
    lastActivity: activity.length ? new Date(activity[activity.length - 1]).toISOString() : null,
    nextMilestone: next ? { id: next.id, name: next.name, weeksToGo: next.weeks - completedWeeks } : null,
    milestonesReached: MILESTONES.filter((m) => completedWeeks >= m.weeks).map((m) => m.id),
  };
}

// Create the tables as soon as the server loads this module (at start-up in
// production): the fellows' pages on studojo.com only read and write rows, so
// they can't wait for an admin to visit first. A failure here is retried on
// first use, since tablesReady stays false.
ensureCreatorTables().catch((e) => {
  const err = e as { code?: string; name?: string };
  console.error("[ugc-creators] table setup at start failed; it retries on first use", err?.code ?? err?.name ?? "unknown");
});
