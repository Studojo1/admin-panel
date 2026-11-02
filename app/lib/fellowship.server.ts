import db from "~/lib/db.server";
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
// (/fellowship/calendar) and the connection Vanshika's Claude Code uses to
// write posts (/api/agent). Claude only ever writes drafts. A draft lives in
// ugc_creator_drafts, which no student query reads, and reaches a fellow's page
// only when someone on the team approves it.
//
// Dates: Postgres DATE values are read as text (to_char) so a due day never
// shifts with the server's time zone. Timestamps go out as ISO strings.

export const POST_MAX = 3000; // LinkedIn's limit for one post
const PARTNERSHIP = /in partnership with studojo|#partnership|#ad\b|#sponsored|paid partnership/i;
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
}
export interface Draft {
  id: number; creatorId: number; title: string; body: string; kind: Kind; due: string; angle: string;
  status: "review" | "changes"; batch: string | null; feedback: Feedback[]; versions: Version[]; createdAt: string; updatedAt: string;
}
export interface Post {
  id: number; creatorId: number; title: string; body: string; kind: Kind; due: string; status: string;
  copiedAt: string | null; ownLine: string | null; postedAt: string | null; url: string | null;
  impressions: number | null; reactions: number | null; comments: number | null; screenshot: string | null; metricsAt: string | null;
  review: Review | null; insight: string | null; insightAt: string | null; createdAt: string; createdBy: string | null;
}
export interface Fellow {
  id: number; name: string; first: string; slug: string | null; link: string | null; applicationId: number | null;
  college: string | null; field: string | null; cohort: string | null; status: string; email: string | null;
  whatsapp: string | null; linkedin: string | null; joined: string; connectionsAtJoin: number | null;
  learnings: string; teamNotes: string; nudgedAt: string | null;
  /** Admin-only: taken on as a Growth intern / referred to someone hiring (set on the applicant profile). */
  internAt: string | null; referredAt: string | null;
}
export interface PostInput { title?: unknown; body?: unknown; kind?: unknown; due?: unknown; angle?: unknown }

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
  };
}
function toDraft(r: Record<string, unknown>): Draft {
  return {
    id: Number(r.id), creatorId: Number(r.creator_id), title: String(r.title), body: String(r.body), kind: r.kind === "studojo" ? "studojo" : "personal",
    due: String(r.due), angle: String(r.angle ?? ""), status: r.status === "changes" ? "changes" : "review", batch: (r.batch as string) ?? null,
    feedback: jsonOf<Feedback[]>(r.feedback, []), versions: jsonOf<Version[]>(r.versions, []), createdAt: iso(r.created_at) ?? "", updatedAt: iso(r.updated_at) ?? "",
  };
}

const FELLOW_COLS = sql`id, application_id, slug, full_name, email, whatsapp, linkedin_url, college, field, cohort, status,
  connections_at_join, to_char(joined_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS joined_day, learnings, team_notes, nudged_at, intern_at, referred_at`;
const POST_COLS = sql`id, creator_id, title, body, kind, to_char(due_date, 'YYYY-MM-DD') AS due, status, copied_at, own_line, posted_at,
  post_url, impressions, reactions, comments, screenshot_url, metrics_at, review, insight, insight_at, created_at, created_by`;
