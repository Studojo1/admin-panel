import db from "~/lib/db.server";
import { deletePhoto, isAnalyticsRef, isPhotoRef, newPhotoRef, PHOTOS_PER_POST, proofRefs, putPhoto } from "~/lib/fellow-proof.server";
import { sql } from "drizzle-orm";
import {
  HIRING_PIPELINE,
  MILESTONES,
  PROGRAMME_RULES,
  addDays,
  ensureCreatorTables,
  istDate,
  studentLink,
  weekOf,
} from "~/lib/ugc-creators.server";

// The Growth Fellowship's editorial desk: the calendar the team works from
// (/fellowship-program/calendar) and the connection Vanshika's Claude Code uses to
// write posts (/api/agent). Claude only ever writes drafts. A draft lives in
// ugc_creator_drafts, which no student query reads, and reaches a fellow's page
// only when someone on the team approves it.
//
// Dates: Postgres DATE values are read as text (to_char) so a due day never
// shifts with the server's time zone. Timestamps go out as ISO strings.

export const POST_MAX = 3000; // LinkedIn's limit for one post
const PHOTO_IDEA_MIN = 12;
const PHOTO_IDEA_MAX = 500;
const SAME_POST = 0.5; // share of three-word runs that makes a post a repeat
const REPEAT_WINDOW_DAYS = 60;
const DAY = 86400000;

export type Kind = "personal" | "studojo";
export interface Feedback { id: string; t: string; text: string; by?: string; resolvedAt?: string; reply?: string }
export interface Version { t: string; by: "claude" | "team"; title: string; body: string; note?: string }
/** A post the team took back after approving it: the fellow sees a warning until it's released. */
export interface Block { at: string; by: string; reason: string; releasedAt?: string; releasedBy?: string }
export interface Review {
  draftedAt: string; approvedAt: string; approvedBy: string | null; batch: string | null; angle: string;
  claudeTitle: string; claudeBody: string; editedByTeam: boolean; feedback: Feedback[]; versions: Version[];
  blocked?: Block | null; blocks?: Block[];
  /** Photos the team added because the fellow had none (refs in photo_url). */
  teamPhotos?: string[];
}
export interface Draft {
  id: number; creatorId: number; title: string; body: string; kind: Kind; due: string; angle: string; photoIdea: string;
  status: "review" | "changes"; batch: string | null; feedback: Feedback[]; versions: Version[]; createdAt: string; updatedAt: string;
}
export interface Post {
  id: number; creatorId: number; title: string; body: string; kind: Kind; due: string; status: string;
  copiedAt: string | null; ownLine: string | null; postedAt: string | null; url: string | null;
  impressions: number | null; reactions: number | null; comments: number | null; screenshot: string | null; metricsAt: string | null;
  review: Review | null; insight: string | null; insightAt: string | null; createdAt: string; createdBy: string | null;
  /** What photo fits the post, the photos added to it (refs), and when the fellow said they have none. */
  photoIdea: string | null; photos: string[]; photoHelpAt: string | null;
  /** The post's LinkedIn analytics export, parsed by studojo.com (the latest upload), and every file uploaded (refs). */
  analytics: PostAnalytics | null; analyticsFiles: string[];
}
/** studojo.com's parse of a LinkedIn post analytics export (fellow-page side, 3 Nov 2026). */
export interface PostAnalytics {
  uploadedAt: string; file: string; postedOn: string | null; postUrl: string | null;
  metrics: Record<string, number>;
  demographics: Record<string, { value: string; pct: number }[]>;
}
function analyticsOf(v: unknown): PostAnalytics | null {
  const a = jsonOf<Record<string, unknown> | null>(v, null);
  if (!a || typeof a !== "object" || !a.metrics || typeof a.metrics !== "object") return null;
  const metrics = Object.fromEntries(Object.entries(a.metrics as Record<string, unknown>).filter(([, n]) => typeof n === "number" && Number.isFinite(n))) as Record<string, number>;
  const demographics: PostAnalytics["demographics"] = {};
  for (const [k, rows] of Object.entries((a.demographics as Record<string, unknown>) ?? {})) {
    if (Array.isArray(rows)) demographics[k] = rows.filter((r) => r && typeof r.value === "string" && typeof r.pct === "number").map((r) => ({ value: r.value as string, pct: r.pct as number }));
  }
  return {
    uploadedAt: String(a.uploadedAt ?? ""), file: String(a.file ?? ""), postedOn: typeof a.postedOn === "string" ? a.postedOn : null,
    postUrl: typeof a.postUrl === "string" ? a.postUrl : null, metrics, demographics,
  };
}
export interface Fellow {
  id: number; name: string; first: string; slug: string | null; link: string | null; applicationId: number | null;
  college: string | null; field: string | null; cohort: string | null; status: string; email: string | null;
  whatsapp: string | null; linkedin: string | null; joined: string; connectionsAtJoin: number | null;
  learnings: string; teamNotes: string; nudgedAt: string | null;
  /** Admin-only: taken on as a Growth intern / referred to someone hiring (set on the applicant profile). */
  internAt: string | null; referredAt: string | null;
}
export interface PostInput { title?: unknown; body?: unknown; kind?: unknown; due?: unknown; angle?: unknown; photoIdea?: unknown }

// Timestamps arrive as text from this app's db ("2026-10-29 08:47:00.12+00") or as Date objects; send ISO either way.
const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const jsonOf = <T,>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;
const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const newId = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Exec = { execute: typeof db.execute };

function toFellow(r: Record<string, unknown>): Fellow {
  const name = String(r.full_name ?? "");
  return {
    id: Number(r.id), name, first: firstName(name), slug: (r.slug as string) ?? null, link: studentLink(r.slug as string | null),
    applicationId: r.application_id == null ? null : Number(r.application_id),
    college: (r.college as string) ?? null, field: (r.field as string) ?? null, cohort: (r.cohort as string) ?? null,
    status: String(r.status ?? "active"), email: (r.email as string) ?? null, whatsapp: (r.whatsapp as string) ?? null,
    linkedin: (r.linkedin_url as string) ?? null, joined: String(r.joined_day ?? ""),
    connectionsAtJoin: r.connections_at_join == null ? null : Number(r.connections_at_join),
    learnings: String(r.learnings ?? ""), teamNotes: String(r.team_notes ?? ""), nudgedAt: iso(r.nudged_at),
    internAt: iso(r.intern_at), referredAt: iso(r.referred_at),
  };
}
function toPost(r: Record<string, unknown>): Post {
  return {
    id: Number(r.id), creatorId: Number(r.creator_id), title: String(r.title), body: String(r.body), kind: r.kind === "studojo" ? "studojo" : "personal",
    due: String(r.due), status: String(r.status), copiedAt: iso(r.copied_at), ownLine: (r.own_line as string) ?? null, postedAt: iso(r.posted_at),
    url: (r.post_url as string) ?? null, impressions: r.impressions == null ? null : Number(r.impressions),
    reactions: r.reactions == null ? null : Number(r.reactions), comments: r.comments == null ? null : Number(r.comments),
    screenshot: (r.screenshot_url as string) ?? null, metricsAt: iso(r.metrics_at), review: jsonOf<Review | null>(r.review, null),
    insight: (r.insight as string) ?? null, insightAt: iso(r.insight_at), createdAt: iso(r.created_at) ?? "", createdBy: (r.created_by as string) ?? null,
    photoIdea: (r.photo_idea as string) || null, photos: proofRefs((r.photo_url as string) ?? null).filter(isPhotoRef), photoHelpAt: iso(r.photo_help_at),
    analytics: analyticsOf(r.analytics), analyticsFiles: proofRefs((r.analytics_url as string) ?? null).filter(isAnalyticsRef),
  };
}
function toDraft(r: Record<string, unknown>): Draft {
  return {
    id: Number(r.id), creatorId: Number(r.creator_id), title: String(r.title), body: String(r.body), kind: r.kind === "studojo" ? "studojo" : "personal",
    due: String(r.due), angle: String(r.angle ?? ""), photoIdea: String(r.photo_idea ?? ""), status: r.status === "changes" ? "changes" : "review", batch: (r.batch as string) ?? null,
    feedback: jsonOf<Feedback[]>(r.feedback, []), versions: jsonOf<Version[]>(r.versions, []), createdAt: iso(r.created_at) ?? "", updatedAt: iso(r.updated_at) ?? "",
  };
}

const FELLOW_COLS = sql`id, application_id, slug, full_name, email, whatsapp, linkedin_url, college, field, cohort, status,
  connections_at_join, to_char(joined_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS joined_day, learnings, team_notes, nudged_at, intern_at, referred_at`;
const POST_COLS = sql`id, creator_id, title, body, kind, to_char(due_date, 'YYYY-MM-DD') AS due, status, copied_at, own_line, posted_at,
  post_url, impressions, reactions, comments, screenshot_url, metrics_at, review, insight, insight_at, created_at, created_by,
  photo_idea, photo_url, photo_help_at, analytics_url, analytics`;
