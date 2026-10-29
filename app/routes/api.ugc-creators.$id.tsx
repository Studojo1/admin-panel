import type { Route } from "./+types/api.ugc-creators.$id";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import {
  HIRING_PIPELINE,
  MILESTONES,
  creatorStats,
  ensureCreatorTables,
  studentLink,
  type PostRow,
} from "~/lib/ugc-creators.server";

// One creator (/ugc-creators/:id): their details, posts, stories and
// connections. POST is how the team writes their posts: add, edit or delete
// a post that hasn't gone out yet. Posted posts are the creator's record and
// are never changed here.

const KINDS = ["personal", "studojo"] as const;
const PARTNERSHIP_LABEL = /in partnership with studojo|#partnership|#ad\b|#sponsored|paid partnership/i;
const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

function validDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? null : v;
}

/** The post fields the team writes, validated. */
function postFields(body: Record<string, unknown>) {
  const title = text(body.title, 200);
  const postBody = text(body.body, 5000);
  const kind = (KINDS as readonly string[]).includes(String(body.kind)) ? String(body.kind) : null;
  const dueDate = validDate(body.dueDate);
  if (title.length < 2) return { error: "Give the post a short title." };
  if (postBody.length < 20) return { error: "The post text is too short." };
  if (!kind) return { error: "Pick whether it's their story or a Studojo post." };
  if (!dueDate) return { error: "Pick a due date." };
  // The creator gets free Studojo access, so a post about Studojo is an
  // endorsement and has to say so (ASCI influencer rules, CCPA guidelines).
  if (kind === "studojo" && !PARTNERSHIP_LABEL.test(postBody)) {
    return { error: 'Studojo posts must say they\'re a partnership. Add a line like "In partnership with Studojo".' };
  }
  return { title, body: postBody, kind, dueDate };
}

async function detail(id: number) {
  const creator = (await db.execute(sql`
    SELECT id, application_id, token, slug, full_name, email, whatsapp, linkedin_url, college, field, cohort,
           status, connections_at_join, joined_at, created_by, learnings
    FROM ugc_creators WHERE id = ${id}
  `)).rows[0] as Record<string, unknown> | undefined;
  if (!creator) return null;
  const posts = (await db.execute(sql`
    SELECT * FROM ugc_creator_posts WHERE creator_id = ${id} ORDER BY due_date DESC, id DESC
  `)).rows as unknown as PostRow[];
  const stories = (await db.execute(sql`
    SELECT id, prompt, text, spoken, created_at FROM ugc_creator_stories WHERE creator_id = ${id} ORDER BY created_at DESC
  `)).rows;
  const connections = (await db.execute(sql`
    SELECT connections, recorded_at FROM ugc_creator_connections WHERE creator_id = ${id} ORDER BY recorded_at
  `)).rows;
  const stats = creatorStats(posts);
  return {
    creator: { ...creator, link: studentLink(creator.slug as string | null) },
    posts,
    stories,
    connections,
    stats,
    milestones: [
      ...MILESTONES.map((m) => ({ ...m, reached: stats.completedWeeks >= m.weeks })),
      { ...HIRING_PIPELINE, weeks: null, reached: false },
    ],
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return unauthorized();
  await ensureCreatorTables();
  const id = parseId(params.id);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });
  const data = await detail(id);
  if (!data) return Response.json({ error: "Creator not found" }, { status: 404 });
  return Response.json(data);
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  await ensureCreatorTables();
  const id = parseId(params.id);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });
  const exists = (await db.execute(sql`SELECT 1 FROM ugc_creators WHERE id = ${id}`)).rows.length > 0;
  if (!exists) return Response.json({ error: "Creator not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });

  if (body.intent === "add-post") {
    const f = postFields(body);
    if ("error" in f) return Response.json({ error: f.error }, { status: 400 });
    await db.execute(sql`
      INSERT INTO ugc_creator_posts (creator_id, title, body, kind, due_date, created_by)
      VALUES (${id}, ${f.title}, ${f.body}, ${f.kind}, ${f.dueDate}::date, ${admin.email})
    `);
  } else if (body.intent === "update-post" || body.intent === "delete-post") {
    const postId = parseId(body.postId);
    if (!postId) return Response.json({ error: "Invalid post" }, { status: 400 });
    const post = (await db.execute(sql`
      SELECT status FROM ugc_creator_posts WHERE id = ${postId} AND creator_id = ${id}
    `)).rows[0] as { status: string } | undefined;
    if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
    if (post.status === "posted") {
      return Response.json({ error: "This post is already live on LinkedIn, so it can't be changed here." }, { status: 409 });
    }
    if (body.intent === "delete-post") {
      await db.execute(sql`DELETE FROM ugc_creator_posts WHERE id = ${postId} AND creator_id = ${id} AND status <> 'posted'`);
    } else {
      const f = postFields(body);
      if ("error" in f) return Response.json({ error: f.error }, { status: 400 });
      await db.execute(sql`
        UPDATE ugc_creator_posts
        SET title = ${f.title}, body = ${f.body}, kind = ${f.kind}, due_date = ${f.dueDate}::date, updated_at = NOW()
        WHERE id = ${postId} AND creator_id = ${id} AND status <> 'posted'
      `);
    }
  } else {
    return Response.json({ error: "Unknown intent" }, { status: 400 });
  }

  return Response.json(await detail(id));
}