const DRAFT_COLS = sql`id, creator_id, title, body, kind, to_char(due_date, 'YYYY-MM-DD') AS due, angle, status, batch, feedback, versions, created_at, updated_at`;

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
    ? sql`SELECT id, creator_id, prompt, text, spoken, created_at FROM ugc_creator_stories ORDER BY created_at DESC`
    : sql`SELECT id, creator_id, prompt, text, spoken, created_at FROM ugc_creator_stories WHERE creator_id = ${id} ORDER BY created_at DESC`;
  return (await ex.execute(q)).rows.map((r) => {
    const x = r as Record<string, unknown>;
    return { id: Number(x.id), creatorId: Number(x.creator_id), prompt: (x.prompt as string) ?? null, text: String(x.text), spoken: !!x.spoken, createdAt: iso(x.created_at) ?? "" };
  });
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
export function problemWith(x: { title: string; body: string; kind: string; due: string }, ctx: CheckContext, o: CheckOptions = {}): string | null {
  const name = x.title ? `"${x.title}"` : "A post";
  if (x.title.length < 2) return "Every post needs a short title.";
  if (x.body.length < (o.strict ? 80 : 20)) return `${name}: the post text is missing or too short.`;
  if (x.body.length > POST_MAX) return `${name} is ${x.body.length} characters. LinkedIn allows ${POST_MAX}.`;
  if (x.kind !== "studojo" && x.kind !== "personal") return `${name}: the type must be "studojo" or "personal".`;
  // A fellow gets free Studojo access, so a post about Studojo is an endorsement and has to say so.
  if (x.kind === "studojo" && !PARTNERSHIP.test(x.body)) return `${name}: Studojo posts must say they're a partnership. Add the line "In partnership with Studojo".`;
  if (!isDay(x.due)) return `${name}: the due date must be a date like 2026-11-03.`;
  if (!o.allowPast && x.due < ctx.today) return `${name}: ${x.due} has already passed.`;
  const extra = o.extra ?? [];
  const taken = ctx.own.some((p) => p.id !== o.skipId && p.due === x.due) || extra.some((p) => p.due === x.due);
  if (taken) return `${name}: ${ctx.fellow.name} already has a post due on ${x.due}. One post a day.`;
  if (o.strict) {
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
  return { title: str(x.title, 140), body: str(x.body, POST_MAX + 500), kind: String(x.kind ?? ""), due: String(x.due ?? ""), angle: str(x.angle, 800) };
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
        INSERT INTO ugc_creator_drafts (creator_id, title, body, kind, due_date, angle, status, batch, feedback, versions)
        VALUES (${fellowId}, ${x.title}, ${x.body}, ${x.kind}, ${x.due}::date, ${x.angle}, 'review', ${str(batch, 60) || null}, '[]'::jsonb, ${JSON.stringify(versions)}::jsonb)
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
    const x = readInput({ title: input.title ?? d.title, body: input.body ?? d.body, kind: input.kind ?? d.kind, due: input.due ?? d.due, angle: input.angle ?? d.angle });
    const ctx = (await checkContext(owner, tx))!;
    const err = problemWith(x, ctx, { skipId: `d${d.id}`, allowPast: x.due === d.due, strict: true });
    if (err) throw new Refused(err);
    const note = str(input.note, 800) || "Revised";
    const versions = [...d.versions];
    if (x.title !== d.title || x.body !== d.body) versions.push({ t: nowIso(), by: "claude", title: x.title, body: x.body, note });
    const feedback = d.feedback.map((f) => (f.resolvedAt ? f : { ...f, resolvedAt: nowIso(), reply: note }));
    await tx.execute(sql`
      UPDATE ugc_creator_drafts SET title = ${x.title}, body = ${x.body}, kind = ${x.kind}, due_date = ${x.due}::date, angle = ${x.angle},
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
  const x = readInput({ title: input.title ?? d.title, body: input.body ?? d.body, kind: input.kind ?? d.kind, due: input.due ?? d.due, angle: d.angle });
  if (opts.forApproval && x.due < istDate()) throw new Refused(`Its due date (${x.due}) has passed. Pick a new date, then approve.`);
  const ctx = (await checkContext(d.creatorId, tx))!;
  const err = problemWith(x, ctx, { skipId: `d${d.id}`, allowPast: x.due === d.due && !opts.forApproval });
  if (err) throw new Refused(err);
  const versions = [...d.versions];
  if (x.title !== d.title || x.body !== d.body) versions.push({ t: nowIso(), by: "team", title: x.title, body: x.body, note: `Edited by ${by}` });
  return { ...d, title: x.title, body: x.body, kind: x.kind as Kind, due: x.due, versions };
}

export async function saveDraft(draftId: number, input: PostInput, by: string) {
  const owner = await draftOwner(draftId);
  if (owner == null) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
  await forFellow(owner, async (tx) => {
    const d = await loadDraft(draftId, tx);
    if (!d) throw new Refused("That draft is gone: it was approved or removed. Refresh the page.", 404);
    const n = await teamEdit(tx, d, input, by);
    await tx.execute(sql`
      UPDATE ugc_creator_drafts SET title = ${n.title}, body = ${n.body}, kind = ${n.kind}, due_date = ${n.due}::date,
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
      UPDATE ugc_creator_drafts SET title = ${n.title}, body = ${n.body}, kind = ${n.kind}, due_date = ${n.due}::date, status = 'changes',
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
    INSERT INTO ugc_creator_posts (creator_id, title, body, kind, due_date, status, created_by, review)
    VALUES (${d.creatorId}, ${d.title}, ${d.body}, ${d.kind}, ${d.due}::date, 'ready', ${by}, ${JSON.stringify(review)}::jsonb)
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
    for (const d of ready) {
      if (d.kind === "studojo" && !PARTNERSHIP.test(d.body)) throw new Refused(`"${d.title}" is a Studojo post without "In partnership with Studojo". Add the line, then approve.`);
    }
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
  const firstJoin = live.map((f) => f.joined).filter(Boolean).sort()[0] ?? today;

  return {
    today, thisWeek, rules, playbook: pb, programmeStart: weekOf(firstJoin),
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

/** One fellow's stories and earlier posts, for their drawer. */
export async function fellowExtras(id: number) {
  await ensureCreatorTables();
  const f = await fellow(id);
  const app = f ? await applicationOf(f.applicationId) : null;
  return { stories: await storiesOf(id), earlierPosts: await earlierPostsOf(id), applicationNotes: String(app?.team_notes ?? "") };
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
    programme: { postingDays: rules.postingDays, postsPerWeek: rules.postsPerWeek, studojoPerWeek: studojoPerWeek(rules), partnershipLabel: rules.partnershipLabel },
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
    // What the team changed before approving: the best signal for how to write the next one.
    whatClaudeWrote: !r ? "written by the team" : r.editedByTeam ? { title: r.claudeTitle, body: r.claudeBody } : "approved exactly as Claude wrote it",
    feedbackGiven: r ? r.feedback.map((f) => f.text) : [],
  };
}
export const agentDraft = (d: Draft) => ({
  id: d.id, title: d.title, body: d.body, kind: d.kind, due: d.due, angle: d.angle,
  status: d.status === "changes" ? "sent back with feedback" : "waiting for review", feedback: d.feedback, versions: d.versions.length,
});

/** One fellow's full context: the only student data Claude sees while writing for them. */
export async function agentFellow(id: number) {
  await ensureCreatorTables();
  const f = await fellow(id);
  if (!f || f.status === "removed") return null;
  const today = istDate();
  const [own, all, ds, stories, earlier, rules, pb, application] = await Promise.all([
    postsOf(id), postsOf(null), draftsOf(id), storiesOf(id), earlierPostsOf(id), programmeRules(), playbook(), applicationOf(f.applicationId),
  ]);
  const usual = (k?: Kind) => median(all.filter((p) => measured(p) && (!k || p.kind === k)).map(imp));
  return {
    today,
    fellow: { id: f.id, name: f.name, firstName: f.first, college: f.college, field: f.field, cohort: f.cohort, paused: f.status === "paused", linkedin: f.linkedin, joined: f.joined, connectionsAtJoin: f.connectionsAtJoin },
    application,
    teamNotes: f.teamNotes,
    learnings: f.learnings,
    stories: stories.map((s) => ({ asked: s.prompt, said: s.text, spoken: s.spoken, on: istDate(s.createdAt) })),
    earlierPosts: earlier,
    posts: own.map((p) => agentPost(p, own, all)),
    drafts: ds.map(agentDraft),
    takenDays: [...own.map((p) => p.due), ...ds.map((d) => d.due)].filter((d) => d >= today).sort(),
    programme: {
      postingDays: rules.postingDays, postsPerWeek: rules.postsPerWeek, studojoPerWeek: studojoPerWeek(rules), partnershipLabel: rules.partnershipLabel,
      postsWithNumbers: all.filter(measured).length, usualImpressions: usual(), usualStudojoPost: usual("studojo"), usualPersonalPost: usual("personal"),
    },
    playbook: pb.text,
  };
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