const DRAFT_COLS = sql`id, creator_id, title, body, kind, to_char(due_date, 'YYYY-MM-DD') AS due, angle, photo_idea, status, batch, feedback, versions, created_at, updated_at`;

/** How many of a fellow's weekly posts are Studojo posts, when the team has set it (ugc_programme.rules.studojoPerWeek). */
const studojoPerWeek = (rules: object): number | null => {
  const n = Number((rules as Record<string, unknown>).studojoPerWeek);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export async function programmeRules(ex: Exec = db) {
  const r = (await ex.execute(sql`SELECT rules FROM ugc_programme WHERE id = 1`)).rows[0] as { rules?: typeof PROGRAMME_RULES } | undefined;
  return { ...PROGRAMME_RULES, ...jsonOf<Partial<typeof PROGRAMME_RULES>>(r?.rules, {}) };
}
async function fellows(ex: Exec = db) {
  return (await ex.execute(sql`SELECT ${FELLOW_COLS} FROM ugc_creators ORDER BY full_name`)).rows.map((r) => toFellow(r as Record<string, unknown>));
}
async function fellow(id: number, ex: Exec = db) {
  const r = (await ex.execute(sql`SELECT ${FELLOW_COLS} FROM ugc_creators WHERE id = ${id}`)).rows[0];
  return r ? toFellow(r as Record<string, unknown>) : null;
}
async function postsOf(id: number | null, ex: Exec = db) {
  const q = id == null ? sql`SELECT ${POST_COLS} FROM ugc_creator_posts ORDER BY due_date, id` : sql`SELECT ${POST_COLS} FROM ugc_creator_posts WHERE creator_id = ${id} ORDER BY due_date, id`;
  return (await ex.execute(q)).rows.map((r) => toPost(r as Record<string, unknown>));
}
async function draftsOf(id: number | null, ex: Exec = db) {
  const q = id == null ? sql`SELECT ${DRAFT_COLS} FROM ugc_creator_drafts ORDER BY due_date, id` : sql`SELECT ${DRAFT_COLS} FROM ugc_creator_drafts WHERE creator_id = ${id} ORDER BY due_date, id`;
  return (await ex.execute(q)).rows.map((r) => toDraft(r as Record<string, unknown>));
}
async function earlierPostsOf(id: number, ex: Exec = db) {
  return (await ex.execute(sql`
    SELECT id, title, body, to_char(posted_on, 'YYYY-MM-DD') AS posted_on, url, impressions FROM ugc_creator_earlier_posts WHERE creator_id = ${id} ORDER BY posted_on NULLS LAST, id
  `)).rows as { id: number; title: string | null; body: string; posted_on: string | null; url: string | null; impressions: number | null }[];
}
async function storiesOf(id: number | null, ex: Exec = db) {
  const q = id == null
    ? sql`SELECT id, creator_id, prompt, text, spoken, created_at, coach, reply_to FROM ugc_creator_stories ORDER BY created_at DESC`
    : sql`SELECT id, creator_id, prompt, text, spoken, created_at, coach, reply_to FROM ugc_creator_stories WHERE creator_id = ${id} ORDER BY created_at DESC`;
  return (await ex.execute(q)).rows.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: Number(x.id), creatorId: Number(x.creator_id), prompt: (x.prompt as string) ?? null, text: String(x.text), spoken: !!x.spoken, createdAt: iso(x.created_at) ?? "",
      readBack: readBackOf(x.coach), replyTo: x.reply_to == null ? null : Number(x.reply_to),
    };
  });
}
/** The page's read-back of a talk (written by studojo.com), as Claude needs it: what can become a post and what to leave out. */
function readBackOf(v: unknown): { covers: number[]; usable: string[]; leaveOut: string[] } | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (!Array.isArray(c.useful)) return null; // still being read, or not read
  const lines = (a: unknown) => (Array.isArray(a) ? a.filter((t): t is string => typeof t === "string") : []);
  return { covers: Array.isArray(c.parts) ? c.parts.map(Number).filter(Number.isInteger) : [], usable: lines(c.useful), leaveOut: lines(c.skip) };
}
async function latestConnections(ex: Exec = db) {
  const rows = (await ex.execute(sql`
    SELECT DISTINCT ON (creator_id) creator_id, connections FROM ugc_creator_connections ORDER BY creator_id, recorded_at DESC
  `)).rows as { creator_id: number; connections: number }[];
  return new Map(rows.map((r) => [Number(r.creator_id), Number(r.connections)]));
}

// ---------------------------------------------------------------------------
// Rules for every post Claude writes or the team edits
// ---------------------------------------------------------------------------

/** Three-word runs, for catching a post that repeats one already written. */
export function runs(text: string): Set<string> {
  const w = String(text).toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size < 8 || b.size < 8) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}

export interface CheckContext {
  today: string;
  fellow: { id: number; name: string };
  /** This fellow's posts and drafts (for one-a-day) and earlier posts (for repeats). */
  own: { id: string; due?: string; title: string; body: string }[];
  /** Other fellows' posts and drafts from the last 60 days. */
  others: { owner: string; title: string; body: string }[];
  /** Every other fellow's full name. */
  otherNames: string[];
}
export interface CheckOptions { skipId?: string; extra?: { title: string; body: string; due: string }[]; allowPast?: boolean; strict?: boolean }

/**
 * The problem with one post, in plain words, or null. `strict` (Claude's
 * writing) adds the repeat and other-fellow checks; the team's own edits skip
 * them. Ids in `own` are "p<id>" for posts, "d<id>" for drafts, "e<id>" for
 * earlier posts.
 */
export function problemWith(x: { title: string; body: string; kind: string; due: string; photoIdea?: string }, ctx: CheckContext, o: CheckOptions = {}): string | null {
  const name = x.title ? `"${x.title}"` : "A post";
  if (x.title.length < 2) return "Every post needs a short title.";
  if (x.body.length < (o.strict ? 80 : 20)) return `${name}: the post text is missing or too short.`;
  if (x.body.length > POST_MAX) return `${name} is ${x.body.length} characters. LinkedIn allows ${POST_MAX}.`;
  if (x.kind !== "studojo" && x.kind !== "personal") return `${name}: the type must be "studojo" or "personal".`;
  // The partnership line on Studojo posts is optional (the team's decision, 4 Nov 2026).
  if (!isDay(x.due)) return `${name}: the due date must be a date like 2026-11-03.`;
  if (!o.allowPast && x.due < ctx.today) return `${name}: ${x.due} has already passed.`;
  const extra = o.extra ?? [];
  const taken = ctx.own.some((p) => p.id !== o.skipId && p.due === x.due) || extra.some((p) => p.due === x.due);
  if (taken) return `${name}: ${ctx.fellow.name} already has a post due on ${x.due}. One post a day.`;
  if (o.strict) {
    // No post goes up without a photo (the founder, 3 Nov 2026), so Claude says which of the fellow's own photos fits.
    if ((x.photoIdea ?? "").length < PHOTO_IDEA_MIN) {
      return `${name}: add "photoIdea", one sentence on which of their own photos to post with it (for example "a photo of you and your team at the hackathon"). Fellows can't post without a photo.`;
    }
    const mine = runs(x.body);
    for (const p of extra) if (overlap(mine, runs(p.body)) >= SAME_POST) return `${name} repeats too much of another post in this batch ("${p.title}"). Write it fresh.`;
    for (const p of ctx.own) if (p.id !== o.skipId && overlap(mine, runs(p.body)) >= SAME_POST) return `${name} repeats too much of their post "${p.title || "from before the dashboard"}". Write it fresh.`;
    for (const p of ctx.others) if (overlap(mine, runs(p.body)) >= SAME_POST) return `${name} repeats too much of ${p.owner}'s post "${p.title}". Write it fresh.`;
    // A fellow's details must never end up in another fellow's post.
    const text = `${x.title}\n${x.body}`;
    for (const n of ctx.otherNames) {
      if (!/\s/.test(n.trim())) continue;
      const re = new RegExp(`\\b${n.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(text)) return `${name} mentions ${n.trim()}, another fellow. Each post may only use its own fellow's material.`;
    }
  }
  return null;
}

async function checkContext(fellowId: number, ex: Exec): Promise<CheckContext | null> {
  const f = await fellow(fellowId, ex);
  if (!f) return null;
  const since = istDate(Date.now() - REPEAT_WINDOW_DAYS * DAY);
  const own = [
    ...(await postsOf(fellowId, ex)).map((p) => ({ id: `p${p.id}`, due: p.due, title: p.title, body: p.body })),
    ...(await draftsOf(fellowId, ex)).map((d) => ({ id: `d${d.id}`, due: d.due, title: d.title, body: d.body })),
    ...(await earlierPostsOf(fellowId, ex)).map((e) => ({ id: `e${e.id}`, title: e.title ?? "", body: e.body })),
  ];
  const others = (await ex.execute(sql`
    SELECT c.full_name AS owner, p.title, p.body FROM ugc_creator_posts p JOIN ugc_creators c ON c.id = p.creator_id
      WHERE p.creator_id <> ${fellowId} AND p.created_at >= ${since}::date
    UNION ALL
    SELECT c.full_name, d.title, d.body FROM ugc_creator_drafts d JOIN ugc_creators c ON c.id = d.creator_id
      WHERE d.creator_id <> ${fellowId} AND d.created_at >= ${since}::date
  `)).rows as { owner: string; title: string; body: string }[];
  const otherNames = ((await ex.execute(sql`SELECT full_name FROM ugc_creators WHERE id <> ${fellowId}`)).rows as { full_name: string }[]).map((r) => r.full_name);
  return { today: istDate(), fellow: { id: f.id, name: f.name }, own, others, otherNames };
}

function readInput(x: PostInput) {
  return { title: str(x.title, 140), body: str(x.body, POST_MAX + 500), kind: String(x.kind ?? ""), due: String(x.due ?? ""), angle: str(x.angle, 800), photoIdea: str(x.photoIdea, PHOTO_IDEA_MAX) };
}
class Refused extends Error { constructor(msg: string, public status = 400) { super(msg); } }
export const isRefused = (e: unknown): e is Refused => e instanceof Refused;

/** Runs fn in a transaction holding this fellow's row, so two batches can't book the same day. */
async function forFellow<T>(fellowId: number, fn: (tx: Exec) => Promise<T>): Promise<T> {
  await ensureCreatorTables();
  return db.transaction(async (tx) => {
    const lock = (await tx.execute(sql`SELECT id FROM ugc_creators WHERE id = ${fellowId} FOR UPDATE`)).rows;
    if (!lock.length) throw new Refused("No fellow with that id.", 404);
    return fn(tx as unknown as Exec);
  });
}
async function draftOwner(draftId: number) {
  const r = (await db.execute(sql`SELECT creator_id FROM ugc_creator_drafts WHERE id = ${draftId}`)).rows[0] as { creator_id: number } | undefined;
  return r ? Number(r.creator_id) : null;
}
async function postOwner(postId: number) {
  const r = (await db.execute(sql`SELECT creator_id FROM ugc_creator_posts WHERE id = ${postId}`)).rows[0] as { creator_id: number } | undefined;
  return r ? Number(r.creator_id) : null;
}
async function loadDraft(draftId: number, ex: Exec) {
  const r = (await ex.execute(sql`SELECT ${DRAFT_COLS} FROM ugc_creator_drafts WHERE id = ${draftId}`)).rows[0];
  return r ? toDraft(r as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Claude's side: drafts in, revisions in. Never approval.
// ---------------------------------------------------------------------------

/** Saves 1 to 14 drafts for one fellow, all or nothing. */
export async function addDrafts(fellowId: number, posts: PostInput[], batch: unknown) {
  if (!Array.isArray(posts) || !posts.length || posts.length > 14) throw new Refused("Send between 1 and 14 posts as posts: [...].");
  return forFellow(fellowId, async (tx) => {
    const f = await fellow(fellowId, tx);
    if (!f || f.status === "removed") throw new Refused("No fellow with that id.", 404);
    if (f.status === "paused") throw new Refused(`${f.name} is paused. Check with the team before writing for them.`, 409);
    const ctx = (await checkContext(fellowId, tx))!;
    const made: ReturnType<typeof readInput>[] = [];
    for (const raw of posts) {
      const x = readInput(raw ?? {});
      const err = problemWith(x, ctx, { extra: made, strict: true });
      if (err) throw new Refused(err);
      made.push(x);
    }
    const t = nowIso();
    const ids: number[] = [];
    for (const x of made) {
      const versions: Version[] = [{ t, by: "claude", title: x.title, body: x.body, note: "First draft" }];
      const r = (await tx.execute(sql`
        INSERT INTO ugc_creator_drafts (creator_id, title, body, kind, due_date, angle, photo_idea, status, batch, feedback, versions)
        VALUES (${fellowId}, ${x.title}, ${x.body}, ${x.kind}, ${x.due}::date, ${x.angle}, ${x.photoIdea}, 'review', ${str(batch, 60) || null}, '[]'::jsonb, ${JSON.stringify(versions)}::jsonb)
        RETURNING id
      `)).rows[0] as { id: number };
      ids.push(Number(r.id));
    }
    return ids;
  });
}

/** Claude's revision of a draft the team sent back (or one still waiting). */
export async function reviseDraft(draftId: number, input: PostInput & { note?: unknown }) {
  const owner = await draftOwner(draftId);
  if (owner == null) throw new Refused("That draft isn't waiting for review any more: it was approved or removed.", 404);
  return forFellow(owner, async (tx) => {
    const d = await loadDraft(draftId, tx);
    if (!d) throw new Refused("That draft isn't waiting for review any more: it was approved or removed.", 404);
    const x = readInput({ title: input.title ?? d.title, body: input.body ?? d.body, kind: input.kind ?? d.kind, due: input.due ?? d.due, angle: input.angle ?? d.angle, photoIdea: input.photoIdea ?? d.photoIdea });
    const ctx = (await checkContext(owner, tx))!;
    const err = problemWith(x, ctx, { skipId: `d${d.id}`, allowPast: x.due === d.due, strict: true });
    if (err) throw new Refused(err);
    const note = str(input.note, 800) || "Revised";
    const versions = [...d.versions];
    if (x.title !== d.title || x.body !== d.body) versions.push({ t: nowIso(), by: "claude", title: x.title, body: x.body, note });
    const feedback = d.feedback.map((f) => (f.resolvedAt ? f : { ...f, resolvedAt: nowIso(), reply: note }));
    await tx.execute(sql`
      UPDATE ugc_creator_drafts SET title = ${x.title}, body = ${x.body}, kind = ${x.kind}, due_date = ${x.due}::date, angle = ${x.angle}, photo_idea = ${x.photoIdea},
        status = 'review', feedback = ${JSON.stringify(feedback)}::jsonb, versions = ${JSON.stringify(versions)}::jsonb, updated_at = NOW()
      WHERE id = ${draftId}
    `);
    return (await loadDraft(draftId, tx))!;
  });
}

// ---------------------------------------------------------------------------
// The team's side: save, send back, approve, remove; block and release
// ---------------------------------------------------------------------------

async function teamEdit(tx: Exec, d: Draft, input: PostInput, by: string, opts: { forApproval?: boolean } = {}) {
  const x = readInput({ title: input.title ?? d.title, body: input.body ?? d.body, kind: input.kind ?? d.kind, due: input.due ?? d.due, angle: d.angle, photoIdea: input.photoIdea ?? d.photoIdea });
  if (opts.forApproval && x.due < istDate()) throw new Refused(`Its due date (${x.due}) has passed. Pick a new date, then approve.`);
  const ctx = (await checkContext(d.creatorId, tx))!;
  const err = problemWith(x, ctx, { skipId: `d${d.id}`, allowPast: x.due === d.due && !opts.forApproval });
  if (err) throw new Refused(err);
  const versions = [...d.versions];
  if (x.title !== d.title || x.body !== d.body) versions.push({ t: nowIso(), by: "team", title: x.title, body: x.body, note: `Edited by ${by}` });
  return { ...d, title: x.title, body: x.body, kind: x.kind as Kind, due: x.due, photoIdea: x.photoIdea, versions };
}

export async function saveDraft(draftId: number, input: PostInput, by: string) {
  const owner = await draftOwner(draftId);
  if (owner == null) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const d = await loadDraft(draftId, tx);
    if (!d) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
    const n = await teamEdit(tx, d, input, by);
    await tx.execute(sql`
      UPDATE ugc_creator_drafts SET title = ${n.title}, body = ${n.body}, kind = ${n.kind}, due_date = ${n.due}::date, photo_idea = ${n.photoIdea},
        versions = ${JSON.stringify(n.versions)}::jsonb, updated_at = NOW() WHERE id = ${draftId}
    `);
  });
}

export async function sendBack(draftId: number, input: PostInput & { feedback?: unknown }, by: string) {
  const text = str(input.feedback, 2000);
  if (text.length < 3) throw new Refused("Say what Claude should change.");
  const owner = await draftOwner(draftId);
  if (owner == null) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const d = await loadDraft(draftId, tx);
    if (!d) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
    const n = await teamEdit(tx, d, input, by);
    const feedback = [...d.feedback, { id: newId(), t: nowIso(), text, by }];
    await tx.execute(sql`
      UPDATE ugc_creator_drafts SET title = ${n.title}, body = ${n.body}, kind = ${n.kind}, due_date = ${n.due}::date, photo_idea = ${n.photoIdea}, status = 'changes',
        versions = ${JSON.stringify(n.versions)}::jsonb, feedback = ${JSON.stringify(feedback)}::jsonb, updated_at = NOW() WHERE id = ${draftId}
    `);
  });
}

async function approveIn(tx: Exec, d: Draft, by: string) {
  const claude = [...d.versions].reverse().find((v) => v.by === "claude") ?? { title: d.title, body: d.body };
  const review: Review = {
    draftedAt: d.createdAt, approvedAt: nowIso(), approvedBy: by, batch: d.batch, angle: d.angle,
    claudeTitle: claude.title, claudeBody: claude.body, editedByTeam: claude.title !== d.title || claude.body !== d.body,
    feedback: d.feedback, versions: d.versions,
  };
  await tx.execute(sql`
    INSERT INTO ugc_creator_posts (creator_id, title, body, kind, due_date, status, created_by, review, photo_idea)
    VALUES (${d.creatorId}, ${d.title}, ${d.body}, ${d.kind}, ${d.due}::date, 'ready', ${by}, ${JSON.stringify(review)}::jsonb, ${d.photoIdea || null})
  `);
  await tx.execute(sql`DELETE FROM ugc_creator_drafts WHERE id = ${d.id}`);
}

export async function approveDraft(draftId: number, input: PostInput, by: string) {
  const owner = await draftOwner(draftId);
  if (owner == null) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const d = await loadDraft(draftId, tx);
    if (!d) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
    const n = await teamEdit(tx, d, input, by, { forApproval: true });
    await approveIn(tx, n, by);
  });
}

/** Approves every draft of this fellow that's waiting for review and isn't overdue. */
export async function approveAll(fellowId: number, by: string) {
  return forFellow(fellowId, async (tx) => {
    const today = istDate();
    const ready = (await draftsOf(fellowId, tx)).filter((d) => d.status === "review" && d.due >= today);
    const f = await fellow(fellowId, tx);
    for (const d of ready) await approveIn(tx, d, by);
    return { approved: ready.length, name: f?.first ?? "" };
  });
}

export async function removeDraft(draftId: number) {
  await db.execute(sql`DELETE FROM ugc_creator_drafts WHERE id = ${draftId}`);
}

async function loadPost(postId: number, ex: Exec) {
  return (await ex.execute(sql`SELECT ${POST_COLS} FROM ugc_creator_posts WHERE id = ${postId}`)).rows.map((r) => toPost(r as Record<string, unknown>))[0] ?? null;
}

/**
 * Takes back an approved post that isn't up yet. It stays on the fellow's page
 * as a warning ("on hold, don't post it yet") until the team fixes it and
 * releases it. Drafts never reach a fellow in the first place.
 */
export async function blockPost(postId: number, reason: unknown, by: string) {
  const why = str(reason, 500);
  if (why.length < 3) throw new Refused("Say what needs fixing, so whoever picks it up knows.");
  const owner = await postOwner(postId);
  if (owner == null) throw new Refused("That post is gone. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const p = await loadPost(postId, tx);
    if (!p) throw new Refused("That post is gone. Refresh the page.", 404);
    if (p.status === "posted") throw new Refused("It's already up on LinkedIn, so it can't be blocked.");
    if (p.status === "blocked") throw new Refused("It's already blocked.");
    const review = { ...(p.review ?? {}), blocked: { at: nowIso(), by, reason: why } };
    await tx.execute(sql`UPDATE ugc_creator_posts SET status = 'blocked', review = ${JSON.stringify(review)}::jsonb, updated_at = NOW() WHERE id = ${postId} AND status = 'ready'`);
  });
}

/** Sends a blocked post back to the fellow, once the team has fixed it. */
export async function releasePost(postId: number, by: string) {
  const owner = await postOwner(postId);
  if (owner == null) throw new Refused("That post is gone. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const p = await loadPost(postId, tx);
    if (!p) throw new Refused("That post is gone. Refresh the page.", 404);
    if (p.status !== "blocked") throw new Refused("It isn't blocked.");
    if (p.due < istDate()) throw new Refused(`Its due date (${p.due}) has passed. Pick a new date and save, then release it.`);
    const r = p.review ?? ({} as Partial<Review>);
    const review = { ...r, blocked: null, blocks: [...(r.blocks ?? []), ...(r.blocked ? [{ ...r.blocked, releasedAt: nowIso(), releasedBy: by }] : [])] };
    await tx.execute(sql`UPDATE ugc_creator_posts SET status = 'ready', review = ${JSON.stringify(review)}::jsonb, updated_at = NOW() WHERE id = ${postId} AND status = 'blocked'`);
  });
}

/** The team marks a post as up (with its link) or records its numbers, when a fellow tells them directly. */
export async function recordPost(postId: number, b: { posted?: unknown; url?: unknown; impressions?: unknown; reactions?: unknown; comments?: unknown }) {
  const n = (v: unknown) => (v === "" || v == null ? null : Math.max(0, Math.round(Number(v)) || 0));
  const url = str(b.url, 500);
  if (url && !/^https?:\/\/(www\.)?linkedin\.com\/(posts\/|feed\/update\/)/i.test(url)) throw new Refused("That isn't a LinkedIn post link (linkedin.com/posts/… or linkedin.com/feed/update/…).");
  const cur = (await db.execute(sql`SELECT status FROM ugc_creator_posts WHERE id = ${postId}`)).rows[0] as { status: string } | undefined;
  if (cur?.status === "blocked") throw new Refused("This post is blocked. Release it first.");
  if (b.posted === false) {
    await db.execute(sql`UPDATE ugc_creator_posts SET status = 'ready', posted_at = NULL, updated_at = NOW() WHERE id = ${postId}`);
    return;
  }
  const hasNumbers = b.impressions != null && b.impressions !== "";
  const r = await db.execute(sql`
    UPDATE ugc_creator_posts SET status = 'posted', posted_at = COALESCE(posted_at, NOW()), post_url = COALESCE(${url || null}::text, post_url),
      impressions = CASE WHEN ${hasNumbers}::boolean THEN ${n(b.impressions)}::int ELSE impressions END,
      reactions = CASE WHEN ${hasNumbers}::boolean THEN ${n(b.reactions)}::int ELSE reactions END,
      comments = CASE WHEN ${hasNumbers}::boolean THEN ${n(b.comments)}::int ELSE comments END,
      metrics_at = CASE WHEN ${hasNumbers}::boolean THEN NOW() ELSE metrics_at END, updated_at = NOW()
    WHERE id = ${postId} RETURNING id
  `);
  if (!r.rows.length) throw new Refused("That post is gone. Refresh the page.", 404);
}

// Photos. No post goes up without one (the founder, 3 Nov 2026): the fellow adds
// their own on their page, and when they have none their page offers stock images
// (the team can still add one here). The fellow's page locks Copy and Post on
// LinkedIn until a post has a photo.

const NOT_FOR_POSTED = "It's already up on LinkedIn, so its photos stay as they are.";

/** The team changes what photo fits an approved post. */
export async function setPhotoIdea(postId: number, text: unknown) {
  const idea = str(text, PHOTO_IDEA_MAX);
  const r = await db.execute(sql`UPDATE ugc_creator_posts SET photo_idea = ${idea || null}, updated_at = NOW() WHERE id = ${postId} AND status <> 'posted' RETURNING id`);
  if (!r.rows.length) throw new Refused("That post is gone or already up. Refresh the page.", 404);
}

/** The team adds a photo (a JPEG the page has already re-encoded) to a post that isn't up yet. */
export async function addTeamPhoto(postId: number, jpeg: Uint8Array) {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) throw new Refused("That file isn't a picture the page can use.", 415);
  const owner = await postOwner(postId);
  if (owner == null) throw new Refused("That post is gone. Refresh the page.", 404);
  const check = (p: Post | null) => {
    if (!p) throw new Refused("That post is gone. Refresh the page.", 404);
    if (p.status === "posted") throw new Refused(NOT_FOR_POSTED);
    if (p.photos.length >= PHOTOS_PER_POST) throw new Refused(`This post has ${PHOTOS_PER_POST} photos, the most it can have. Remove one first.`);
  };
  check(await loadPost(postId, db)); // refuse early, before anything is stored
  const ref = newPhotoRef(owner, postId);
  await putPhoto(ref, jpeg);
  try {
    await forFellow(owner, async (tx) => {
      const p = await loadPost(postId, tx);
      check(p);
      const review = { ...(p!.review ?? {}), teamPhotos: [...(p!.review?.teamPhotos ?? []), ref] };
      await tx.execute(sql`
        UPDATE ugc_creator_posts SET photo_url = ${JSON.stringify([...p!.photos, ref])}, photo_help_at = NULL,
          review = ${JSON.stringify(review)}::jsonb, updated_at = NOW()
        WHERE id = ${postId}
      `);
    });
  } catch (e) {
    await deletePhoto(ref).catch(() => {});
    throw e;
  }
}

/** The team removes a photo (the fellow's or the team's) from a post that isn't up yet. */
export async function removePhoto(postId: number, ref: unknown) {
  if (!isPhotoRef(ref)) throw new Refused("That photo isn't on this post.", 404);
  const owner = await postOwner(postId);
  if (owner == null) throw new Refused("That post is gone. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const p = await loadPost(postId, tx);
    if (!p) throw new Refused("That post is gone. Refresh the page.", 404);
    if (p.status === "posted") throw new Refused(NOT_FOR_POSTED);
    if (!p.photos.includes(ref)) throw new Refused("That photo isn't on this post.", 404);
    const rest = p.photos.filter((x) => x !== ref);
    await tx.execute(sql`UPDATE ugc_creator_posts SET photo_url = ${rest.length ? JSON.stringify(rest) : null}, updated_at = NOW() WHERE id = ${postId}`);
  });
  await deletePhoto(ref);
}

export async function setNotes(fellowId: number, b: { teamNotes?: unknown; learnings?: unknown }) {
  if (b.teamNotes != null) await db.execute(sql`UPDATE ugc_creators SET team_notes = ${str(b.teamNotes, 20000)} WHERE id = ${fellowId}`);
  if (b.learnings != null) await db.execute(sql`UPDATE ugc_creators SET learnings = ${str(b.learnings, 6000)} WHERE id = ${fellowId}`);
}
export async function markNudged(fellowId: number) {
  await db.execute(sql`UPDATE ugc_creators SET nudged_at = NOW() WHERE id = ${fellowId}`);
}
export async function setPlaybook(text: unknown, by: string) {
  await db.execute(sql`UPDATE ugc_playbook SET text = ${str(text, 12000)}, updated_at = NOW(), updated_by = ${by} WHERE id = 1`);
}
async function playbook(ex: Exec = db) {
  const r = (await ex.execute(sql`SELECT text, updated_at, updated_by FROM ugc_playbook WHERE id = 1`)).rows[0] as Record<string, unknown> | undefined;
  return { text: String(r?.text ?? ""), updatedAt: iso(r?.updated_at), by: (r?.updated_by as string) ?? null };
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const imp = (p: Post) => p.impressions ?? 0;
const isPosted = (p: Post) => p.status === "posted";
const measured = (p: Post) => isPosted(p) && p.impressions != null;
function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * How a post did against a fair yardstick: the fellow's own usual (median of
 * their other posts with numbers, once there are 3), or before that the
 * programme's usual (median of every other post with numbers, once there are 5).
 */
export function verdictOf(p: Post, own: Post[], all: Post[]) {
  if (!measured(p)) return null;
  const mine = own.filter((q) => q.id !== p.id && measured(q)).map(imp);
  const rest = all.filter((q) => q.id !== p.id && measured(q)).map(imp);
  const [base, basis] = mine.length >= 3 ? [median(mine), "their usual"] : rest.length >= 5 ? [median(rest), "the programme's usual"] : [0, null];
  if (!base) return { level: null, ratio: null, base: null, basis: null };
  const ratio = imp(p) / base;
  const level = ratio >= 1.25 ? "good" : ratio >= 0.75 ? "okay" : ratio >= 0.4 ? "bad" : "ugly";
  return { level, ratio: Math.round(ratio * 100) / 100, base, basis };
}

/** A fellow's week-by-week standing, from their posts (same rules as the student page). */
export function standing(posts: Post[], today: string, postsPerWeek: number) {
  const thisWeek = weekOf(today);
  const byWeek = new Map<string, Post[]>();
  for (const p of posts) { const w = weekOf(p.due); if (!byWeek.has(w)) byWeek.set(w, []); byWeek.get(w)!.push(p); }
  // A blocked post is neither posted nor due (the fellow can't post it): a week is complete once its other posts
  // are up, and a week where every post is blocked neither counts toward the run nor breaks it (same as creatorStats).
  const live = (ps: Post[] | undefined) => (ps ?? []).filter((p) => p.status !== "blocked");
  const allBlocked = (w: string) => { const ps = byWeek.get(w); return !!(ps && ps.length && !live(ps).length); };
  const complete = (w: string) => { const ps = live(byWeek.get(w)); return ps.length > 0 && ps.every(isPosted); };
  let run = complete(thisWeek) ? 1 : 0;
  for (let w = addDays(thisWeek, -7); byWeek.has(w) && (complete(w) || allBlocked(w)); w = addDays(w, -7)) if (complete(w)) run++;
  const completedWeeks = [...byWeek.keys()].filter(complete).length;
  const due = live(byWeek.get(thisWeek));
  const lastWeek = live(byWeek.get(addDays(thisWeek, -7)));
  const posted = posts.filter(isPosted);
  const weekday = Math.round((Date.parse(today) - Date.parse(thisWeek)) / DAY);
  const activity = posts.flatMap((p) => [p.copiedAt, p.postedAt, p.metricsAt]).filter((t): t is string => !!t).sort();
  const next = MILESTONES.find((m) => completedWeeks < m.weeks) ?? null;
  return {
    thisWeek: { due: due.length, posted: due.filter(isPosted).length, missed: due.filter((p) => !isPosted(p) && p.due < today).length },
    lastWeek: { due: lastWeek.length, posted: lastWeek.filter(isPosted).length },
    run, completedWeeks, postsPublished: posted.length, impressions: posted.reduce((s, p) => s + imp(p), 0),
    awaitingNumbers: posted.filter((p) => p.impressions == null && p.postedAt && Date.parse(p.postedAt) < Date.now() - 7 * DAY).length,
    atRisk: due.length > 0 && due.filter(isPosted).length === 0 && due.some((p) => p.due < today) && weekday >= 1,
    lastActivity: activity.length ? activity[activity.length - 1] : null,
    nextMilestone: next ? { id: next.id, name: next.name, weeksToGo: next.weeks - completedWeeks } : null,
    milestonesReached: MILESTONES.filter((m) => completedWeeks >= m.weeks).map((m) => m.id),
    postsPerWeek,
  };
}

/** Everything the editorial calendar page shows. */
export async function calendarView() {
  await ensureCreatorTables();
  const today = istDate();
  const [rules, fs, posts, drafts, stories, conns, pb] = await Promise.all([
    programmeRules(), fellows(), postsOf(null), draftsOf(null), storiesOf(null), latestConnections(), playbook(),
  ]);
  const earlier = new Map(((await db.execute(sql`SELECT creator_id, COUNT(*)::int AS n FROM ugc_creator_earlier_posts GROUP BY creator_id`)).rows as { creator_id: number; n: number }[]).map((r) => [Number(r.creator_id), Number(r.n)]));
  const postsBy = new Map<number, Post[]>(), draftsBy = new Map<number, Draft[]>(), storiesBy = new Map<number, number>();
  for (const p of posts) { if (!postsBy.has(p.creatorId)) postsBy.set(p.creatorId, []); postsBy.get(p.creatorId)!.push(p); }
  for (const d of drafts) { if (!draftsBy.has(d.creatorId)) draftsBy.set(d.creatorId, []); draftsBy.get(d.creatorId)!.push(d); }
  for (const s of stories) storiesBy.set(s.creatorId, (storiesBy.get(s.creatorId) ?? 0) + 1);
  const all = posts;
  const live = fs.filter((f) => f.status !== "removed");
  const studojoImpressions = posts.filter((p) => isPosted(p) && p.kind === "studojo").reduce((s, p) => s + imp(p), 0);

  // Impressions credited to the week each post went up, for the last six weeks (India time).
  const thisWeek = weekOf(today);
  const weekly = Array.from({ length: 6 }, (_, i) => addDays(thisWeek, -7 * (5 - i))).map((w) => ({
    week: w, impressions: posts.filter((p) => isPosted(p) && p.postedAt && weekOf(istDate(p.postedAt)) === w).reduce((s, p) => s + imp(p), 0), partial: w === thisWeek,
  }));
  // Week 1 is the week the first approved posts were due (the founder, 5 Nov 2026: the fellowship's clock
  // starts when posts start going out), or the first join while there are none yet.
  const firstDue = posts.map((p) => p.due).filter(Boolean).sort()[0];
  const firstJoin = live.map((f) => f.joined).filter(Boolean).sort()[0] ?? today;

  return {
    today, thisWeek, rules, playbook: pb, programmeStart: weekOf(firstDue ?? firstJoin),
    totals: {
      impressions: posts.filter(isPosted).reduce((s, p) => s + imp(p), 0), studojoImpressions,
      measuredPosts: posts.filter(measured).length,
      avgPerPost: (() => { const m = posts.filter(measured); return m.length ? Math.round(m.reduce((s, p) => s + imp(p), 0) / m.length) : 0; })(),
      storiesCollected: stories.length,
      draftsWaiting: drafts.filter((d) => d.status === "review").length,
      draftsSentBack: drafts.filter((d) => d.status === "changes").length,
    },
    weekly,
    stories: stories.filter((s) => Date.parse(s.createdAt) > Date.now() - 14 * DAY).slice(0, 40),
    fellows: fs.map((f) => {
      const ps = postsBy.get(f.id) ?? [];
      return {
        ...f,
        connections: conns.get(f.id) ?? null,
        stories: storiesBy.get(f.id) ?? 0,
        earlierPosts: earlier.get(f.id) ?? 0,
        standing: standing(ps, today, rules.postsPerWeek),
        posts: ps.map((p) => ({ ...p, verdict: verdictOf(p, ps, all) })),
        drafts: draftsBy.get(f.id) ?? [],
      };
    }),
  };
}

/**
 * The programme dashboard (/fellowship-program): the founder's plan against what
 * happened, applicants to posting fellows, the post pipeline, week by week, and
 * one row per fellow. Built on calendarView so both pages count the same way.
 */
export async function programmeDashboard() {
  const cal = await calendarView();
  const { today, thisWeek, rules } = cal;
  let apps: Record<string, number> = {};
  try {
    apps = Object.fromEntries(((await db.execute(sql`SELECT status, COUNT(*)::int AS n FROM ugc_applications GROUP BY status`)).rows as { status: string; n: number }[]).map((r) => [r.status, Number(r.n)]));
  } catch { /* no applications table yet */ }
  const live = cal.fellows.filter((f) => f.status !== "removed");
  const posts = live.flatMap((f) => f.posts);
  const postedOn = (p: Post) => (p.postedAt ? istDate(p.postedAt) : null);
  const postingBy = (end: string) => new Set(posts.filter((p) => isPosted(p) && postedOn(p) && postedOn(p)! > addDays(end, -7) && postedOn(p)! <= end).map((p) => p.creatorId)).size;
  const impressionsBy = (end: string) => posts.filter((p) => isPosted(p) && postedOn(p) && postedOn(p)! <= end).reduce((s, p) => s + imp(p), 0);

  // Each checkpoint of the plan, with what had happened by that date (nothing yet for dates ahead).
  const checkpoints = rules.plan.map((c) => ({
    ...c,
    actual: c.by <= today ? { creators: live.filter((f) => f.joined && f.joined <= c.by).length, posting: postingBy(c.by), impressions: impressionsBy(c.by) } : null,
  }));
  const weeks: string[] = [];
  for (let w = cal.programmeStart; w <= thisWeek; w = addDays(w, 7)) weeks.push(w);
  const weekly = weeks.slice(-8).map((w) => {
    const due = posts.filter((p) => weekOf(p.due) === w && p.status !== "blocked");
    const up = posts.filter((p) => isPosted(p) && postedOn(p) && weekOf(postedOn(p)!) === w);
    return {
      week: w, partial: w === thisWeek, due: due.length, postedOfDue: due.filter(isPosted).length,
      posted: up.length, studojo: up.filter((p) => p.kind === "studojo").length,
      impressions: up.reduce((s, p) => s + imp(p), 0), posting: new Set(up.map((p) => p.creatorId)).size,
      joined: live.filter((f) => f.joined && weekOf(f.joined) === w).length,
    };
  });
  const kinds = (["personal", "studojo"] as const).map((k) => {
    const up = posts.filter((p) => isPosted(p) && p.kind === k), m = up.filter(measured);
    return { kind: k, posted: up.length, impressions: up.reduce((s, p) => s + imp(p), 0), avg: m.length ? Math.round(m.reduce((s, p) => s + imp(p), 0) / m.length) : 0 };
  });
  const drafts = live.flatMap((f) => f.drafts);
  // Posts this week against the target (every active fellow's weekly posts), and day by day.
  const weekPosts = posts.filter((p) => weekOf(p.due) === thisWeek && p.status !== "blocked");
  const daily = Array.from({ length: 7 }, (_, i) => addDays(thisWeek, i)).map((d) => ({
    day: d,
    due: posts.filter((p) => p.due === d && p.status !== "blocked").length,
    postedOfDue: posts.filter((p) => p.due === d && isPosted(p)).length,
    posted: posts.filter((p) => isPosted(p) && postedOn(p) === d).length,
  }));

  return {
    today, thisWeek, programmeStart: cal.programmeStart, rules: { goal: rules.goal, plan: rules.plan, postsPerWeek: rules.postsPerWeek, studojoPerWeek: studojoPerWeek(rules) },
    now: { creators: live.length, posting: postingBy(today), impressions: cal.totals.impressions, avgPerPost: cal.totals.avgPerPost },
    checkpoints,
    postsWeek: {
      target: live.filter((f) => f.status === "active").length * rules.postsPerWeek,
      scheduled: weekPosts.length,
      posted: weekPosts.filter(isPosted).length,
      dueByToday: weekPosts.filter((p) => p.due <= today).length,
      missed: weekPosts.filter((p) => !isPosted(p) && p.due < today).length,
      postedToday: posts.filter((p) => isPosted(p) && postedOn(p) === today).length,
      total: posts.filter(isPosted).length,
    },
    daily,
    funnel: {
      applied: Object.values(apps).reduce((s, n) => s + n, 0),
      // Selected and shortlisted mean the same thing here: everyone selected is made a fellow.
      fellows: live.length,
      postedOnce: new Set(posts.filter(isPosted).map((p) => p.creatorId)).size,
      postingThisWeek: new Set(posts.filter((p) => isPosted(p) && postedOn(p) && weekOf(postedOn(p)!) === thisWeek).map((p) => p.creatorId)).size,
    },
    pipeline: {
      drafting: drafts.filter((d) => d.status === "review").length,
      sentBack: drafts.filter((d) => d.status === "changes").length,
      scheduled: posts.filter((p) => p.status === "ready" && p.due >= today).length,
      overdue: posts.filter((p) => p.status === "ready" && p.due < today).length,
      blocked: posts.filter((p) => p.status === "blocked").length,
      posted: posts.filter(isPosted).length,
      awaitingNumbers: posts.filter((p) => isPosted(p) && p.impressions == null).length,
      withAnalytics: posts.filter((p) => isPosted(p) && (!!p.analytics || proofRefs(p.screenshot).length > 0)).length,
      // Approved posts the fellow can't put up yet because they have no photo, and those where they asked the team for one.
      needPhoto: posts.filter((p) => p.status === "ready" && !p.photos.length).length,
      askedForPhoto: posts.filter((p) => p.status === "ready" && !p.photos.length && p.photoHelpAt).length,
      measured: posts.filter(measured).length,
    },
    weekly, kinds,
    fellows: cal.fellows.map((f) => {
      const up = f.posts.filter(isPosted), m = up.filter(measured);
      const best = m.length ? m.reduce((a, b) => (imp(b) > imp(a) ? b : a)) : null;
      return {
        id: f.id, name: f.name, college: f.college, field: f.field, cohort: f.cohort, status: f.status, joined: f.joined,
        connectionsAtJoin: f.connectionsAtJoin, connections: f.connections, standing: f.standing,
        posted: up.length, measured: m.length, avg: m.length ? Math.round(m.reduce((s, p) => s + imp(p), 0) / m.length) : 0,
        best: best ? { title: best.title, impressions: imp(best), url: best.url } : null,
        lastPosted: up.map(postedOn).filter((d): d is string => !!d).sort().pop() ?? null,
        scheduled: f.posts.filter((p) => p.status === "ready" && p.due >= today).length,
        drafts: f.drafts.length, stories: f.stories, earlierPosts: f.earlierPosts,
      };
    }),
  };
}

/** One fellow's stories, earlier posts and weekly LinkedIn analytics, for their drawer. */
export async function fellowExtras(id: number) {
  await ensureCreatorTables();
  const f = await fellow(id);
  const app = f ? await applicationOf(f.applicationId) : null;
  return { stories: await storiesOf(id), earlierPosts: await earlierPostsOf(id), applicationNotes: String(app?.team_notes ?? ""), weeks: await weeklyAnalyticsOf(id, 8) };
}

// ---------------------------------------------------------------------------
// Weekly LinkedIn analytics: one row per upload (studojo.com parses it), newest per period kept.

type Num = Record<string, number>;
export interface AnalyticsWeek {
  id: number; file: string; uploadedAt: string; periodStart: string | null; periodEnd: string | null;
  totals: Num;
  daily: Record<string, string | number>[];
  posts: { url: string | null; publishedOn: string | null; impressions: number | null; engagements: number | null; postId: number | null }[];
  demographics: Record<string, { value: string; pct: number }[]>;
}
const numbersOf = (v: unknown): Num => Object.fromEntries(Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).filter(([, n]) => typeof n === "number" && Number.isFinite(n))) as Num;
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
function weekOfRow(r: Record<string, unknown>): AnalyticsWeek | null {
  const d = jsonOf<Record<string, unknown> | null>(r.data, null);
  if (!d || typeof d !== "object" || !isAnalyticsRef(r.file_url)) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
  const demographics: AnalyticsWeek["demographics"] = {};
  for (const [k, rows] of Object.entries((d.demographics as Record<string, unknown>) ?? {})) {
    demographics[k] = list(rows).filter((x) => typeof x.value === "string" && typeof x.pct === "number").map((x) => ({ value: x.value as string, pct: x.pct as number }));
  }
  return {
    id: Number(r.id), file: String(r.file_url), uploadedAt: iso(r.uploaded_at) ?? "",
    periodStart: (r.period_start as string) ?? null, periodEnd: (r.period_end as string) ?? null,
    totals: numbersOf(d.totals),
    daily: list(d.daily).filter((x) => typeof x.date === "string").map((x) => ({ ...numbersOf(x), date: x.date as string })),
    posts: list(d.posts).map((x) => ({
      url: typeof x.url === "string" ? x.url : null, publishedOn: typeof x.publishedOn === "string" ? x.publishedOn : null,
      impressions: numOrNull(x.impressions), engagements: numOrNull(x.engagements), postId: numOrNull(x.postId),
    })),
    demographics,
  };
}
/** A fellow's newest uploads, one per period (the newest upload wins when a week is uploaded twice), newest week first. */
async function weeklyAnalyticsOf(id: number, limit: number, ex: Exec = db): Promise<AnalyticsWeek[]> {
  const rows = (await ex.execute(sql`
    SELECT DISTINCT ON (COALESCE(period_end::text, id::text)) id, file_url, to_char(period_start, 'YYYY-MM-DD') AS period_start,
      to_char(period_end, 'YYYY-MM-DD') AS period_end, data, uploaded_at
    FROM ugc_creator_analytics WHERE creator_id = ${id}
    ORDER BY COALESCE(period_end::text, id::text), uploaded_at DESC
  `)).rows as Record<string, unknown>[];
  return rows.map(weekOfRow).filter((w): w is AnalyticsWeek => !!w)
    .sort((a, b) => String(b.periodEnd ?? b.uploadedAt).localeCompare(String(a.periodEnd ?? a.uploadedAt))).slice(0, limit);
}

// ---------------------------------------------------------------------------
// What Claude Code reads (/api/agent)
// ---------------------------------------------------------------------------

/** The roster: names, ids, the days already taken. No personal details. */
export async function agentRoster() {
  await ensureCreatorTables();
  const today = istDate();
  const [fs, posts, drafts, rules] = await Promise.all([fellows(), postsOf(null), draftsOf(null), programmeRules()]);
  return {
    today,
    programme: { postingDays: rules.postingDays, postsPerWeek: rules.postsPerWeek, studojoPerWeek: studojoPerWeek(rules) },
    fellows: fs.filter((f) => f.status !== "removed").map((f) => {
      const ps = posts.filter((p) => p.creatorId === f.id), ds = drafts.filter((d) => d.creatorId === f.id);
      return {
        id: f.id, name: f.name, college: f.college, field: f.field, cohort: f.cohort, paused: f.status === "paused", joined: f.joined,
        waitingForReview: ds.filter((d) => d.status === "review").length, sentBack: ds.filter((d) => d.status === "changes").length,
        approvedNotUpYet: ps.filter((p) => p.status === "ready").length, posted: ps.filter(isPosted).length,
        takenDays: [...ps.map((p) => p.due), ...ds.map((d) => d.due)].filter((d) => d >= today).sort(),
      };
    }),
  };
}

// Application answers Claude may use. Contact details are never sent.
// team_notes here are the team's notes from calls at the application stage (before they became a fellow).
const APPLICATION_FIELDS = ["course", "year_of_study", "graduation_year", "field", "target_roles", "dream_companies", "looking_for",
  "topics", "avoid_topics", "story_work", "story_setback", "story_lesson", "tone", "why_join", "fellowship_goals",
  "best_post_url", "post_frequency", "last_posted", "crossed_1k", "connections", "can_commit", "studojo_ok", "team_notes"];

async function applicationOf(applicationId: number | null) {
  if (!applicationId) return null;
  const cols = ((await db.execute(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'ugc_applications'
  `)).rows as { column_name: string }[]).map((r) => r.column_name).filter((c) => APPLICATION_FIELDS.includes(c));
  if (!cols.length) return null;
  const r = (await db.execute(sql`SELECT ${sql.raw(cols.map((c) => `"${c}"`).join(", "))} FROM ugc_applications WHERE id = ${applicationId}`)).rows[0];
  return (r as Record<string, unknown>) ?? null;
}

function agentPost(p: Post, own: Post[], all: Post[]) {
  // Only posts that came through the review flow carry Claude's original (a blocked hand-written post has review.blocked only).
  const r = p.review && p.review.claudeBody != null ? p.review : null;
  return {
    id: p.id, title: p.title, body: p.body, kind: p.kind, due: p.due, status: p.status, copied: !!p.copiedAt,
    postedOn: p.postedAt ? istDate(p.postedAt) : null, url: p.url, fellowsOwnLine: p.ownLine,
    numbers: p.impressions != null ? { impressions: p.impressions, reactions: p.reactions, comments: p.comments, reportedOn: p.metricsAt ? istDate(p.metricsAt) : null } : null,
    verdict: verdictOf(p, own, all), insight: p.insight,
    // The fellow's LinkedIn export: every metric LinkedIn gave, and who saw it (top 5 of each kind).
    analytics: p.analytics ? {
      uploadedOn: p.analytics.uploadedAt ? istDate(p.analytics.uploadedAt) : null, metrics: p.analytics.metrics,
      whoSawIt: Object.fromEntries(Object.entries(p.analytics.demographics).map(([k, rows]) => [k, rows.slice(0, 5).map((r) => `${r.value} ${Math.round(r.pct * 1000) / 10}%`)])),
    } : null,
    photoIdea: p.photoIdea,
    photos: { added: p.photos.length, byTeam: p.photos.filter((x) => p.review?.teamPhotos?.includes(x)).length, fellowHadNone: !!p.photoHelpAt || p.photos.some((x) => p.review?.teamPhotos?.includes(x)) },
    // What the team changed before approving: the best signal for how to write the next one.
    whatClaudeWrote: !r ? "written by the team" : r.editedByTeam ? { title: r.claudeTitle, body: r.claudeBody } : "approved exactly as Claude wrote it",
    feedbackGiven: r ? r.feedback.map((f) => f.text) : [],
  };
}
export const agentDraft = (d: Draft) => ({
  id: d.id, title: d.title, body: d.body, kind: d.kind, due: d.due, angle: d.angle, photoIdea: d.photoIdea,
  status: d.status === "changes" ? "sent back with feedback" : "waiting for review", feedback: d.feedback, versions: d.versions.length,
});

// One fellow's context is capped, so it stays readable however much they tell us:
// a fellow can talk to their page for hours (30 stories a day, up to 8,000
// characters each), and over twelve weeks their posts pile up too. Claude gets
// the newest stories in full up to STORY_BUDGET characters and can open the
// rest page by page; the newest posts in full and the rest as one line each.
// The repeat check on drafts still compares against everything (checkContext).
const STORY_BUDGET = 30_000;
const OLDER_LISTED = 60;
const RECENT_POSTS = 12;
const RECENT_EARLIER = 10;
// The longest text sent as one string. Longer text goes as a list of lines,
// because file readers cut very long lines and a spoken story has no breaks.
const LINE = 1_500;

type Story = Awaited<ReturnType<typeof storiesOf>>[number];

/** Long text as a list of lines of at most LINE characters, split at line breaks, then sentence ends, then spaces. */
export function asLines(text: string): string | string[] {
  if (text.length <= LINE) return text;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    let rest = line;
    while (rest.length > LINE) {
      const head = rest.slice(0, LINE);
      const cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
      const at = cut > LINE / 3 ? cut + 1 : head.lastIndexOf(" ") > LINE / 3 ? head.lastIndexOf(" ") : LINE;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trimStart();
    }
    out.push(rest);
  }
  return out;
}
/** Every string in a value, long ones as lists of lines. */
function readable(v: unknown): unknown {
  if (typeof v === "string") return asLines(v);
  if (Array.isArray(v)) return v.map(readable);
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, readable(x)]));
  return v;
}

/** Stories (newest first) in pages of at most STORY_BUDGET characters; a page always holds at least one story. */
export function storyPages<T extends { text: string }>(stories: T[]): T[][] {
  const pages: T[][] = [];
  let size = 0;
  for (const s of stories) {
    if (!pages.length || (pages[pages.length - 1].length && size + s.text.length > STORY_BUDGET)) { pages.push([]); size = 0; }
    pages[pages.length - 1].push(s);
    size += s.text.length;
  }
  return pages;
}
const agentStory = (s: Story) => ({
  id: s.id, asked: s.prompt, said: s.text, spoken: s.spoken, on: istDate(s.createdAt),
  ...(s.replyTo ? { answers: s.replyTo } : {}),
  ...(s.readBack ? { readBack: s.readBack } : {}),
});

/** One page of a fellow's stories in full, newest first (page 1 is the one in their context). */
export async function agentStories(id: number, page: number) {
  await ensureCreatorTables();
  const f = await fellow(id);
  if (!f || f.status === "removed") return null;
  const pages = storyPages(await storiesOf(id));
  return readable({ fellow: { id: f.id, name: f.name }, page, pages: pages.length, stories: (pages[page - 1] ?? []).map(agentStory) });
}

/** One fellow's context: the only student data Claude sees while writing for them. */
export async function agentFellow(id: number) {
  await ensureCreatorTables();
  const f = await fellow(id);
  if (!f || f.status === "removed") return null;
  const today = istDate();
  const [own, all, ds, stories, earlier, rules, pb, application, weeks] = await Promise.all([
    postsOf(id), postsOf(null), draftsOf(id), storiesOf(id), earlierPostsOf(id), programmeRules(), playbook(), applicationOf(f.applicationId), weeklyAnalyticsOf(id, 4),
  ]);
  const usual = (k?: Kind) => median(all.filter((p) => measured(p) && (!k || p.kind === k)).map(imp));
  const pages = storyPages(stories);
  const older = pages.slice(1).flatMap((ss, i) => ss.map((s) => ({ s, page: i + 2 })));
  const recentPosts = own.slice(-RECENT_POSTS), olderPosts = own.slice(0, -RECENT_POSTS);
  const recentEarlier = earlier.slice(-RECENT_EARLIER), olderEarlier = earlier.slice(0, -RECENT_EARLIER);
  return readable({
    today,
    howToRead: [
      "This file is capped so it stays readable however much the fellow tells us.",
      `Text longer than ${LINE.toLocaleString("en-US")} characters comes as a list of lines: read them in order as one text.`,
      `stories holds their newest stories in full. olderStories lists the rest with the page each is on: ./dash GET /fellows/${f.id}/stories/<page> reads a page in full. Open older pages when you need more material.`,
      `posts holds their newest ${RECENT_POSTS} posts in full and olderPosts the rest, one line each. earlierPosts and olderEarlierPosts work the same way.`,
      "weeklyAnalytics is their last 4 weekly LinkedIn exports, newest first: what their whole account did that week, day by day, and each post in it (ourPostId links it to posts).",
      "When you save drafts, the admin panel checks them for repeats against all of their posts, so you don't have to.",
      "Every draft needs photoIdea: one sentence on which of the fellow's own photos to post with it. No post goes up without a photo.",
      "A story's readBack is their page's quick read of one talk (covers lists the saved parts it read): usable is what can become a post, leaveOut is what to skip. answers names the story a follow-up answer belongs to. What they said wins over the readBack.",
    ],
    fellow: { id: f.id, name: f.name, firstName: f.first, college: f.college, field: f.field, cohort: f.cohort, paused: f.status === "paused", linkedin: f.linkedin, joined: f.joined, connectionsAtJoin: f.connectionsAtJoin },
    application,
    teamNotes: f.teamNotes,
    learnings: f.learnings,
    stories: (pages[0] ?? []).map(agentStory),
    olderStories: {
      count: older.length,
      pages: Math.max(0, pages.length - 1),
      list: older.slice(0, OLDER_LISTED).map(({ s, page }) => ({ id: s.id, page, on: istDate(s.createdAt), asked: s.prompt, opening: s.text.slice(0, 160) + (s.text.length > 160 ? "…" : "") })),
      notListed: Math.max(0, older.length - OLDER_LISTED),
    },
    // Their weekly LinkedIn exports, newest first: account totals, day by day, every post in the file
    // (ourPostId when it's one of theirs here) and who saw their content (top 5 of each kind).
    weeklyAnalytics: weeks.map((w) => ({
      period: `${w.periodStart ?? "?"} to ${w.periodEnd ?? "?"}`, uploadedOn: w.uploadedAt ? istDate(w.uploadedAt) : null,
      totals: w.totals, daily: w.daily,
      posts: w.posts.map((p) => ({ ourPostId: p.postId, publishedOn: p.publishedOn, impressions: p.impressions, engagements: p.engagements, url: p.url })),
      whoSaw: Object.fromEntries(Object.entries(w.demographics).map(([k, rows]) => [k, rows.slice(0, 5).map((r) => `${r.value} ${Math.round(r.pct * 1000) / 10}%`)])),
    })),
    earlierPosts: recentEarlier,
    olderEarlierPosts: {
      count: olderEarlier.length,
      list: olderEarlier.slice(-OLDER_LISTED).map((e) => ({ id: e.id, title: e.title, postedOn: e.posted_on, impressions: e.impressions, opening: e.body.slice(0, 120) + (e.body.length > 120 ? "…" : "") })),
    },
    posts: recentPosts.map((p) => agentPost(p, own, all)),
    olderPosts: olderPosts.map((p) => ({
      id: p.id, title: p.title, kind: p.kind, due: p.due, status: p.status, impressions: p.impressions,
      verdict: verdictOf(p, own, all)?.level ?? null, insight: p.insight ? p.insight.slice(0, 300) : null,
    })),
    drafts: ds.map(agentDraft),
    takenDays: [...own.map((p) => p.due), ...ds.map((d) => d.due)].filter((d) => d >= today).sort(),
    programme: {
      postingDays: rules.postingDays, postsPerWeek: rules.postsPerWeek, studojoPerWeek: studojoPerWeek(rules),
      postsWithNumbers: all.filter(measured).length, usualImpressions: usual(), usualStudojoPost: usual("studojo"), usualPersonalPost: usual("personal"),
    },
    playbook: pb.text,
  });
}

export async function agentFeedback() {
  await ensureCreatorTables();
  const [fs, ds] = await Promise.all([fellows(), draftsOf(null)]);
  const name = new Map(fs.map((f) => [f.id, f.name]));
  const out = ds.filter((d) => d.status === "changes").map((d) => ({
    fellow: { id: d.creatorId, name: name.get(d.creatorId) ?? "" }, ...agentDraft(d), openFeedback: d.feedback.filter((f) => !f.resolvedAt).map((f) => f.text),
  }));
  return { count: out.length, drafts: out };
}

export async function agentResults(pending: boolean) {
  await ensureCreatorTables();
  const [fs, all] = await Promise.all([fellows(), postsOf(null)]);
  const byFellow = new Map<number, Post[]>();
  for (const p of all) { if (!byFellow.has(p.creatorId)) byFellow.set(p.creatorId, []); byFellow.get(p.creatorId)!.push(p); }
  const meta = new Map(fs.map((f) => [f.id, f]));
  const out = all.filter((p) => measured(p) && (!pending || !p.insight)).map((p) => ({
    fellow: { id: p.creatorId, name: meta.get(p.creatorId)?.name ?? "", field: meta.get(p.creatorId)?.field ?? null },
    ...agentPost(p, byFellow.get(p.creatorId) ?? [], all),
  })).sort((a, b) => String(b.postedOn).localeCompare(String(a.postedOn)));
  return {
    posts: out, withoutInsight: out.filter((p) => !p.insight).length,
    postedStillWaitingForNumbers: all.filter((p) => isPosted(p) && p.impressions == null).length,
    studojoPostImpressions: all.filter((p) => isPosted(p) && p.kind === "studojo").reduce((s, p) => s + imp(p), 0),
    goal: (await programmeRules()).goal?.impressions ?? 1_000_000,
  };
}

export async function setInsight(postId: number, note: unknown) {
  const text = str(note, 1500);
  if (text.length < 10) throw new Refused("Send the note as text.");
  const r = (await db.execute(sql`
    UPDATE ugc_creator_posts SET insight = ${text}, insight_at = NOW() WHERE id = ${postId} AND status = 'posted' AND impressions IS NOT NULL RETURNING id
  `)).rows;
  if (!r.length) throw new Refused("No posted post with numbers has that id.", 404);
}

/** Adds Claude's notes from a call or the web app to the team's notes; never replaces them. */
export async function appendTeamNotes(fellowId: number, text: unknown) {
  const t = str(text, 6000);
  if (t.length < 10) throw new Refused("Send the notes as text.");
  const f = await fellow(fellowId);
  if (!f) throw new Refused("No fellow with that id.", 404);
  const next = [f.teamNotes.trim(), `Added by Claude on ${istDate()}:\n${t}`].filter(Boolean).join("\n\n").slice(0, 20000);
  await db.execute(sql`UPDATE ugc_creators SET team_notes = ${next} WHERE id = ${fellowId}`);
  return next;
}

export async function addEarlierPosts(fellowId: number, posts: unknown) {
  if (!Array.isArray(posts) || !posts.length || posts.length > 100) throw new Refused("Send between 1 and 100 posts as posts: [...].");
  const f = await fellow(fellowId);
  if (!f) throw new Refused("No fellow with that id.", 404);
  const have = (await earlierPostsOf(fellowId)).map((e) => runs(e.body));
  let added = 0, skipped = 0;
  for (const raw of posts as Record<string, unknown>[]) {
    const body = str(raw?.body, 6000);
    const r = runs(body);
    if (body.length < 40 || have.some((h) => overlap(r, h) >= 0.8)) { skipped++; continue; }
    const imps = raw?.impressions == null || raw.impressions === "" ? null : Number(raw.impressions);
    const url = str(raw?.url, 500);
    await db.execute(sql`
      INSERT INTO ugc_creator_earlier_posts (creator_id, title, body, posted_on, url, impressions)
      VALUES (${fellowId}, ${str(raw?.title, 140) || null}, ${body}, ${isDay(raw?.postedOn) ? raw.postedOn : null}::date,
              ${/^https?:\/\/(www\.)?linkedin\.com\//i.test(url) ? url : null}, ${Number.isFinite(imps) ? Math.max(0, Math.round(imps as number)) : null})
    `);
    have.push(r);
    added++;
  }
  return { added, skipped, earlierPosts: have.length };
}

export async function setLearnings(fellowId: number, text: unknown) {
  await db.execute(sql`UPDATE ugc_creators SET learnings = ${str(text, 6000)} WHERE id = ${fellowId}`);
}

export const HIRING = HIRING_PIPELINE;
